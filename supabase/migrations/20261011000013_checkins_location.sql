-- =====================================================================
-- TaskTeens launch safety — Phase 6: check-ins, optional live location, safety tick.
-- Location: optional, needs the teen to turn it on AND a linked parent to allow it.
-- Only the teen and linked parents can see it. One latest point per session; nothing kept
-- after the session ends (no movement history).
-- =====================================================================

alter table public.job_shifts add column if not exists missed_alerted_at timestamptz;

-- Window in which check-in / location are available: 30 min before start until 30 min after end.
create or replace function public.shift_window_open(s public.job_shifts) returns boolean
language sql stable as $$
  select now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '30 minutes';
$$;

create or replace function public.teen_checkin(p_shift uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.job_shifts%rowtype; a public.applications%rowtype; v_title text;
begin
  if p_kind not in ('arrived','finished') then raise exception 'Invalid check-in'; end if;
  select * into s from public.job_shifts where id = p_shift for update;
  if not found then raise exception 'Shift not found'; end if;
  select * into a from public.applications where id = s.application_id;
  if a.teen_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'confirmed' then raise exception 'This job is not confirmed' using errcode = 'P0001'; end if;
  if s.status not in ('scheduled','active','missed') then raise exception 'This shift is closed' using errcode = 'P0001'; end if;
  if not public.shift_window_open(s) then raise exception 'Check-in opens 30 minutes before the job starts' using errcode = 'P0001'; end if;
  if p_kind = 'finished' and not exists (select 1 from public.job_checkins where shift_id = s.id and kind = 'arrived') then
    raise exception 'Check in as arrived first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.job_checkins where shift_id = s.id and kind = p_kind) then return; end if;

  insert into public.job_checkins (shift_id, application_id, teen_id, kind) values (s.id, s.application_id, a.teen_id, p_kind);
  update public.job_shifts set status = case when p_kind = 'arrived' then 'active' else 'completed' end where id = s.id;
  select title into v_title from public.jobs where id = a.job_id;
  if p_kind = 'finished' then
    delete from public.location_current where session_id in (select id from public.location_sharing_sessions where shift_id = s.id and status = 'active');
    update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'checked_out' where shift_id = s.id and status = 'active';
  end if;
  -- A late arrival clears an open missed-check-in alert.
  if p_kind = 'arrived' then
    update public.safety_alerts set status = 'resolved', resolved_at = now(), resolution_note = 'Teen checked in'
     where shift_id = s.id and level = 'missed_checkin' and status = 'open';
  end if;
  perform public.notify_parents(a.teen_id, 'checkin',
    case p_kind when 'arrived' then 'Your teen checked in' else 'Your teen checked out' end,
    case p_kind when 'arrived' then 'Checked in at “' || v_title || '”.' else 'Checked out of “' || v_title || '”.' end,
    '/dashboard/parent/active', true);
  perform public.notify(a.employer_id, 'checkin', case p_kind when 'arrived' then 'Teen checked in' else 'Teen checked out' end,
    a.applicant_name || case p_kind when 'arrived' then ' checked in for “' else ' checked out of “' end || v_title || '”.', '/dashboard/employer/applications/' || a.id);
end $$;

-- ---------------------------------------------------------------------
-- Location sharing
-- ---------------------------------------------------------------------
create or replace function public.location_allowed(p_teen uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_teen_links l where l.teen_id = p_teen and l.status = 'active' and l.location_sharing_allowed)
     and public.teen_parent_confirmed(p_teen);
$$;

create or replace function public.start_location_sharing(p_shift uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.job_shifts%rowtype; a public.applications%rowtype; v_id uuid;
begin
  select * into s from public.job_shifts where id = p_shift;
  if not found then raise exception 'Shift not found'; end if;
  select * into a from public.applications where id = s.application_id;
  if a.teen_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'confirmed' or s.status not in ('scheduled','active','missed') then raise exception 'Location sharing is only for a confirmed job in progress' using errcode = 'P0001'; end if;
  if not public.shift_window_open(s) then raise exception 'Location sharing is available from 30 minutes before the job until 30 minutes after it ends' using errcode = 'P0001'; end if;
  if not public.location_allowed(a.teen_id) then raise exception 'Your parent or guardian has not allowed location sharing' using errcode = 'P0001'; end if;
  select id into v_id from public.location_sharing_sessions where shift_id = s.id and status = 'active' and ends_by > now();
  if v_id is not null then return v_id; end if;
  insert into public.location_sharing_sessions (shift_id, application_id, teen_id, ends_by)
  values (s.id, a.id, a.teen_id, s.ends_at + interval '30 minutes') returning id into v_id;
  perform public.log_event('location.start', 'location_session', v_id::text);
  perform public.notify_parents(a.teen_id, 'checkin', 'Live location turned on', 'Your teen started sharing their location for a job. It stops automatically when the job ends.', '/dashboard/parent/active', false);
  return v_id;
end $$;

-- Teen's browser sends its latest position. Returns false (and ends the session) once it has expired.
create or replace function public.update_location(p_session uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns boolean language plpgsql security definer set search_path = public as $$
declare ss public.location_sharing_sessions%rowtype;
begin
  select * into ss from public.location_sharing_sessions where id = p_session for update;
  if not found or ss.teen_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if ss.status <> 'active' then return false; end if;
  if ss.ends_by <= now() or not public.location_allowed(ss.teen_id) then
    delete from public.location_current where session_id = ss.id;
    update public.location_sharing_sessions set status = 'ended', ended_at = now(),
      end_reason = case when ss.ends_by <= now() then 'expired' else 'consent_revoked' end where id = ss.id;
    return false;
  end if;
  insert into public.location_current (session_id, teen_id, lat, lng, accuracy_m, recorded_at)
  values (ss.id, ss.teen_id, p_lat, p_lng, p_accuracy, now())
  on conflict (session_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, recorded_at = now();
  return true;
end $$;

create or replace function public.stop_location_sharing(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ss public.location_sharing_sessions%rowtype;
begin
  select * into ss from public.location_sharing_sessions where id = p_session for update;
  if not found or not (ss.teen_id = auth.uid() or public.is_parent_of(ss.teen_id)) then raise exception 'Not allowed'; end if;
  delete from public.location_current where session_id = ss.id;
  update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'teen_stopped' where id = ss.id and status = 'active';
  perform public.log_event('location.stop', 'location_session', p_session::text);
end $$;

-- Admin location access only while an alert or incident is open for that teen; always logged.
create or replace function public.admin_view_location(p_teen uuid, p_reason text)
returns table (lat double precision, lng double precision, accuracy_m real, recorded_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if not (exists (select 1 from public.safety_alerts where teen_id = p_teen and status = 'open')
          or exists (select 1 from public.incident_reports where teen_id = p_teen and status not in ('resolved','unsubstantiated','inconclusive'))) then
    raise exception 'Location is only available to administrators during an open safety alert or incident' using errcode = 'P0001';
  end if;
  perform public.log_event('location.admin_view', 'teen', p_teen::text, p_reason);
  return query select c.lat, c.lng, c.accuracy_m, c.recorded_at from public.location_current c
    join public.location_sharing_sessions s on s.id = c.session_id where c.teen_id = p_teen and s.status = 'active';
end $$;

-- ---------------------------------------------------------------------
-- Periodic safety tick (called by the dispatcher every minute)
-- ---------------------------------------------------------------------
create or replace function public.safety_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_expired int := 0; v_missed int := 0; v_alert uuid; v_title text;
begin
  -- 1) Expire location sessions past their end + grace. Nothing is kept.
  with gone as (
    update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'expired'
    where status = 'active' and ends_by <= now() returning id)
  delete from public.location_current where session_id in (select id from gone);
  get diagnostics v_expired = row_count;

  -- 2) Missed check-ins: 15 minutes after start with no arrival.
  for r in select s.*, a.teen_id, a.employer_id, a.job_id from public.job_shifts s join public.applications a on a.id = s.application_id
           where s.status = 'scheduled' and s.missed_alerted_at is null and s.starts_at + interval '15 minutes' <= now()
             and s.ends_at > now() - interval '2 hours' and a.status = 'confirmed'
             and not exists (select 1 from public.job_checkins c where c.shift_id = s.id and c.kind = 'arrived') loop
    update public.job_shifts set missed_alerted_at = now(), status = 'missed' where id = r.id;
    insert into public.job_checkins (shift_id, application_id, teen_id, kind) values (r.id, r.application_id, r.teen_id, 'missed');
    insert into public.safety_alerts (teen_id, application_id, shift_id, employer_id, level)
    values (r.teen_id, r.application_id, r.id, r.employer_id, 'missed_checkin') returning id into v_alert;
    select title into v_title from public.jobs where id = r.job_id;
    perform public.notify_ex(l.parent_id, 'missed_checkin', 'Missed check-in',
      'Your teen hasn''t checked in for “' || v_title || '”, which started 15 minutes ago. Try calling them. If you believe they are in danger, call 911.',
      '/dashboard/parent/active', true, true, 'high', v_alert)
    from public.parent_teen_links l where l.teen_id = r.teen_id and l.status = 'active';
    perform public.notify(r.teen_id, 'missed_checkin', 'Did you check in?', 'You haven''t checked in for “' || v_title || '”. Check in now so your parent knows you arrived.', '/dashboard/teen/active');
    v_missed := v_missed + 1;
  end loop;
  return jsonb_build_object('expired_sessions', v_expired, 'missed_checkins', v_missed);
end $$;

-- Parent closes a missed-check-in alert once they've reached their teen.
create or replace function public.parent_resolve_alert(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare al public.safety_alerts%rowtype;
begin
  select * into al from public.safety_alerts where id = p_alert for update;
  if not found or not public.is_parent_of(al.teen_id) then raise exception 'Not allowed'; end if;
  if al.status <> 'open' then return; end if;
  update public.safety_alerts set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = nullif(left(trim(coalesce(p_note,'')),500),'') where id = p_alert;
  perform public.log_event('alert.resolve', 'safety_alert', p_alert::text, p_note);
end $$;

-- Teen/parent view of today's confirmed shifts (with latest check-in and sharing state).
create or replace function public.active_jobs()
returns table (shift_id uuid, application_id uuid, teen_id uuid, teen_name text, job_title text, employer_name text,
               starts_at timestamptz, ends_at timestamptz, shift_status text, arrived_at timestamptz, finished_at timestamptz,
               window_open boolean, location_allowed boolean, session_id uuid, session_ends_by timestamptz, open_alert_id uuid, open_alert_level text)
language sql stable security definer set search_path = public as $$
  select s.id, a.id, a.teen_id, a.applicant_name, j.title, e.display_name, s.starts_at, s.ends_at, s.status,
         (select min(c.created_at) from public.job_checkins c where c.shift_id = s.id and c.kind = 'arrived'),
         (select min(c.created_at) from public.job_checkins c where c.shift_id = s.id and c.kind = 'finished'),
         public.shift_window_open(s), public.location_allowed(a.teen_id),
         (select ls.id from public.location_sharing_sessions ls where ls.shift_id = s.id and ls.status = 'active' and ls.ends_by > now() limit 1),
         (select ls.ends_by from public.location_sharing_sessions ls where ls.shift_id = s.id and ls.status = 'active' and ls.ends_by > now() limit 1),
         (select al.id from public.safety_alerts al where al.shift_id = s.id and al.status = 'open' order by al.created_at desc limit 1),
         (select al.level from public.safety_alerts al where al.shift_id = s.id and al.status = 'open' order by al.created_at desc limit 1)
  from public.job_shifts s
  join public.applications a on a.id = s.application_id
  join public.jobs j on j.id = a.job_id
  join public.employer_profiles e on e.user_id = a.employer_id
  where a.status = 'confirmed' and s.status <> 'cancelled'
    and s.ends_at > now() - interval '12 hours' and s.starts_at < now() + interval '7 days'
    and (a.teen_id = auth.uid() or public.is_parent_of(a.teen_id))
  order by s.starts_at;
$$;

revoke execute on function public.shift_window_open(public.job_shifts) from public, anon, authenticated;
revoke execute on function public.location_allowed(uuid) from public, anon;
revoke execute on function public.safety_tick() from public, anon, authenticated;
grant execute on function public.safety_tick() to service_role;
revoke execute on function public.teen_checkin(uuid, text) from public, anon;
revoke execute on function public.start_location_sharing(uuid) from public, anon;
revoke execute on function public.update_location(uuid, double precision, double precision, real) from public, anon;
revoke execute on function public.stop_location_sharing(uuid) from public, anon;
revoke execute on function public.admin_view_location(uuid, text) from public, anon;
revoke execute on function public.parent_resolve_alert(uuid, text) from public, anon;
revoke execute on function public.active_jobs() from public, anon;
grant execute on function public.teen_checkin(uuid, text) to authenticated;
grant execute on function public.start_location_sharing(uuid) to authenticated;
grant execute on function public.update_location(uuid, double precision, double precision, real) to authenticated;
grant execute on function public.stop_location_sharing(uuid) to authenticated;
grant execute on function public.admin_view_location(uuid, text) to authenticated;
grant execute on function public.parent_resolve_alert(uuid, text) to authenticated;
grant execute on function public.active_jobs() to authenticated;
grant execute on function public.location_allowed(uuid) to authenticated;
