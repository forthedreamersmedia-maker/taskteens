-- =====================================================================
-- TaskTeens launch safety — Phase 3: employer verification, admin review, job restrictions.
-- One-time codes (SMS and mailed address codes) are generated and hashed on the server; the
-- functions below are callable only with the service role.
-- =====================================================================

alter table public.employer_profiles add column if not exists phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+1\d{10}$');

-- Employer profile guard: verification fields are server/admin-only; changing the legal name
-- after review sends the profile back to manual review.
create or replace function public.guard_employer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.phone_confirmed_at := null;
    new.phone_e164 := null;
  else
    new.verification_status := old.verification_status;
    new.phone_confirmed_at := old.phone_confirmed_at;
    new.phone_e164 := old.phone_e164;
    if new.legal_name is distinct from old.legal_name and old.verification_status = 'verified' then
      new.verification_status := 'pending';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_parent_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then new.phone_confirmed_at := null; new.phone_e164 := null;
  else new.phone_confirmed_at := old.phone_confirmed_at; new.phone_e164 := old.phone_e164; new.user_id := old.user_id; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- One-time codes
-- ---------------------------------------------------------------------
create or replace function public.service_store_code(p_user uuid, p_purpose text, p_target text, p_hash text, p_ttl_minutes int, p_daily_limit int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  select count(*) into v_n from public.one_time_codes where user_id = p_user and purpose = p_purpose and created_at > now() - interval '24 hours';
  if v_n >= p_daily_limit then raise exception 'Too many codes requested today. Try again tomorrow.' using errcode = 'P0001'; end if;
  update public.one_time_codes set consumed_at = now() where user_id = p_user and purpose = p_purpose and target = p_target and consumed_at is null;
  insert into public.one_time_codes (user_id, purpose, target, code_hash, expires_at)
  values (p_user, p_purpose, p_target, p_hash, now() + make_interval(mins => p_ttl_minutes)) returning id into v_id;
  return v_id;
end $$;

-- Returns 'ok', 'wrong', 'expired' or 'locked'. Five wrong attempts lock the code.
create or replace function public.service_check_code(p_user uuid, p_purpose text, p_target text, p_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare c public.one_time_codes%rowtype;
begin
  select * into c from public.one_time_codes
   where user_id = p_user and purpose = p_purpose and target = p_target and consumed_at is null
   order by created_at desc limit 1 for update;
  if not found then return 'expired'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.code_hash <> p_hash then
    update public.one_time_codes set attempts = attempts + 1 where id = c.id;
    return case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update public.one_time_codes set consumed_at = now() where id = c.id;
  return 'ok';
end $$;

create or replace function public.service_confirm_phone(p_user uuid, p_phone text, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.users where id = p_user;
  perform set_config('taskteens.rpc', 'on', true);
  if v_role = 'employer' then
    update public.employer_profiles set phone_e164 = p_phone, phone_confirmed_at = now() where user_id = p_user;
  elsif v_role = 'parent' then
    update public.parent_profiles set phone_e164 = p_phone, phone_confirmed_at = now() where user_id = p_user;
  else
    raise exception 'Phone confirmation is for employer and parent accounts';
  end if;
  perform set_config('taskteens.rpc', '', true);
  insert into public.verification_checks (user_id, kind, status, method, detail)
  values (p_user, 'phone', 'passed', p_method, jsonb_build_object('last4', right(p_phone, 4)));
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, detail)
  values (p_user, v_role, 'phone.confirm', 'user', p_user::text, jsonb_build_object('method', p_method));
end $$;

-- Admin manual phone confirmation (pilot fallback when SMS isn't configured): also stores the number.
create or replace function public.admin_confirm_phone(p_user uuid, p_method text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_method not in ('admin_phone_call','admin_sms') then raise exception 'Invalid method'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'Describe how the number was confirmed'; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.employer_profiles set phone_confirmed_at = now() where user_id = p_user and phone_e164 is not null;
  update public.parent_profiles set phone_confirmed_at = now() where user_id = p_user and phone_e164 is not null;
  perform set_config('taskteens.rpc', '', true);
  if not found then raise exception 'The user has not submitted a phone number yet'; end if;
  insert into public.verification_checks (user_id, kind, status, method, reviewer_id, detail)
  values (p_user, 'phone', 'passed', p_method, auth.uid(), jsonb_build_object('note', p_note));
  perform public.log_event('phone.confirm_manual', 'user', p_user::text, p_note, jsonb_build_object('method', p_method));
end $$;

-- Employer saves a phone number to be confirmed (stored unconfirmed; clears any earlier confirmation).
create or replace function public.service_set_pending_phone(p_user uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('taskteens.rpc', 'on', true);
  update public.employer_profiles set phone_e164 = p_phone, phone_confirmed_at = case when phone_e164 = p_phone then phone_confirmed_at else null end where user_id = p_user;
  update public.parent_profiles set phone_e164 = p_phone, phone_confirmed_at = case when phone_e164 = p_phone then phone_confirmed_at else null end where user_id = p_user;
  perform set_config('taskteens.rpc', '', true);
end $$;

-- ---------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------
create or replace function public.service_set_address_standardized(p_address uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employer_addresses%rowtype;
begin
  select * into a from public.employer_addresses where id = p_address for update;
  if not found or a.status <> 'submitted' then return; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.employer_addresses
     set standardized = p_summary,
         status = case when p_summary is null then 'pending_review' when coalesce((p_summary->>'deliverable')::boolean, false) then 'standardized' else 'pending_review' end
   where id = p_address;
  perform set_config('taskteens.rpc', '', true);
  insert into public.verification_checks (user_id, kind, status, method, detail)
  values (a.employer_id, 'address_standardized',
          case when coalesce((p_summary->>'deliverable')::boolean, false) then 'passed' when p_summary is null then 'pending' else 'failed' end,
          coalesce(p_summary->>'provider', 'not_configured'), jsonb_build_object('address_id', p_address));
end $$;

create or replace function public.service_confirm_address_possession(p_address uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employer_addresses%rowtype;
begin
  select * into a from public.employer_addresses where id = p_address for update;
  if not found then raise exception 'Address not found'; end if;
  if a.status not in ('reviewed','possession_confirmed') then raise exception 'This address must be reviewed by TaskTeens first' using errcode = 'P0001'; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.employer_addresses set status = 'possession_confirmed' where id = p_address;
  perform set_config('taskteens.rpc', '', true);
  insert into public.verification_checks (user_id, kind, status, method, detail)
  values (a.employer_id, 'address_possession', 'passed', 'mailed_code', jsonb_build_object('address_id', p_address));
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id)
  values (a.employer_id, 'employer', 'address.possession_confirmed', 'employer_address', p_address::text);
end $$;

-- Admin queue: city/zip only, never the street line.
create or replace function public.admin_employer_overview()
returns table (employer_id uuid, display_name text, legal_name text, employer_type text, city text, verification_status text,
               email_confirmed boolean, phone_last4 text, phone_confirmed boolean, restricted boolean,
               addresses jsonb, latest_request_id uuid, latest_request_status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select e.user_id, e.display_name, e.legal_name, e.employer_type, e.city, e.verification_status,
         (select au.email_confirmed_at is not null from auth.users au where au.id = e.user_id),
         right(e.phone_e164, 4), e.phone_confirmed_at is not null, public.is_restricted(e.user_id),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'city', a.city, 'postal_code', a.postal_code, 'status', a.status,
                     'standardized', a.standardized is not null, 'deliverable', coalesce((a.standardized->>'deliverable')::boolean, false),
                     'created_at', a.created_at) order by a.created_at)
                   from public.employer_addresses a where a.employer_id = e.user_id), '[]'::jsonb),
         (select v.id from public.verification_requests v where v.employer_id = e.user_id order by v.created_at desc limit 1),
         (select v.status from public.verification_requests v where v.employer_id = e.user_id order by v.created_at desc limit 1),
         e.created_at
  from public.employer_profiles e
  order by (e.verification_status = 'pending') desc, e.created_at desc;
end $$;

-- Employer's own verification checklist (booleans + statuses, no admin notes).
create or replace function public.my_verification()
returns table (email_confirmed boolean, phone_last4 text, phone_confirmed boolean, legal_name text,
               verification_status text, ready_to_post boolean, restricted boolean)
language sql stable security definer set search_path = public, auth as $$
  select (select au.email_confirmed_at is not null from auth.users au where au.id = e.user_id),
         right(e.phone_e164, 4), e.phone_confirmed_at is not null, e.legal_name, e.verification_status,
         public.employer_ready_to_post(e.user_id), public.is_restricted(e.user_id)
  from public.employer_profiles e where e.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Pilot policy for categories is admin-editable; expose it publicly.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_category_policy(p_slug text, p_policy text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_policy not in ('allowed','review','prohibited') then raise exception 'Invalid policy'; end if;
  if p_slug = 'childcare-support' and p_policy <> 'prohibited' then raise exception 'Childcare stays prohibited during the pilot'; end if;
  update public.categories set pilot_policy = p_policy where slug = p_slug;
  perform public.log_event('category.policy', 'category', p_slug, p_note, jsonb_build_object('policy', p_policy));
end $$;

-- Prohibited categories are hidden from public browsing (employers/admins/applicants still see their own).
drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs for select using (
  (status = 'published' and moderation_status = 'approved' and public.is_active_user(employer_id)
     and coalesce((select c.pilot_policy from public.categories c where c.slug = jobs.category), 'review') <> 'prohibited')
  or employer_id = auth.uid()
  or exists (select 1 from public.applications a where a.job_id = jobs.id and (a.teen_id = auth.uid() or public.is_parent_of(a.teen_id)))
  or public.is_admin());

-- Moderation: a human approves; flagged listings need a written reason; prohibited categories can't be approved.
create or replace function public.admin_moderate_job(p_job uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; v_policy text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Listing not found'; end if;
  select pilot_policy into v_policy from public.categories where slug = j.category;
  if p_action in ('approve','restore') and v_policy = 'prohibited' then raise exception 'This category is prohibited during the pilot'; end if;
  if p_action in ('approve','restore') and cardinality(j.risk_flags) > 0 and coalesce(trim(p_note),'') = '' then
    raise exception 'This listing is flagged for: %. Add a note explaining why it is acceptable.', array_to_string(j.risk_flags, ', ');
  end if;
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

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke execute on function public.service_store_code(uuid, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.service_check_code(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.service_confirm_phone(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.service_set_pending_phone(uuid, text) from public, anon, authenticated;
revoke execute on function public.service_set_address_standardized(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.service_confirm_address_possession(uuid) from public, anon, authenticated;
grant execute on function public.service_store_code(uuid, text, text, text, int, int) to service_role;
grant execute on function public.service_check_code(uuid, text, text, text) to service_role;
grant execute on function public.service_confirm_phone(uuid, text, text) to service_role;
grant execute on function public.service_set_pending_phone(uuid, text) to service_role;
grant execute on function public.service_set_address_standardized(uuid, jsonb) to service_role;
grant execute on function public.service_confirm_address_possession(uuid) to service_role;
revoke execute on function public.admin_employer_overview() from public, anon;
revoke execute on function public.my_verification() from public, anon;
revoke execute on function public.admin_set_category_policy(text, text, text) from public, anon;
grant execute on function public.admin_employer_overview() to authenticated;
grant execute on function public.my_verification() to authenticated;
grant execute on function public.admin_set_category_policy(text, text, text) to authenticated;
grant execute on function public.admin_confirm_phone(uuid, text, text) to authenticated;
-- Used by the public jobs policy; returns false for signed-out visitors.
grant execute on function public.is_parent_of(uuid) to anon;
-- Childcare is always prohibited during the pilot, however the row is written.
create or replace function public.force_childcare_prohibited() returns trigger
language plpgsql as $$
begin
  if new.slug = 'childcare-support' then new.pilot_policy := 'prohibited'; end if;
  return new;
end $$;
revoke execute on function public.force_childcare_prohibited() from public, anon, authenticated;
create trigger categories_childcare_prohibited before insert or update on public.categories
  for each row execute function public.force_childcare_prohibited();
