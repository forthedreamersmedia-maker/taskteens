-- =====================================================================
-- TaskTeens launch safety — Phase 4: parent job approval, address release, cancellations.
-- =====================================================================

-- Parents can only confirm currently-approved listings with a future date.
create or replace function public.parent_decide_application(p_application uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype; j public.jobs%rowtype; v_start timestamptz;
begin
  select * into a from public.applications where id = p_application for update;
  if not found or not public.is_parent_of(a.teen_id) then raise exception 'Not allowed'; end if;
  if a.status <> 'selected' then raise exception 'This job is not awaiting your approval'; end if;
  if a.incident_open then raise exception 'This job has an incident under review'; end if;
  if p_approve and not public.teen_parent_confirmed(a.teen_id) then raise exception 'Parent consent is not active'; end if;
  select * into j from public.jobs where id = a.job_id;
  if p_approve and public.is_restricted(j.employer_id) then raise exception 'This employer account is restricted'; end if;
  if p_approve and (j.status = 'removed' or j.moderation_status <> 'approved') then
    raise exception 'This listing is no longer approved by TaskTeens moderators, so it can''t be confirmed' using errcode = 'P0001';
  end if;
  if p_approve and j.start_date is not null and j.start_date < current_date then
    raise exception 'This job''s date has passed. Ask the employer to update the date first.' using errcode = 'P0001';
  end if;

  perform set_config('taskteens.rpc', 'on', true);
  update public.parent_job_approvals set status = 'invalidated', invalidated_at = now(), invalidated_reason = 'Superseded'
   where application_id = a.id and status = 'active';
  insert into public.parent_job_approvals (application_id, parent_id, job_version, snapshot, decision, note)
  values (a.id, auth.uid(), j.version, public.job_material_snapshot(j), case when p_approve then 'approved' else 'declined' end, nullif(trim(p_note),''));
  update public.applications set status = case when p_approve then 'confirmed' else 'parent_declined' end where id = a.id;
  if p_approve and j.start_date is not null and j.start_time is not null and j.duration_minutes is not null then
    v_start := (j.start_date + j.start_time) at time zone 'America/Los_Angeles';
    if v_start > now() - interval '1 hour' then
      insert into public.job_shifts (application_id, starts_at, ends_at, created_by)
      values (a.id, v_start, v_start + make_interval(mins => j.duration_minutes), auth.uid());
    end if;
  end if;
  perform set_config('taskteens.rpc', '', true);
  perform public.log_event(case when p_approve then 'parent.approve_job' else 'parent.decline_job' end, 'application', a.id::text, p_note,
                           jsonb_build_object('job_version', j.version));
end $$;

-- Notifications: no duplicate "selected" alert after a re-approval reset; cancellations notify everyone.
create or replace function public.notify_application_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text; v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  v_label := case new.status
    when 'submitted' then 'Submitted' when 'viewed' then 'Viewed' when 'interview_requested' then 'Interview requested'
    when 'selected' then 'Selected — awaiting parent approval' when 'confirmed' then 'Confirmed by parent'
    when 'parent_declined' then 'Declined by parent' when 'not_selected' then 'Not selected'
    when 'withdrawn' then 'Withdrawn' when 'cancelled' then 'Cancelled' end;
  if new.status = 'withdrawn' then
    perform public.notify(new.employer_id, 'application_status', 'Application withdrawn',
      new.applicant_name || ' withdrew from “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  elsif new.status = 'submitted' then
    perform public.notify(new.employer_id, 'application_received', 'New application',
      new.applicant_name || ' re-applied to “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  elsif new.status = 'cancelled' then
    perform public.notify(new.teen_id, 'application_status', 'Job cancelled', '“' || v_title || '” was cancelled.', '/dashboard/teen/applications');
    perform public.notify(new.employer_id, 'application_status', 'Job cancelled', '“' || v_title || '” with ' || new.applicant_name || ' was cancelled.', '/dashboard/employer/applications/' || new.id);
    perform public.notify_parents(new.teen_id, 'application_status', 'Job cancelled', '“' || v_title || '” was cancelled.', '/dashboard/parent/applications', true);
  elsif new.status in ('confirmed','parent_declined') then
    perform public.notify(new.employer_id, 'application_status', 'Status: ' || v_label,
      'A parent responded about “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
    perform public.notify(new.teen_id, 'application_status', 'Status: ' || v_label,
      'Update on “' || v_title || '”.', '/dashboard/teen/applications');
  else
    perform public.notify(new.teen_id, 'application_status', 'Status: ' || v_label,
      v_employer || ' updated your application for “' || v_title || '”.', '/dashboard/teen/applications');
    if new.status = 'selected' and old.status <> 'confirmed' then
      perform public.notify_parents(new.teen_id, 'parent_approval', 'Approval needed: your teen was selected',
        v_employer || ' selected your teen for “' || v_title || '”. Review the job details and approve or decline.',
        '/dashboard/parent/applications', true);
    end if;
  end if;
  return new;
end $$;

-- Material job changes also tell the employer that parent approval was reset.
create or replace function public.after_job_write_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; r record;
begin
  v_new := public.job_material_snapshot(new);
  if tg_op = 'INSERT' then
    insert into public.job_versions (job_id, version, snapshot) values (new.id, new.version, v_new) on conflict do nothing;
    return null;
  end if;
  v_old := public.job_material_snapshot(old);
  if v_new = v_old then return null; end if;

  perform set_config('taskteens.rpc', 'on', true);
  update public.jobs set version = old.version + 1 where id = new.id;
  insert into public.job_versions (job_id, version, snapshot) values (new.id, old.version + 1, v_new);

  -- Invalidate every active parent approval; confirmed assignments go back to awaiting parent approval.
  for r in select pa.id, pa.application_id, a.teen_id, a.applicant_name from public.parent_job_approvals pa
           join public.applications a on a.id = pa.application_id
           where a.job_id = new.id and pa.status = 'active' and pa.decision = 'approved' loop
    update public.parent_job_approvals set status = 'invalidated', invalidated_at = now(), invalidated_reason = 'Job details changed' where id = r.id;
    update public.applications set status = 'selected' where id = r.application_id and status = 'confirmed' and completed_at is null;
    update public.job_shifts set status = 'cancelled' where application_id = r.application_id and status = 'scheduled';
    perform public.notify_parents(r.teen_id, 'parent_approval', 'Job changed — approval needed again',
      'The employer changed “' || new.title || '”. Review the updated details and approve again before your teen works this job.',
      '/dashboard/parent/applications', true);
    perform public.notify(new.employer_id, 'parent_approval', 'Parent approval reset',
      'You changed “' || new.title || '”, so ' || r.applicant_name || '''s parent must approve the new details. The address is hidden until then.',
      '/dashboard/employer/applications/' || r.application_id);
  end loop;
  perform set_config('taskteens.rpc', '', true);
  return null;
end $$;

-- Leaving "confirmed" (cancel, withdraw, consent revoked) cancels scheduled shifts and stops location sharing.
create or replace function public.after_application_unconfirm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'confirmed' and new.status <> 'confirmed' then
    update public.job_shifts set status = 'cancelled' where application_id = new.id and status in ('scheduled','active');
    delete from public.location_current where session_id in (select id from public.location_sharing_sessions where application_id = new.id and status = 'active');
    update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'job_completed'
     where application_id = new.id and status = 'active';
  end if;
  return null;
end $$;
revoke execute on function public.after_application_unconfirm() from public, anon, authenticated;
create trigger applications_unconfirm after update of status on public.applications
  for each row execute function public.after_application_unconfirm();

-- One place for the parent's approval screen: job terms + employer checks + history (parents only).
create or replace function public.parent_application_detail(p_application uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.applications%rowtype; j public.jobs%rowtype; v jsonb;
begin
  select * into a from public.applications where id = p_application;
  if not found or not (public.is_parent_of(a.teen_id) or public.is_admin()) then raise exception 'Not allowed'; end if;
  select * into j from public.jobs where id = a.job_id;
  select jsonb_build_object(
    'application', jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at, 'completed_at', a.completed_at, 'interest_statement', a.interest_statement),
    'job', public.job_material_snapshot(j) || jsonb_build_object('id', j.id, 'version', j.version, 'status', j.status, 'moderation_status', j.moderation_status, 'risk_flags', to_jsonb(j.risk_flags)),
    'employer', (select jsonb_build_object('display_name', e.display_name, 'employer_type', e.employer_type) from public.employer_profiles e where e.user_id = j.employer_id),
    'indicators', (select to_jsonb(t) from public.employer_trust_indicators(array[j.employer_id]) t),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('decision', pa.decision, 'status', pa.status, 'job_version', pa.job_version, 'note', pa.note,
                     'created_at', pa.created_at, 'invalidated_reason', pa.invalidated_reason) order by pa.created_at desc)
                   from public.parent_job_approvals pa where pa.application_id = a.id), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status) order by s.starts_at)
                   from public.job_shifts s where s.application_id = a.id), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function public.parent_application_detail(uuid) from public, anon;
grant execute on function public.parent_application_detail(uuid) to authenticated;
