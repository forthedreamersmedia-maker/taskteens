-- =====================================================================
-- TaskTeens launch safety — Phase 8: incident reports, statements, evidence.
--
--   * Teens, parents and employers file structured incident reports about a job (or in general).
--   * The other side of a report can't see it until an administrator opens it for their response.
--   * Evidence files go to a private bucket. Records are append-only: nobody (admins included) can
--     edit or delete a statement or an evidence record through the app. Integrity flags are
--     indicators for reviewers, not proof of anything.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-evidence', 'incident-evidence', false, 26214400,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','application/pdf'])
on conflict (id) do nothing;

-- Upload only into your own folder. No update/delete policies: uploaded evidence can't be replaced or removed.
create policy incident_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'incident-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
-- Read a file only if you can read its evidence record (RLS on incident_evidence decides).
create policy incident_evidence_download on storage.objects for select to authenticated using (
  bucket_id = 'incident-evidence' and exists (select 1 from public.incident_evidence e where e.storage_path = name));

alter table public.incident_reports add column if not exists admin_outcome_note text;
alter table public.incident_reports add column if not exists closed_at timestamptz;

-- ---------------------------------------------------------------------
-- File a report
-- ---------------------------------------------------------------------
create or replace function public.file_incident_report(
  p_application uuid, p_category text, p_statement text, p_occurred_at timestamptz default null,
  p_location_text text default null, p_people_involved text default null, p_anyone_in_danger boolean default false,
  p_anyone_injured boolean default false, p_actions_taken text default null, p_pet_details jsonb default null,
  p_accuracy_confirmed boolean default false, p_related_alert uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; a public.applications%rowtype; v_teen uuid; v_employer uuid; v_job uuid;
        v_id uuid; v_status text; v_title text; r record; v_safety boolean;
begin
  if v_uid is null then raise exception 'Please sign in to file a report'; end if;
  select role into v_role from public.users where id = v_uid and status = 'active';
  if v_role = 'admin' or v_role is null then raise exception 'Only teen, parent and employer accounts can file reports here'; end if;
  if not coalesce(p_accuracy_confirmed, false) then raise exception 'Please confirm the report is accurate to the best of your knowledge' using errcode = 'P0001'; end if;
  if char_length(coalesce(trim(p_statement),'')) < 10 then raise exception 'Please describe what happened (at least 10 characters)' using errcode = 'P0001'; end if;
  if p_category = 'lost_pet' and (p_pet_details is null or p_pet_details = '{}'::jsonb) then
    raise exception 'Please describe the pet (name, type, color, where last seen)' using errcode = 'P0001';
  end if;

  if p_application is not null then
    select * into a from public.applications where id = p_application;
    if not found then raise exception 'Not allowed'; end if;
    if v_uid = a.teen_id then v_role := 'teen';
    elsif v_uid = a.employer_id then v_role := 'employer';
    elsif public.is_parent_of(a.teen_id) then v_role := 'parent';
    else raise exception 'Not allowed'; end if;
    v_teen := a.teen_id; v_employer := a.employer_id; v_job := a.job_id;
  else
    if v_role = 'teen' then v_teen := v_uid; end if;
  end if;
  if p_related_alert is not null and not exists (select 1 from public.safety_alerts s where s.id = p_related_alert
       and (s.teen_id = v_uid or public.is_parent_of(s.teen_id))) then
    raise exception 'Not allowed';
  end if;

  v_safety := p_category in ('safety_emergency','missing_person','injury','harassment') or p_anyone_in_danger or p_anyone_injured;
  v_status := case when v_safety then 'urgent' else 'open' end;

  insert into public.incident_reports (application_id, job_id, teen_id, employer_id, reporter_id, reporter_role, category, occurred_at,
    location_text, people_involved, anyone_in_danger, anyone_injured, actions_taken, statement, pet_details, accuracy_confirmed, status, related_alert_id)
  values (a.id, v_job, v_teen, v_employer, v_uid, v_role, p_category, p_occurred_at,
    nullif(left(trim(coalesce(p_location_text,'')),300),''), nullif(left(trim(coalesce(p_people_involved,'')),1000),''),
    coalesce(p_anyone_in_danger,false), coalesce(p_anyone_injured,false), nullif(left(trim(coalesce(p_actions_taken,'')),2000),''),
    left(trim(p_statement), 6000), p_pet_details, true, v_status, p_related_alert)
  returning id into v_id;

  -- Who can see it now: the reporter's side. The other side waits for an administrator.
  insert into public.incident_participants (incident_id, user_id, role, can_view) values (v_id, v_uid, v_role, true);
  if v_teen is not null and v_teen <> v_uid then
    insert into public.incident_participants (incident_id, user_id, role, can_view) values (v_id, v_teen, 'teen', v_role = 'parent');
  end if;
  if v_employer is not null and v_employer <> v_uid then
    insert into public.incident_participants (incident_id, user_id, role, can_view) values (v_id, v_employer, 'employer', false);
  end if;

  -- Safety-related reports freeze the job's messages and status changes until reviewed.
  if v_safety and a.id is not null then
    perform set_config('taskteens.rpc', 'on', true);
    update public.applications set incident_open = true where id = a.id;
    perform set_config('taskteens.rpc', '', true);
  end if;

  if v_job is not null then select title into v_title from public.jobs where id = v_job; end if;
  for r in select public.active_admin_ids() as id loop
    perform public.notify_ex(r.id, 'incident', case when v_safety then 'URGENT incident report' else 'New incident report' end,
      'A ' || v_role || ' filed a report (' || replace(p_category, '_', ' ') || ')' || coalesce(' about “' || v_title || '”', '') || '.',
      '/incidents/' || v_id, true, false, case when v_safety then 'high' else 'normal' end, p_related_alert);
  end loop;
  -- Parents are told about reports involving their teen (filed by the teen or about the teen's job).
  if v_teen is not null and v_role <> 'parent' then
    for r in select parent_id from public.parent_teen_links where teen_id = v_teen and status = 'active' loop
      perform public.notify_ex(r.parent_id, 'incident', 'An incident report involves your teen',
        'A report was filed' || coalesce(' about “' || v_title || '”', '') || '. You can read it and add a statement.',
        '/incidents/' || v_id, true, false, case when v_safety then 'high' else 'normal' end, null);
    end loop;
  end if;
  perform public.log_event('incident.file', 'incident_report', v_id::text, null, jsonb_build_object('category', p_category, 'status', v_status));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Statements (append-only). The other side can respond only once an admin opens responses.
-- ---------------------------------------------------------------------
create or replace function public.add_incident_statement(p_incident uuid, p_body text, p_admin_only boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare ir public.incident_reports%rowtype; v_role text; v_id uuid; r record;
begin
  select * into ir from public.incident_reports where id = p_incident;
  if not found or not public.can_view_incident(p_incident) then raise exception 'Not allowed'; end if;
  if char_length(coalesce(trim(p_body),'')) < 1 then raise exception 'Write a statement first' using errcode = 'P0001'; end if;
  if public.is_admin() then v_role := 'admin';
  elsif auth.uid() = ir.teen_id then v_role := 'teen';
  elsif auth.uid() = ir.employer_id then v_role := 'employer';
  elsif ir.teen_id is not null and public.is_parent_of(ir.teen_id) then v_role := 'parent';
  elsif auth.uid() = ir.reporter_id then v_role := ir.reporter_role;
  else raise exception 'Not allowed'; end if;
  if v_role <> 'admin' and ir.status in ('resolved','unsubstantiated','inconclusive','substantiated') then
    raise exception 'This report is closed' using errcode = 'P0001';
  end if;
  insert into public.incident_responses (incident_id, author_id, author_role, body, admin_only)
  values (p_incident, auth.uid(), v_role, left(trim(p_body), 6000), v_role = 'admin' and coalesce(p_admin_only, false))
  returning id into v_id;
  if v_role <> 'admin' then
    for r in select public.active_admin_ids() as id loop
      perform public.notify(r.id, 'incident_response', 'New statement on an incident', 'A ' || v_role || ' added a statement.', '/incidents/' || p_incident);
    end loop;
  elsif not coalesce(p_admin_only, false) then
    for r in select p.user_id from public.incident_participants p where p.incident_id = p_incident and p.can_view loop
      perform public.notify(r.user_id, 'incident_response', 'Update on your report', 'TaskTeens added a note to the report.', '/incidents/' || p_incident);
    end loop;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Evidence: register an uploaded file. Integrity flags are indicators only.
-- ---------------------------------------------------------------------
create or replace function public.register_evidence(p_application uuid, p_incident uuid, p_phase text, p_path text, p_mime text,
                                                    p_size bigint, p_sha256 text, p_metadata jsonb, p_caption text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; a public.applications%rowtype; ir public.incident_reports%rowtype;
        v_flags text[] := '{}'; v_id uuid; v_taken timestamptz; v_end timestamptz;
begin
  if v_uid is null then raise exception 'Not allowed'; end if;
  if p_phase not in ('before','after','incident') then raise exception 'Invalid phase'; end if;
  if split_part(coalesce(p_path,''), '/', 1) <> v_uid::text or p_path like '%..%' then raise exception 'Invalid file path'; end if;
  if p_mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','application/pdf') then
    raise exception 'That file type isn''t accepted' using errcode = 'P0001';
  end if;
  if p_size is null or p_size <= 0 or p_size > 26214400 then raise exception 'Files must be 25 MB or smaller' using errcode = 'P0001'; end if;

  if p_phase = 'incident' then
    select * into ir from public.incident_reports where id = p_incident;
    if not found or not public.can_view_incident(p_incident) then raise exception 'Not allowed'; end if;
    if ir.status in ('resolved','unsubstantiated','inconclusive','substantiated') and not public.is_admin() then
      raise exception 'This report is closed' using errcode = 'P0001';
    end if;
    p_application := ir.application_id;
  else
    select * into a from public.applications where id = p_application;
    if not found or not (v_uid = a.teen_id or v_uid = a.employer_id) then raise exception 'Not allowed'; end if;
    if a.status <> 'confirmed' then raise exception 'Before/after photos are for confirmed jobs' using errcode = 'P0001'; end if;
    p_incident := null;
  end if;
  v_role := case when public.is_admin() then 'admin' when v_uid = a.teen_id or v_uid = ir.teen_id then 'teen'
                 when v_uid = a.employer_id or v_uid = ir.employer_id then 'employer' else 'parent' end;

  if p_sha256 is not null and exists (select 1 from public.incident_evidence e where e.sha256 = p_sha256) then v_flags := array_append(v_flags, 'duplicate_file'); end if;
  if p_metadata is null or p_metadata = '{}'::jsonb or not (p_metadata ? 'last_modified') then v_flags := array_append(v_flags, 'missing_device_metadata'); end if;
  begin v_taken := (p_metadata->>'last_modified')::timestamptz; exception when others then v_taken := null; end;
  if v_taken is not null and v_taken > now() + interval '5 minutes' then v_flags := array_append(v_flags, 'timestamp_in_future'); end if;
  if p_phase in ('before','after') then
    select max(s.ends_at) into v_end from public.job_shifts s where s.application_id = p_application;
    if v_end is not null and now() > v_end + interval '48 hours' then v_flags := array_append(v_flags, 'uploaded_long_after_job'); end if;
  end if;

  insert into public.incident_evidence (application_id, incident_id, uploader_id, uploader_role, phase, storage_path, mime_type, size_bytes,
                                        sha256, original_metadata, integrity_flags, caption, locked)
  values (p_application, p_incident, v_uid, v_role, p_phase, p_path, p_mime, p_size, nullif(p_sha256,''), coalesce(p_metadata,'{}'::jsonb),
          v_flags, nullif(left(trim(coalesce(p_caption,'')),500),''), p_incident is not null)
  returning id into v_id;
  perform public.log_event('evidence.register', 'incident_evidence', v_id::text, null, jsonb_build_object('phase', p_phase, 'flags', v_flags));
  return v_id;
end $$;

-- Before/after photos become locked once any report is filed about that job.
create or replace function public.lock_job_evidence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_id is not null then
    update public.incident_evidence set locked = true where application_id = new.application_id and not locked;
  end if;
  return new;
end $$;
drop trigger if exists incident_reports_lock_evidence on public.incident_reports;
create trigger incident_reports_lock_evidence after insert on public.incident_reports for each row execute function public.lock_job_evidence();

-- Evidence records can't be edited, except the system setting locked = true.
create or replace function public.guard_evidence_update() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'locked') is distinct from (to_jsonb(old) - 'locked') or (old.locked and not new.locked) then
    raise exception 'Evidence records can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists incident_evidence_guard_update on public.incident_evidence;
create trigger incident_evidence_guard_update before update on public.incident_evidence for each row execute function public.guard_evidence_update();

-- ---------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------
create or replace function public.my_incidents()
returns table (id uuid, category text, status text, created_at timestamptz, job_title text, reporter_role text, i_am_reporter boolean, response_open boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.category, r.status, r.created_at, j.title, r.reporter_role, r.reporter_id = auth.uid(), r.response_open
  from public.incident_reports r left join public.jobs j on j.id = r.job_id
  where public.can_view_incident(r.id) and not public.is_admin()
  order by r.created_at desc limit 200;
$$;

create or replace function public.admin_incidents(p_include_closed boolean default false)
returns table (id uuid, category text, status text, created_at timestamptz, job_title text, reporter_role text, reporter_name text,
               teen_name text, employer_name text, anyone_in_danger boolean, anyone_injured boolean, response_open boolean,
               statements int, evidence int, employer_restricted boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select r.id, r.category, r.status, r.created_at, j.title, r.reporter_role, ru.full_name,
         coalesce(nullif(tp.display_name,''), tu.full_name), ep.display_name, r.anyone_in_danger, r.anyone_injured, r.response_open,
         (select count(*)::int from public.incident_responses x where x.incident_id = r.id),
         (select count(*)::int from public.incident_evidence x where x.incident_id = r.id),
         coalesce(public.is_restricted(r.employer_id), false)
  from public.incident_reports r
  left join public.jobs j on j.id = r.job_id
  left join public.users ru on ru.id = r.reporter_id
  left join public.users tu on tu.id = r.teen_id
  left join public.teen_profiles tp on tp.user_id = r.teen_id
  left join public.employer_profiles ep on ep.user_id = r.employer_id
  where p_include_closed or r.status not in ('resolved','unsubstantiated','inconclusive','substantiated')
  order by (r.status = 'urgent') desc, r.created_at desc limit 300;
end $$;

-- ---------------------------------------------------------------------
-- Admin decisions
-- ---------------------------------------------------------------------
-- Let the other side of the report read it and respond.
create or replace function public.admin_open_incident_response(p_incident uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare ir public.incident_reports%rowtype; r record;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'A note is required'; end if;
  select * into ir from public.incident_reports where id = p_incident for update;
  if not found then raise exception 'Not found'; end if;
  update public.incident_participants set can_view = true where incident_id = p_incident and not can_view;
  update public.incident_reports set response_open = true,
         status = case when status in ('open','urgent') then 'awaiting_response' else status end where id = p_incident;
  for r in select p.user_id from public.incident_participants p where p.incident_id = p_incident and p.user_id <> ir.reporter_id loop
    perform public.notify_ex(r.user_id, 'incident', 'A report needs your response',
      'A report was filed about a TaskTeens job you were part of. Please read it and add your statement.', '/incidents/' || p_incident,
      true, false, 'high', null);
  end loop;
  perform public.log_event('incident.open_response', 'incident_report', p_incident::text, p_note);
end $$;

create or replace function public.admin_set_incident_status(p_incident uuid, p_status text, p_note text, p_unfreeze_job boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare ir public.incident_reports%rowtype; r record; v_closed boolean;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('open','urgent','awaiting_response','referred','substantiated','unsubstantiated','inconclusive','resolved') then raise exception 'Invalid status'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'A note is required'; end if;
  select * into ir from public.incident_reports where id = p_incident for update;
  if not found then raise exception 'Not found'; end if;
  v_closed := p_status in ('substantiated','unsubstantiated','inconclusive','resolved');
  update public.incident_reports set status = p_status, admin_outcome_note = left(trim(p_note), 2000),
         closed_at = case when v_closed then now() else null end where id = p_incident;
  if v_closed and p_unfreeze_job and ir.application_id is not null
     and not exists (select 1 from public.incident_reports x where x.application_id = ir.application_id and x.id <> ir.id
                     and x.status not in ('substantiated','unsubstantiated','inconclusive','resolved'))
     and not exists (select 1 from public.safety_alerts s where s.application_id = ir.application_id and s.status = 'open') then
    perform set_config('taskteens.rpc', 'on', true);
    update public.applications set incident_open = false where id = ir.application_id;
    perform set_config('taskteens.rpc', '', true);
  end if;
  if v_closed then
    for r in select p.user_id from public.incident_participants p where p.incident_id = p_incident and p.can_view loop
      perform public.notify(r.user_id, 'incident', 'Your report was reviewed', 'TaskTeens finished reviewing the report. Open it to see the outcome.', '/incidents/' || p_incident);
    end loop;
  end if;
  perform public.log_event('incident.status', 'incident_report', p_incident::text, p_note, jsonb_build_object('status', p_status, 'unfreeze_job', p_unfreeze_job));
end $$;

-- Admin location access during an open incident already exists (admin_view_location). Evidence downloads use signed
-- URLs gated by the storage policy above.

revoke execute on function public.file_incident_report(uuid, text, text, timestamptz, text, text, boolean, boolean, text, jsonb, boolean, uuid) from public, anon;
revoke execute on function public.add_incident_statement(uuid, text, boolean) from public, anon;
revoke execute on function public.register_evidence(uuid, uuid, text, text, text, bigint, text, jsonb, text) from public, anon;
revoke execute on function public.my_incidents() from public, anon;
revoke execute on function public.admin_incidents(boolean) from public, anon;
revoke execute on function public.admin_open_incident_response(uuid, text) from public, anon;
revoke execute on function public.admin_set_incident_status(uuid, text, text, boolean) from public, anon;
revoke execute on function public.lock_job_evidence() from public, anon, authenticated;
grant execute on function public.file_incident_report(uuid, text, text, timestamptz, text, text, boolean, boolean, text, jsonb, boolean, uuid) to authenticated;
grant execute on function public.add_incident_statement(uuid, text, boolean) to authenticated;
grant execute on function public.register_evidence(uuid, uuid, text, text, text, bigint, text, jsonb, text) to authenticated;
grant execute on function public.my_incidents() to authenticated;
grant execute on function public.admin_incidents(boolean) to authenticated;
grant execute on function public.admin_open_incident_response(uuid, text) to authenticated;
grant execute on function public.admin_set_incident_status(uuid, text, text, boolean) to authenticated;
grant execute on function public.can_view_incident(uuid) to authenticated;
