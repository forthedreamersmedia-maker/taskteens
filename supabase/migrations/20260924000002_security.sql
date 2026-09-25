-- =====================================================================
-- TaskTeens — security: helper functions, integrity triggers,
-- notification triggers, row-level security, storage, admin RPCs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they can read public.users under RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.current_user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and status = 'active';
$$;

create or replace function public.is_active_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = uid and status = 'active');
$$;

-- True for the service role / SQL editor (no end-user JWT) or an active admin.
create or replace function public.is_privileged() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin();
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.write_audit(p_action text, p_target_type text, p_target_id text, p_note text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, note, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, nullif(p_note,''), coalesce(p_meta,'{}'::jsonb));
$$;
revoke execute on function public.write_audit(text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- New auth user → public.users (+ teen profile). Role from metadata is
-- restricted to teen|employer, so nobody can sign up as admin.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := case when new.raw_user_meta_data->>'role' = 'employer' then 'employer' else 'teen' end;
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
begin
  insert into public.users (id, email, full_name, role) values (new.id, new.email, v_name, v_role)
  on conflict (id) do nothing;
  if v_role = 'teen' then
    insert into public.teen_profiles (user_id, display_name) values (new.id, v_name) on conflict do nothing;
  end if;
  perform public.notify(new.id, 'system', 'Welcome to TaskTeens',
    case when v_role = 'teen' then 'Complete your profile so employers can learn about you.' else 'Finish setting up your employer profile to post your first job.' end,
    case when v_role = 'teen' then '/dashboard/teen/profile' else '/onboarding/employer' end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Users can edit their name/phone, never role/status/email.
create or replace function public.guard_user_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  new.role := old.role;
  new.status := old.status;
  new.email := old.email;
  return new;
end $$;
create trigger users_guard before update on public.users for each row execute function public.guard_user_update();

-- Employers cannot self-verify.
create or replace function public.guard_employer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
  else
    new.verification_status := old.verification_status;
  end if;
  return new;
end $$;
create trigger employer_profiles_guard before insert or update on public.employer_profiles
for each row execute function public.guard_employer_update();

-- A verification request moves the profile to "pending" (definer bypasses the guard).
create or replace function public.on_verification_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.employer_profiles set verification_status = 'pending'
  where user_id = new.employer_id and verification_status in ('unverified','rejected');
  if not public.is_privileged() then
    new.status := 'pending'; new.reviewer_id := null; new.review_note := null; new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger verification_requests_before_insert before insert on public.verification_requests
for each row execute function public.on_verification_request();

-- ---------------------------------------------------------------------
-- Jobs integrity: employers can't approve, feature, remove or mark demo.
-- ---------------------------------------------------------------------
create or replace function public.guard_job_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_require boolean;
begin
  if public.is_privileged() then return new; end if;
  select require_job_approval into v_require from public.platform_settings where id = 1;
  if tg_op = 'INSERT' then
    new.moderation_status := case when coalesce(v_require, true) then 'pending' else 'approved' end;
    new.featured := false;
    new.is_demo := false;
    if new.status = 'removed' then new.status := 'draft'; end if;
  else
    new.employer_id := old.employer_id;
    new.featured := old.featured;
    new.is_demo := old.is_demo;
    if old.status = 'removed' then new.status := 'removed'; end if;
    if new.status = 'removed' and old.status <> 'removed' then raise exception 'Only administrators can remove listings'; end if;
    new.moderation_status := case when old.moderation_status = 'rejected' then 'pending' else old.moderation_status end;
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
create trigger jobs_guard before insert or update on public.jobs for each row execute function public.guard_job_write();

-- ---------------------------------------------------------------------
-- Applications: route to the correct employer, validate, notify.
-- ---------------------------------------------------------------------
create or replace function public.before_application_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = new.job_id;
  if not found or j.status <> 'published' or j.moderation_status <> 'approved' then
    raise exception 'This listing is not accepting applications' using errcode = 'P0001';
  end if;
  if j.deadline is not null and j.deadline < current_date then
    raise exception 'The application deadline has passed' using errcode = 'P0001';
  end if;
  if not public.is_privileged() and public.current_user_role() is distinct from 'teen' then
    raise exception 'Only teen accounts can apply' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(new.teen_id, j.employer_id) then
    raise exception 'You cannot apply to this listing' using errcode = 'P0001';
  end if;
  new.employer_id := j.employer_id;         -- never trust the client
  if not public.is_privileged() then
    new.status := 'submitted';
    new.viewed_at := null;
    new.status_updated_at := now();
    new.created_at := now();
  end if;
  return new;
end $$;
create trigger applications_before_insert before insert on public.applications
for each row execute function public.before_application_insert();

create or replace function public.after_application_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text;
begin
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  perform public.notify(new.employer_id, 'application_received', 'New application',
    new.applicant_name || ' applied to “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  perform public.notify(new.teen_id, 'application_status', 'Application sent',
    'Your application for “' || v_title || '” was delivered to ' || v_employer || '.', '/dashboard/teen/applications');
  return new;
end $$;
create trigger applications_after_insert after insert on public.applications
for each row execute function public.after_application_insert();

-- Column-level rules for updates:
--  * teen:     may only withdraw (or re-open a withdrawn application with fresh answers)
--  * employer: may only change status (not to withdrawn) / viewed_at
create or replace function public.guard_application_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  if auth.uid() = old.teen_id then
    if old.status = 'withdrawn' and new.status = 'submitted' then
      -- re-applying after withdrawal: allow refreshed answers, reset review state
      if not exists (select 1 from public.jobs j where j.id = old.job_id and j.status = 'published'
                     and j.moderation_status = 'approved' and (j.deadline is null or j.deadline >= current_date)) then
        raise exception 'This listing is not accepting applications' using errcode = 'P0001';
      end if;
      new.job_id := old.job_id; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
      new.viewed_at := null; new.status_updated_at := now(); new.created_at := now();
      return new;
    end if;
    if new.status <> 'withdrawn' then raise exception 'Applicants can only withdraw an application'; end if;
    new := old; new.status := 'withdrawn'; new.status_updated_at := now();
    return new;
  end if;

  if auth.uid() = old.employer_id then
    if old.status = 'withdrawn' then raise exception 'This application was withdrawn'; end if;
    if new.status = 'withdrawn' then raise exception 'Only the applicant can withdraw'; end if;
    -- lock every column except status + viewed_at
    new.job_id := old.job_id; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
    new.applicant_name := old.applicant_name; new.applicant_email := old.applicant_email; new.applicant_phone := old.applicant_phone;
    new.age_range := old.age_range; new.city := old.city; new.experience := old.experience; new.skills := old.skills;
    new.availability := old.availability; new.transportation := old.transportation; new.interest_statement := old.interest_statement;
    new.resume_path := old.resume_path; new.resume_name := old.resume_name; new.portfolio_url := old.portfolio_url;
    new.work_permit_status := old.work_permit_status; new.guardian_consent_status := old.guardian_consent_status;
    new.agreed_to_safety_rules := old.agreed_to_safety_rules; new.created_at := old.created_at;
    if new.status <> 'submitted' and new.viewed_at is null then new.viewed_at := now(); end if;
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  raise exception 'Not allowed';
end $$;
create trigger applications_guard before update on public.applications
for each row execute function public.guard_application_update();

-- In-app notification whenever the status changes.
create or replace function public.notify_application_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text; v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  v_label := case new.status
    when 'submitted' then 'Submitted' when 'viewed' then 'Viewed' when 'interview_requested' then 'Interview requested'
    when 'selected' then 'Selected' when 'not_selected' then 'Not selected' when 'withdrawn' then 'Withdrawn' end;
  if new.status = 'withdrawn' then
    perform public.notify(new.employer_id, 'application_status', 'Application withdrawn',
      new.applicant_name || ' withdrew from “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  elsif new.status = 'submitted' then
    perform public.notify(new.employer_id, 'application_received', 'New application',
      new.applicant_name || ' re-applied to “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  else
    perform public.notify(new.teen_id, 'application_status', 'Status: ' || v_label,
      v_employer || ' updated your application for “' || v_title || '”.', '/dashboard/teen/applications');
  end if;
  return new;
end $$;
create trigger applications_status_notify after update of status on public.applications
for each row execute function public.notify_application_status_change();

-- Interviews
create or replace function public.before_interview_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  select * into a from public.applications where id = new.application_id;
  if not found or (a.employer_id <> auth.uid() and not public.is_privileged()) then raise exception 'Not allowed'; end if;
  new.job_id := a.job_id; new.employer_id := a.employer_id; new.teen_id := a.teen_id;
  if not public.is_privileged() then new.status := 'proposed'; new.confirmed_time := null; end if;
  return new;
end $$;
create trigger interview_before_insert before insert on public.interview_requests
for each row execute function public.before_interview_insert();

create or replace function public.after_interview_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text;
begin
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  if tg_op = 'INSERT' then
    perform public.notify(new.teen_id, 'interview_requested', 'Interview requested',
      v_employer || ' would like to interview you for “' || v_title || '”. Pick a time in your dashboard.', '/dashboard/teen/interviews');
  elsif new.status is distinct from old.status and new.status in ('accepted','declined') then
    perform public.notify(new.employer_id, 'interview_response', 'Interview ' || new.status,
      'The applicant ' || new.status || ' the interview for “' || v_title || '”.', '/dashboard/employer/applications/' || new.application_id);
  end if;
  return new;
end $$;
create trigger interview_after_change after insert or update on public.interview_requests
for each row execute function public.after_interview_change();

create or replace function public.guard_interview_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  if auth.uid() = old.teen_id then
    if new.status not in ('accepted','declined') then raise exception 'Invalid interview response'; end if;
    if new.status = 'accepted' and not (new.confirmed_time = any(old.proposed_times)) then
      raise exception 'Choose one of the proposed times';
    end if;
    new.proposed_times := old.proposed_times; new.format := old.format; new.location_note := old.location_note;
    new.message := old.message; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
    return new;
  end if;
  if auth.uid() = old.employer_id then
    new.teen_id := old.teen_id; new.employer_id := old.employer_id; new.application_id := old.application_id;
    if new.status = 'accepted' and old.status <> 'accepted' then raise exception 'Only the applicant can accept'; end if;
    return new;
  end if;
  raise exception 'Not allowed';
end $$;
create trigger interview_guard before update on public.interview_requests
for each row execute function public.guard_interview_update();

-- Reports notify admins
create or replace function public.after_report_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.users where role = 'admin' and status = 'active' loop
    perform public.notify(r.id, 'system',
      case when new.severity = 'emergency' then 'EMERGENCY safety report' else 'New report' end,
      new.reason || ': ' || left(new.details, 80), '/admin/reports');
  end loop;
  return new;
end $$;
create trigger reports_after_insert after insert on public.reports for each row execute function public.after_report_insert();

-- Audit trail for admin edits to reference data / settings
create or replace function public.audit_reference_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    perform public.write_audit(lower(tg_table_name) || '.' || lower(tg_op), tg_table_name,
      coalesce(to_jsonb(new)->>'slug', to_jsonb(new)->>'id'), null, to_jsonb(new));
  end if;
  return new;
end $$;
create trigger categories_audit after insert or update on public.categories for each row execute function public.audit_reference_change();
create trigger service_areas_audit after insert or update on public.service_areas for each row execute function public.audit_reference_change();
create trigger settings_audit after update on public.platform_settings for each row execute function public.audit_reference_change();

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.users               enable row level security;
alter table public.teen_profiles       enable row level security;
alter table public.employer_profiles   enable row level security;
alter table public.categories          enable row level security;
alter table public.service_areas       enable row level security;
alter table public.platform_settings   enable row level security;
alter table public.jobs                enable row level security;
alter table public.applications        enable row level security;
alter table public.application_notes   enable row level security;
alter table public.saved_jobs          enable row level security;
alter table public.notifications       enable row level security;
alter table public.interview_requests  enable row level security;
alter table public.reports             enable row level security;
alter table public.verification_requests enable row level security;
alter table public.admin_audit_logs    enable row level security;
alter table public.blocks              enable row level security;

-- users: private. Own row or admin.
create policy users_select on public.users for select using (id = auth.uid() or public.is_admin());
create policy users_update_self on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- teen_profiles: owner only (+ admin read). Employers get the application snapshot instead.
create policy teen_select on public.teen_profiles for select using (user_id = auth.uid() or public.is_admin());
create policy teen_insert on public.teen_profiles for insert with check (user_id = auth.uid() and public.current_user_role() = 'teen');
create policy teen_update on public.teen_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- employer_profiles: public-safe fields; readable when onboarded.
create policy employer_select on public.employer_profiles for select using (onboarded or user_id = auth.uid() or public.is_admin());
create policy employer_insert on public.employer_profiles for insert with check (user_id = auth.uid() and public.current_user_role() = 'employer');
create policy employer_update on public.employer_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reference data
create policy categories_read on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy areas_read on public.service_areas for select using (true);
create policy areas_admin on public.service_areas for all using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.platform_settings for select using (true);
create policy settings_admin on public.platform_settings for update using (public.is_admin()) with check (public.is_admin());

-- jobs: public sees only published + approved from active employers.
create policy jobs_public_read on public.jobs for select using (
  (status = 'published' and moderation_status = 'approved' and public.is_active_user(employer_id))
  or employer_id = auth.uid()
  or public.is_admin()
);
create policy jobs_employer_insert on public.jobs for insert with check (
  employer_id = auth.uid() and public.current_user_role() = 'employer'
  and exists (select 1 from public.employer_profiles e where e.user_id = auth.uid() and e.onboarded)
);
create policy jobs_employer_update on public.jobs for update using (employer_id = auth.uid()) with check (employer_id = auth.uid());
create policy jobs_employer_delete on public.jobs for delete using (employer_id = auth.uid());

-- applications: teen sees own; employer sees those for own listings; admin sees all.
create policy applications_select on public.applications for select using (
  teen_id = auth.uid() or employer_id = auth.uid() or public.is_admin()
);
create policy applications_insert on public.applications for insert with check (
  teen_id = auth.uid() and public.current_user_role() = 'teen'
);
create policy applications_update on public.applications for update using (
  teen_id = auth.uid() or employer_id = auth.uid()
);

-- private employer notes
create policy notes_select on public.application_notes for select using (employer_id = auth.uid());
create policy notes_insert on public.application_notes for insert with check (
  employer_id = auth.uid() and exists (select 1 from public.applications a where a.id = application_id and a.employer_id = auth.uid())
);
create policy notes_delete on public.application_notes for delete using (employer_id = auth.uid());

create policy saved_all on public.saved_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy interviews_select on public.interview_requests for select using (
  teen_id = auth.uid() or employer_id = auth.uid() or public.is_admin()
);
create policy interviews_insert on public.interview_requests for insert with check (
  exists (select 1 from public.applications a where a.id = application_id and a.employer_id = auth.uid())
);
create policy interviews_update on public.interview_requests for update using (teen_id = auth.uid() or employer_id = auth.uid());

-- reports: anyone (including signed-out visitors) can file; only reporter/admin can read.
create policy reports_insert on public.reports for insert with check (reporter_id is null or reporter_id = auth.uid());
create policy reports_select on public.reports for select using (reporter_id = auth.uid() or public.is_admin());

create policy verification_insert on public.verification_requests for insert with check (employer_id = auth.uid());
create policy verification_select on public.verification_requests for select using (employer_id = auth.uid() or public.is_admin());

create policy audit_select on public.admin_audit_logs for select using (public.is_admin());

create policy blocks_all on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- =====================================================================
-- Admin RPCs — the ONLY path for moderation writes, so every action is
-- audited. Each checks is_admin() server-side.
-- =====================================================================
create or replace function public.admin_moderate_job(p_job uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Listing not found'; end if;
  case p_action
    when 'approve'   then update public.jobs set moderation_status = 'approved' where id = p_job;
    when 'reject'    then update public.jobs set moderation_status = 'rejected' where id = p_job;
    when 'pause'     then update public.jobs set status = 'paused' where id = p_job;
    when 'remove'    then update public.jobs set status = 'removed' where id = p_job;
    when 'restore'   then update public.jobs set status = 'published', moderation_status = 'approved' where id = p_job;
    when 'feature'   then update public.jobs set featured = true where id = p_job;
    when 'unfeature' then update public.jobs set featured = false where id = p_job;
    else raise exception 'Unknown action %', p_action;
  end case;
  if p_action in ('approve','reject','pause','remove') then
    perform public.notify(j.employer_id, 'listing_moderation',
      'Listing ' || case p_action when 'approve' then 'approved' when 'reject' then 'not approved' when 'pause' then 'paused by moderator' else 'removed' end,
      '“' || j.title || '”' || coalesce(' — ' || nullif(p_note,''), ''), '/dashboard/employer/listings');
  end if;
  perform public.write_audit('job.' || p_action, 'job', p_job::text, p_note);
end $$;

create or replace function public.admin_review_verification(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.verification_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into v from public.verification_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end, reviewer_id = auth.uid(), review_note = p_note, reviewed_at = now()
   where id = p_request;
  update public.employer_profiles set verification_status = case when p_approve then 'verified' else 'rejected' end where user_id = v.employer_id;
  perform public.notify(v.employer_id, 'verification_update',
    case when p_approve then 'Profile review approved' else 'Profile review not approved' end,
    case when p_approve then 'A TaskTeens administrator reviewed your profile. This is a profile review, not a background check.'
         else 'Your verification request was not approved.' || coalesce(' Note: ' || nullif(p_note,''), '') end,
    '/dashboard/employer/settings');
  perform public.write_audit(case when p_approve then 'verification.approve' else 'verification.reject' end, 'employer', v.employer_id::text, p_note);
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own status'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  update public.users set status = p_status where id = p_user;
  perform public.write_audit(case when p_status = 'suspended' then 'user.suspend' else 'user.reinstate' end, 'user', p_user::text, p_note);
end $$;

create or replace function public.admin_update_report(p_report uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.reports set status = p_status, resolution_note = coalesce(nullif(p_note,''), resolution_note) where id = p_report;
  perform public.write_audit('report.' || p_status, 'report', p_report::text, p_note);
end $$;

create or replace function public.admin_add_note(p_target_type text, p_target_id text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  perform public.write_audit('moderation.note', p_target_type, p_target_id, p_note);
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.users),
    'teens', (select count(*) from public.users where role = 'teen'),
    'employers', (select count(*) from public.users where role = 'employer'),
    'publishedJobs', (select count(*) from public.jobs where status = 'published' and moderation_status = 'approved'),
    'pendingJobs', (select count(*) from public.jobs where moderation_status = 'pending' and status <> 'draft'),
    'applications', (select count(*) from public.applications),
    'openReports', (select count(*) from public.reports where status in ('open','investigating')),
    'emergencyReports', (select count(*) from public.reports where severity = 'emergency' and status in ('open','investigating')),
    'pendingVerifications', (select count(*) from public.verification_requests where status = 'pending')
  );
end $$;

grant execute on function public.admin_moderate_job(uuid, text, text) to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
grant execute on function public.admin_update_report(uuid, text, text) to authenticated;
grant execute on function public.admin_add_note(text, text, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;

-- =====================================================================
-- Realtime (notification center + employer dashboard live updates)
-- =====================================================================
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.applications;

-- =====================================================================
-- Storage
--   resumes     (private): {teen_uid}/{file}. Owner + employers who received
--                          an application referencing the file can read.
--   job-images  (public):  {employer_uid}/{file}. Owner writes.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
       ('job-images', 'job-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy resumes_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_read on storage.objects for select to authenticated using (
  bucket_id = 'resumes' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.applications a where a.resume_path = name and a.employer_id = auth.uid())
    or public.is_admin()
  )
);

create policy job_images_read on storage.objects for select using (bucket_id = 'job-images');
create policy job_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'job-images' and (storage.foldername(name))[1] = auth.uid()::text and public.current_user_role() = 'employer');
create policy job_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-images' and (storage.foldername(name))[1] = auth.uid()::text);
