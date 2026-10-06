-- =====================================================================
-- TaskTeens launch safety — Phase 7: teen SOS ("I feel unsafe" / emergency), temporary restrictions.
--
-- What this does and does not do:
--   * An emergency alert lets the app open the phone's call screen with 911 entered. TaskTeens cannot
--     place the call and never records that 911 was reached — only that the call screen was opened.
--   * Alerts go to linked parents (in-app, email, and SMS where configured) and to administrators.
--   * Employers can never read safety alerts. An emergency tied to a job temporarily restricts that
--     employer until an administrator reviews it; the employer is not told why until an admin sends
--     a neutral notice.
-- =====================================================================

alter table public.safety_alerts add column if not exists teen_note text check (char_length(teen_note) <= 500);
alter table public.safety_alerts add column if not exists teen_says_safe_at timestamptz;
alter table public.account_restrictions add column if not exists notice_text text;

-- Active administrators (for alert fan-out).
create or replace function public.active_admin_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where role = 'admin' and status = 'active';
$$;
revoke execute on function public.active_admin_ids() from public, anon, authenticated;

-- Internal: create a temporary restriction (idempotent per user + alert).
create or replace function public.restrict_user_internal(p_user uuid, p_reason text, p_by uuid, p_by_role text,
                                                         p_alert uuid default null, p_incident uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_alert is not null then
    select id into v_id from public.account_restrictions where user_id = p_user and related_alert_id = p_alert and status = 'active';
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.account_restrictions (user_id, kind, reason, related_alert_id, related_incident_id, created_by, created_by_role)
  values (p_user, 'temporary', left(p_reason, 1000), p_alert, p_incident, p_by, p_by_role)
  returning id into v_id;
  -- A restricted employer's listings stop accepting applications; open, unconfirmed applications are left
  -- as they are so nothing is lost, and the parent approval step already refuses restricted employers.
  perform public.log_event('restriction.create', 'user', p_user::text, p_reason,
                           jsonb_build_object('restriction_id', v_id, 'alert_id', p_alert, 'incident_id', p_incident, 'by_role', p_by_role));
  return v_id;
end $$;
revoke execute on function public.restrict_user_internal(uuid, text, uuid, text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Teen raises an alert.
--   p_level: 'unsafe' (I feel unsafe) or 'emergency'.
--   p_application: optional confirmed job this is about; defaults to the teen's job happening now.
-- ---------------------------------------------------------------------
create or replace function public.raise_safety_alert(p_level text, p_application uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_teen uuid := auth.uid(); a public.applications%rowtype; v_shift uuid; v_alert uuid; v_loc jsonb;
        v_name text; v_title text; v_where text; v_recent uuid; r record;
begin
  if v_teen is null or not exists (select 1 from public.users where id = v_teen and role = 'teen') then
    raise exception 'Only teen accounts can send a safety alert';
  end if;
  if p_level not in ('unsafe','emergency') then raise exception 'Invalid alert level'; end if;

  -- Rapid repeat taps: return the alert that's already open (an emergency upgrades an open "unsafe").
  select id into v_recent from public.safety_alerts
   where teen_id = v_teen and status = 'open' and level in ('unsafe','emergency') and created_at > now() - interval '10 minutes'
     and (level = p_level or p_level = 'unsafe')
   order by created_at desc limit 1;
  if v_recent is not null then return v_recent; end if;

  if p_application is not null then
    select * into a from public.applications where id = p_application and teen_id = v_teen;
    if not found then raise exception 'Not allowed'; end if;
  else
    -- The confirmed job whose window is open right now (if any).
    select ap.* into a from public.job_shifts s join public.applications ap on ap.id = s.application_id
     where ap.teen_id = v_teen and ap.status = 'confirmed' and s.status <> 'cancelled' and public.shift_window_open(s)
     order by s.starts_at limit 1;
  end if;
  if a.id is not null then
    select s.id into v_shift from public.job_shifts s where s.application_id = a.id and s.status <> 'cancelled'
     order by abs(extract(epoch from (s.starts_at - now()))) limit 1;
  end if;

  -- Snapshot the teen's last shared position, if they are sharing right now. Kept with the alert record.
  select jsonb_build_object('lat', c.lat, 'lng', c.lng, 'accuracy_m', c.accuracy_m, 'recorded_at', c.recorded_at) into v_loc
    from public.location_current c join public.location_sharing_sessions ss on ss.id = c.session_id
   where c.teen_id = v_teen and ss.status = 'active' order by c.recorded_at desc limit 1;

  insert into public.safety_alerts (teen_id, application_id, shift_id, employer_id, level, last_location, teen_note)
  values (v_teen, a.id, v_shift, a.employer_id, p_level, v_loc, nullif(left(trim(coalesce(p_note,'')), 500), ''))
  returning id into v_alert;

  -- Freeze the job's conversation and status while this is reviewed.
  if a.id is not null then
    perform set_config('taskteens.rpc', 'on', true);
    update public.applications set incident_open = true where id = a.id;
    perform set_config('taskteens.rpc', '', true);
  end if;
  -- An emergency during a job temporarily restricts that employer until an administrator reviews it.
  if p_level = 'emergency' and a.employer_id is not null then
    perform public.restrict_user_internal(a.employer_id, 'Automatic: emergency alert from a teen on this employer''s job (pending admin review)',
                                          null, 'system', v_alert, null);
  end if;

  select coalesce(nullif(t.display_name,''), nullif(u.full_name,'')) into v_name from public.users u left join public.teen_profiles t on t.user_id = u.id where u.id = v_teen;
  v_name := split_part(coalesce(v_name, 'Your teen'), ' ', 1);
  if a.job_id is not null then select title into v_title from public.jobs where id = a.job_id; end if;
  v_where := case when v_title is not null then ' during “' || v_title || '”' else '' end;

  for r in select parent_id from public.parent_teen_links where teen_id = v_teen and status = 'active' loop
    perform public.notify_ex(r.parent_id, case when p_level = 'emergency' then 'emergency' else 'safety_alert' end,
      case when p_level = 'emergency' then 'EMERGENCY: ' || v_name || ' pressed the emergency button' else v_name || ' says they feel unsafe' end,
      case when p_level = 'emergency'
        then v_name || ' pressed the emergency button' || v_where || '. Call them now. If you believe they are in danger, call 911 — TaskTeens cannot call 911 for you.'
        else v_name || ' said they feel unsafe' || v_where || '. Call them now. If you believe they are in danger, call 911.' end
        || case when v_loc is not null then ' Their last shared location is on your Active jobs page.' else '' end,
      '/dashboard/parent/active', true, true, case when p_level = 'emergency' then 'emergency' else 'high' end, v_alert);
  end loop;
  for r in select public.active_admin_ids() as id loop
    perform public.notify_ex(r.id, case when p_level = 'emergency' then 'emergency' else 'safety_alert' end,
      case when p_level = 'emergency' then 'Emergency alert from a teen' else 'Teen safety alert (unsafe)' end,
      'A teen raised a safety alert' || v_where || '. Review it now.', '/admin/safety', true, false,
      case when p_level = 'emergency' then 'emergency' else 'high' end, v_alert);
  end loop;

  perform public.log_event('alert.raise', 'safety_alert', v_alert::text, null, jsonb_build_object('level', p_level, 'application_id', a.id));
  return v_alert;
end $$;

-- The app opened the phone's call screen for 911. Whether a call was placed is NOT known and never recorded.
create or replace function public.alert_call_screen_opened(p_alert uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.safety_alerts set call_screen_requested = true where id = p_alert and teen_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  perform public.log_event('alert.call_screen_opened', 'safety_alert', p_alert::text);
end $$;

-- The teen says they're safe now. This tells their parent; the alert stays open until a parent or admin closes it.
create or replace function public.teen_mark_safe(p_alert uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare al public.safety_alerts%rowtype; v_name text;
begin
  select * into al from public.safety_alerts where id = p_alert for update;
  if not found or al.teen_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if al.status <> 'open' or al.teen_says_safe_at is not null then return; end if;
  update public.safety_alerts set teen_says_safe_at = now(),
         teen_note = coalesce(nullif(left(trim(coalesce(p_note,'')), 500), ''), teen_note) where id = p_alert;
  select split_part(coalesce(nullif(t.display_name,''), nullif(u.full_name,''), 'Your teen'), ' ', 1) into v_name
    from public.users u left join public.teen_profiles t on t.user_id = u.id where u.id = al.teen_id;
  perform public.notify_ex(l.parent_id, 'safety_alert', v_name || ' says they are safe now',
    v_name || ' tapped "I''m safe now" on their alert. Please confirm with them directly, then close the alert on your Active jobs page.',
    '/dashboard/parent/active', true, true, 'high', p_alert)
  from public.parent_teen_links l where l.teen_id = al.teen_id and l.status = 'active';
  perform public.log_event('alert.teen_safe', 'safety_alert', p_alert::text, p_note);
end $$;

-- Parent closes an alert. For unsafe/emergency alerts, admins are told; restrictions and the job's
-- frozen conversation stay in place until an administrator reviews them.
create or replace function public.parent_resolve_alert(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare al public.safety_alerts%rowtype; r record;
begin
  select * into al from public.safety_alerts where id = p_alert for update;
  if not found or not public.is_parent_of(al.teen_id) then raise exception 'Not allowed'; end if;
  if al.status <> 'open' then return; end if;
  update public.safety_alerts set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = nullif(left(trim(coalesce(p_note,'')),500),'') where id = p_alert;
  perform public.log_event('alert.resolve', 'safety_alert', p_alert::text, p_note);
  if al.level in ('unsafe','emergency') then
    perform public.notify(al.teen_id, 'emergency_resolved', 'Your alert was closed', 'Your parent closed your safety alert.', '/dashboard/teen/help');
    for r in select public.active_admin_ids() as id loop
      perform public.notify(r.id, 'emergency_resolved', 'A parent closed a teen safety alert',
        'The parent marked the alert resolved. Review any restriction or frozen job.', '/admin/safety');
    end loop;
  end if;
end $$;

-- What the teen sees about their own open alerts (with honest delivery status to parents).
create or replace function public.my_open_alerts()
returns table (id uuid, level text, created_at timestamptz, job_title text, call_screen_requested boolean, teen_says_safe_at timestamptz,
               parents_notified int, deliveries_sent int, deliveries_pending int, deliveries_failed int, deliveries_skipped int)
language sql stable security definer set search_path = public as $$
  select al.id, al.level, al.created_at, j.title, al.call_screen_requested, al.teen_says_safe_at,
         (select count(*)::int from public.parent_teen_links l where l.teen_id = al.teen_id and l.status = 'active'),
         (select count(*)::int from public.notification_deliveries d join public.parent_teen_links l on l.parent_id = d.user_id and l.teen_id = al.teen_id where d.safety_alert_id = al.id and d.status = 'sent'),
         (select count(*)::int from public.notification_deliveries d join public.parent_teen_links l on l.parent_id = d.user_id and l.teen_id = al.teen_id where d.safety_alert_id = al.id and d.status in ('pending','sending')),
         (select count(*)::int from public.notification_deliveries d join public.parent_teen_links l on l.parent_id = d.user_id and l.teen_id = al.teen_id where d.safety_alert_id = al.id and d.status = 'failed'),
         (select count(*)::int from public.notification_deliveries d join public.parent_teen_links l on l.parent_id = d.user_id and l.teen_id = al.teen_id where d.safety_alert_id = al.id and d.status = 'skipped')
  from public.safety_alerts al
  left join public.applications a on a.id = al.application_id
  left join public.jobs j on j.id = a.job_id
  where al.teen_id = auth.uid() and al.status = 'open' and al.level in ('unsafe','emergency')
  order by al.created_at desc;
$$;

-- Parents see their teens' open unsafe/emergency alerts even when no job is active.
create or replace function public.parent_open_alerts()
returns table (id uuid, teen_id uuid, teen_name text, level text, created_at timestamptz, job_title text, teen_note text,
               teen_says_safe_at timestamptz, call_screen_requested boolean, last_location jsonb, teen_phone text)
language sql stable security definer set search_path = public as $$
  select al.id, al.teen_id, coalesce(nullif(t.display_name,''), u.full_name), al.level, al.created_at, j.title, al.teen_note,
         al.teen_says_safe_at, al.call_screen_requested, al.last_location, u.phone
  from public.safety_alerts al
  join public.users u on u.id = al.teen_id
  left join public.teen_profiles t on t.user_id = al.teen_id
  left join public.applications a on a.id = al.application_id
  left join public.jobs j on j.id = a.job_id
  where al.status = 'open' and al.level in ('unsafe','emergency') and public.is_parent_of(al.teen_id)
  order by al.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- Administrators
-- ---------------------------------------------------------------------
create or replace function public.admin_safety_alerts(p_include_resolved boolean default false)
returns table (id uuid, level text, status text, created_at timestamptz, resolved_at timestamptz, resolution_note text,
               teen_id uuid, teen_name text, teen_phone text, parent_contacts jsonb,
               employer_id uuid, employer_name text, employer_restricted boolean,
               application_id uuid, job_title text, teen_note text, teen_says_safe_at timestamptz,
               call_screen_requested boolean, has_location_snapshot boolean, incident_open boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select al.id, al.level, al.status, al.created_at, al.resolved_at, al.resolution_note,
         al.teen_id, coalesce(nullif(t.display_name,''), u.full_name), u.phone,
         (select coalesce(jsonb_agg(jsonb_build_object('name', pp.display_name, 'email', pu.email, 'phone', pp.phone_e164)), '[]'::jsonb)
            from public.parent_teen_links l join public.users pu on pu.id = l.parent_id
            left join public.parent_profiles pp on pp.user_id = l.parent_id
           where l.teen_id = al.teen_id and l.status = 'active'),
         al.employer_id, e.display_name, coalesce(public.is_restricted(al.employer_id), false),
         al.application_id, j.title, al.teen_note, al.teen_says_safe_at,
         al.call_screen_requested, al.last_location is not null, coalesce(a.incident_open, false)
  from public.safety_alerts al
  join public.users u on u.id = al.teen_id
  left join public.teen_profiles t on t.user_id = al.teen_id
  left join public.employer_profiles e on e.user_id = al.employer_id
  left join public.applications a on a.id = al.application_id
  left join public.jobs j on j.id = a.job_id
  where al.level in ('unsafe','emergency','missed_checkin') and (p_include_resolved or al.status = 'open')
  order by (al.status = 'open') desc, (al.level = 'emergency') desc, al.created_at desc
  limit 200;
end $$;

-- The location snapshot stored with an alert. Every view is logged with a reason.
create or replace function public.admin_alert_location(p_alert uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select last_location into v from public.safety_alerts where id = p_alert;
  perform public.log_event('alert.location_view', 'safety_alert', p_alert::text, p_reason);
  return v;
end $$;

create or replace function public.admin_resolve_alert(p_alert uuid, p_note text, p_unfreeze_job boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare al public.safety_alerts%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'A note is required'; end if;
  select * into al from public.safety_alerts where id = p_alert for update;
  if not found then raise exception 'Not found'; end if;
  update public.safety_alerts set status = 'resolved', resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, auth.uid()),
         resolution_note = left(trim(p_note), 500) where id = p_alert;
  if p_unfreeze_job and al.application_id is not null
     and not exists (select 1 from public.incident_reports r where r.application_id = al.application_id and r.status not in ('resolved','unsubstantiated','inconclusive'))
     and not exists (select 1 from public.safety_alerts s where s.application_id = al.application_id and s.status = 'open' and s.id <> al.id) then
    perform set_config('taskteens.rpc', 'on', true);
    update public.applications set incident_open = false where id = al.application_id;
    perform set_config('taskteens.rpc', '', true);
  end if;
  perform public.log_event('alert.admin_resolve', 'safety_alert', p_alert::text, p_note, jsonb_build_object('unfreeze_job', p_unfreeze_job));
end $$;

create or replace function public.admin_restrict_user(p_user uuid, p_reason text, p_alert uuid default null, p_incident uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if p_user = auth.uid() then raise exception 'You can''t restrict your own account'; end if;
  if exists (select 1 from public.users where id = p_user and role = 'admin') then raise exception 'Administrator accounts can''t be restricted here'; end if;
  return public.restrict_user_internal(p_user, trim(p_reason), auth.uid(), 'admin', p_alert, p_incident);
end $$;

-- Neutral notice to the restricted user. Never names who reported or what was reported.
create or replace function public.admin_send_restriction_notice(p_restriction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.account_restrictions%rowtype; v_text text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from public.account_restrictions where id = p_restriction for update;
  if not found or r.status <> 'active' then raise exception 'This restriction is not active'; end if;
  if r.employer_notice_sent_at is not null then return; end if;
  v_text := 'Your TaskTeens account is temporarily restricted while our team reviews a safety report. While it''s restricted you can''t publish listings, message, or change applications. We''ll contact you by email. Reply to that email if you have information to share.';
  update public.account_restrictions set employer_notice_sent_at = now(), notice_text = v_text where id = r.id;
  perform public.notify_ex(r.user_id, 'restriction', 'Your account is temporarily restricted', v_text, '/dashboard', true, false, 'high', null);
  perform public.log_event('restriction.notice', 'account_restriction', r.id::text);
end $$;

create or replace function public.admin_lift_restriction(p_restriction uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.account_restrictions%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'A note is required'; end if;
  select * into r from public.account_restrictions where id = p_restriction for update;
  if not found or r.status <> 'active' then return; end if;
  update public.account_restrictions set status = 'lifted', lifted_at = now(), lifted_by = auth.uid(), lift_note = left(trim(p_note), 1000) where id = r.id;
  if r.employer_notice_sent_at is not null then
    perform public.notify_ex(r.user_id, 'restriction', 'Your account restriction was lifted',
      'Your TaskTeens account is no longer restricted.', '/dashboard', true, false, 'normal', null);
  end if;
  perform public.log_event('restriction.lift', 'account_restriction', r.id::text, p_note);
end $$;

create or replace function public.admin_restrictions(p_include_lifted boolean default false)
returns table (id uuid, user_id uuid, user_name text, user_email text, user_role text, reason text, created_by_role text,
               related_alert_id uuid, related_incident_id uuid, status text, notice_sent_at timestamptz,
               created_at timestamptz, lifted_at timestamptz, lift_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select r.id, r.user_id, u.full_name, u.email, u.role, r.reason, r.created_by_role, r.related_alert_id, r.related_incident_id,
         r.status, r.employer_notice_sent_at, r.created_at, r.lifted_at, r.lift_note
  from public.account_restrictions r join public.users u on u.id = r.user_id
  where p_include_lifted or r.status = 'active'
  order by (r.status = 'active') desc, r.created_at desc limit 200;
end $$;

-- Restricted employers' listings are hidden from the public (teens who applied still see theirs).
-- One narrow yes/no helper for the policy, so anonymous visitors don't get general access to is_restricted().
create or replace function public.employer_listable(p_employer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user(p_employer) and not public.is_restricted(p_employer);
$$;
revoke execute on function public.employer_listable(uuid) from public;
grant execute on function public.employer_listable(uuid) to anon, authenticated;
drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs for select using (
  (status = 'published' and moderation_status = 'approved' and public.employer_listable(employer_id)
     and coalesce((select c.pilot_policy from public.categories c where c.slug = jobs.category), 'review') <> 'prohibited')
  or employer_id = auth.uid()
  or exists (select 1 from public.applications a where a.job_id = jobs.id and (a.teen_id = auth.uid() or public.is_parent_of(a.teen_id)))
  or public.is_admin());

-- Applying to a restricted employer's listing is refused.
create or replace function public.block_apply_to_restricted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_restricted(new.employer_id) and not public.is_privileged() then
    raise exception 'This listing is not accepting applications right now' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists applications_block_restricted on public.applications;
create trigger applications_block_restricted before insert on public.applications for each row execute function public.block_apply_to_restricted();

revoke execute on function public.raise_safety_alert(text, uuid, text) from public, anon;
revoke execute on function public.alert_call_screen_opened(uuid) from public, anon;
revoke execute on function public.teen_mark_safe(uuid, text) from public, anon;
revoke execute on function public.parent_resolve_alert(uuid, text) from public, anon;
revoke execute on function public.my_open_alerts() from public, anon;
revoke execute on function public.parent_open_alerts() from public, anon;
revoke execute on function public.admin_safety_alerts(boolean) from public, anon;
revoke execute on function public.admin_alert_location(uuid, text) from public, anon;
revoke execute on function public.admin_resolve_alert(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_restrict_user(uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.admin_send_restriction_notice(uuid) from public, anon;
revoke execute on function public.admin_lift_restriction(uuid, text) from public, anon;
revoke execute on function public.admin_restrictions(boolean) from public, anon;
revoke execute on function public.block_apply_to_restricted() from public, anon, authenticated;
grant execute on function public.raise_safety_alert(text, uuid, text) to authenticated;
grant execute on function public.alert_call_screen_opened(uuid) to authenticated;
grant execute on function public.teen_mark_safe(uuid, text) to authenticated;
grant execute on function public.parent_resolve_alert(uuid, text) to authenticated;
grant execute on function public.my_open_alerts() to authenticated;
grant execute on function public.parent_open_alerts() to authenticated;
grant execute on function public.admin_safety_alerts(boolean) to authenticated;
grant execute on function public.admin_alert_location(uuid, text) to authenticated;
grant execute on function public.admin_resolve_alert(uuid, text, boolean) to authenticated;
grant execute on function public.admin_restrict_user(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.admin_send_restriction_notice(uuid) to authenticated;
grant execute on function public.admin_lift_restriction(uuid, text) to authenticated;
grant execute on function public.admin_restrictions(boolean) to authenticated;
