-- =====================================================================
-- TaskTeens launch safety — Phase 1: roles, core data model, RLS.
--
-- Mapping to the spec's entity list (adapted to the existing schema):
--   profiles            -> public.users (+ teen_profiles / parent_profiles / employer_profiles)
--   role_assignments    -> public.users.role (one role per account; parents use a separate account)
--   conversation_participants -> derived: conversation.teen_id / employer_id + linked parents
--   emergency_events    -> public.safety_alerts where level = 'emergency'
--   location_points     -> public.location_current (ONE latest point per active session, deleted on end)
--   audit_logs          -> public.audit_logs (append-only) alongside admin_audit_logs (also append-only now)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Roles: add parent
-- ---------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('teen','parent','employer','admin'));

-- Admin MFA requirement (Supabase TOTP). Default ON. Admin RLS/RPCs fail until the
-- admin session is aal2.
alter table public.platform_settings add column if not exists require_admin_mfa boolean not null default true;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin' and status = 'active')
     and (
       coalesce((select require_admin_mfa from public.platform_settings where id = 1), true) = false
       or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     );
$$;

-- Admin who has not yet completed MFA (used only by the app to show the MFA enrolment screen).
create or replace function public.is_admin_pending_mfa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin' and status = 'active')
     and not public.is_admin();
$$;
grant execute on function public.is_admin_pending_mfa() to authenticated;

-- ---------------------------------------------------------------------
-- 1. Append-only audit log
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_role  text,
  action      text not null,
  target_type text not null,
  target_id   text,
  reason      text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_target_idx on public.audit_logs(target_type, target_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
create policy audit_logs_admin_read on public.audit_logs for select using (public.is_admin());
revoke insert, update, delete on public.audit_logs from anon, authenticated;

-- Append-only guard. Trigger arguments name user-reference columns that may be set to NULL
-- (so ON DELETE SET NULL works when an account is deleted); nothing else may change.
create or replace function public.prevent_mutation() returns trigger
language plpgsql as $$
declare c text; o jsonb; n jsonb;
begin
  if tg_op = 'UPDATE' and tg_nargs > 0 then
    o := to_jsonb(old); n := to_jsonb(new);
    foreach c in array tg_argv loop
      if n -> c is not null and n ->> c is not null and n -> c is distinct from o -> c then
        raise exception '% is append-only', tg_table_name;
      end if;
      o := o - c; n := n - c;
    end loop;
    if o = n then return new; end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();
create trigger admin_audit_logs_immutable before update or delete on public.admin_audit_logs
  for each row execute function public.prevent_mutation('admin_id');
create trigger audit_logs_no_truncate before truncate on public.audit_logs execute function public.prevent_mutation();
create trigger admin_audit_logs_no_truncate before truncate on public.admin_audit_logs execute function public.prevent_mutation();

create or replace function public.log_event(p_action text, p_target_type text, p_target_id text, p_reason text default null, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, reason, detail)
  values (auth.uid(), (select role from public.users where id = auth.uid()), p_action, p_target_type, p_target_id, nullif(p_reason,''), coalesce(p_detail,'{}'::jsonb));
$$;
revoke execute on function public.log_event(text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Parents, invitations, links, consent
-- ---------------------------------------------------------------------
create table public.parent_profiles (
  user_id            uuid primary key references public.users(id) on delete cascade,
  display_name       text not null default '',
  phone              text,
  phone_confirmed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger parent_profiles_touch before update on public.parent_profiles for each row execute function public.touch_updated_at();

alter table public.teen_profiles
  add column if not exists birth_date date,                 -- private; never exposed to employers
  add column if not exists parent_name text,
  add column if not exists parent_email text,
  add column if not exists phone_confirmed_at timestamptz,
  add column if not exists paused_at timestamptz,           -- set by a linked parent
  add column if not exists paused_by uuid references public.users(id);

create table public.parent_invitations (
  id           uuid primary key default gen_random_uuid(),
  teen_id      uuid not null references public.users(id) on delete cascade,
  parent_name  text not null check (char_length(parent_name) between 2 and 80),
  parent_email text not null check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash   text not null unique,          -- sha256 of the emailed token; raw token never stored
  status       text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_by  uuid references public.users(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index parent_invitations_teen_idx on public.parent_invitations(teen_id, created_at desc);
alter table public.parent_invitations enable row level security;
create policy parent_invitations_teen_read on public.parent_invitations for select using (teen_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.parent_invitations from anon, authenticated;

create table public.parent_teen_links (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.users(id) on delete cascade,
  teen_id     uuid not null references public.users(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','unlinked')),
  location_sharing_allowed boolean not null default false, -- parent-side consent for optional live location
  created_at  timestamptz not null default now(),
  unlinked_at timestamptz,
  unique (parent_id, teen_id)
);
create index parent_teen_links_teen_idx on public.parent_teen_links(teen_id) where status = 'active';

create table public.parent_consents (
  id              uuid primary key default gen_random_uuid(),
  link_id         uuid not null references public.parent_teen_links(id) on delete cascade,
  parent_id       uuid not null references public.users(id) on delete cascade,
  teen_id         uuid not null references public.users(id) on delete cascade,
  invitation_id   uuid references public.parent_invitations(id),
  consent_version text not null,
  statements      jsonb not null,             -- the exact statements the parent confirmed
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_reason  text
);
create index parent_consents_teen_idx on public.parent_consents(teen_id, created_at desc);

-- Consent rows are immutable except for revocation.
create or replace function public.guard_consent_update() returns trigger
language plpgsql as $$
begin
  if new.revoked_at is not distinct from old.revoked_at and new.revoked_reason is not distinct from old.revoked_reason then
    raise exception 'Consent records cannot be changed';
  end if;
  if old.revoked_at is not null then raise exception 'Consent already revoked'; end if;
  new.id := old.id; new.link_id := old.link_id; new.parent_id := old.parent_id; new.teen_id := old.teen_id;
  new.invitation_id := old.invitation_id; new.consent_version := old.consent_version; new.statements := old.statements;
  new.ip_address := old.ip_address; new.user_agent := old.user_agent; new.created_at := old.created_at;
  return new;
end $$;
create trigger parent_consents_guard before update on public.parent_consents for each row execute function public.guard_consent_update();
create trigger parent_consents_nodelete before delete on public.parent_consents for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------
-- 3. Account restrictions
-- ---------------------------------------------------------------------
create table public.account_restrictions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  kind                   text not null default 'temporary' check (kind in ('temporary','suspended')),
  reason                 text not null,
  related_alert_id       uuid,
  related_incident_id    uuid,
  created_by             uuid references public.users(id),
  created_by_role        text,
  status                 text not null default 'active' check (status in ('active','lifted')),
  employer_notice_sent_at timestamptz,
  created_at             timestamptz not null default now(),
  lifted_at              timestamptz,
  lifted_by              uuid references public.users(id),
  lift_note              text
);
create index account_restrictions_user_idx on public.account_restrictions(user_id) where status = 'active';
alter table public.account_restrictions enable row level security;
-- The restricted user may see that they are restricted (needed for the neutral notice), never who requested it.
create policy restrictions_admin_read on public.account_restrictions for select using (public.is_admin());
revoke insert, update, delete on public.account_restrictions from anon, authenticated;

create or replace function public.my_restriction() returns table (restricted boolean, since timestamptz, notice_sent boolean)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_restrictions where user_id = auth.uid() and status = 'active'),
         (select min(created_at) from public.account_restrictions where user_id = auth.uid() and status = 'active'),
         exists (select 1 from public.account_restrictions where user_id = auth.uid() and status = 'active' and employer_notice_sent_at is not null);
$$;
grant execute on function public.my_restriction() to authenticated;

-- Helpers ---------------------------------------------------------------
create or replace function public.is_parent_of(p_teen uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_teen_links l
                 where l.parent_id = auth.uid() and l.teen_id = p_teen and l.status = 'active')
     and public.is_active_user(auth.uid());
$$;

create or replace function public.teen_parent_confirmed(p_teen uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_consents c join public.parent_teen_links l on l.id = c.link_id
                 where c.teen_id = p_teen and c.revoked_at is null and l.status = 'active');
$$;

create or replace function public.is_restricted(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_restrictions r where r.user_id = p_user and r.status = 'active')
      or exists (select 1 from public.users u where u.id = p_user and u.status <> 'active');
$$;

create or replace function public.teen_can_apply(p_teen uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.teen_parent_confirmed(p_teen)
     and exists (select 1 from public.teen_profiles t where t.user_id = p_teen and t.paused_at is null)
     and not public.is_restricted(p_teen);
$$;

-- Precise status the UI shows the teen. Never "age verified" / "identity verified". -- banned-language-ok
create or replace function public.teen_parent_status(p_teen uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not (p_teen = auth.uid() or public.is_parent_of(p_teen) or public.is_admin()) then null
    when exists (select 1 from public.teen_profiles where user_id = p_teen and paused_at is not null) then 'paused'
    when public.teen_parent_confirmed(p_teen) then 'confirmed'
    when exists (select 1 from public.parent_consents where teen_id = p_teen and revoked_at is not null) then 'revoked'
    when exists (select 1 from public.parent_invitations where teen_id = p_teen and status = 'pending' and expires_at > now()) then 'invited'
    else 'none' end;
$$;
grant execute on function public.teen_parent_status(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Employer verification + private addresses
-- ---------------------------------------------------------------------
alter table public.employer_profiles
  add column if not exists legal_name text,
  add column if not exists phone_confirmed_at timestamptz;

create table public.verification_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('email','phone','address_standardized','address_reviewed','address_possession','manual_review')),
  status      text not null check (status in ('pending','passed','failed')),
  method      text,                       -- e.g. 'sms_otp', 'admin_phone_call', 'google_address_validation', 'mailed_code'
  detail      jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.users(id),
  created_at  timestamptz not null default now()
);
create index verification_checks_user_idx on public.verification_checks(user_id, kind, created_at desc);
alter table public.verification_checks enable row level security;
create policy verification_checks_own on public.verification_checks for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.verification_checks from anon, authenticated;

-- Server-only one-time codes (no policies => only the service role can touch them).
create table public.one_time_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  purpose     text not null check (purpose in ('phone','address_possession')),
  target      text not null,              -- phone number (E.164) or address id
  code_hash   text not null,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index one_time_codes_user_idx on public.one_time_codes(user_id, purpose, created_at desc);
alter table public.one_time_codes enable row level security;
revoke all on public.one_time_codes from anon, authenticated;

create table public.employer_addresses (
  id           uuid primary key default gen_random_uuid(),
  employer_id  uuid not null references public.employer_profiles(user_id) on delete cascade,
  line1        text not null check (char_length(line1) between 3 and 120),
  line2        text check (char_length(line2) <= 60),
  city         text not null,
  state        text not null default 'CA',
  postal_code  text not null check (postal_code ~ '^\d{5}(-\d{4})?$'),
  standardized jsonb,                     -- provider response summary (no raw provider payloads)
  status       text not null default 'submitted'
               check (status in ('submitted','standardized','pending_review','reviewed','possession_confirmed','rejected')),
  review_note  text,                      -- admin-only; never returned to users
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index employer_addresses_employer_idx on public.employer_addresses(employer_id);
create trigger employer_addresses_touch before update on public.employer_addresses for each row execute function public.touch_updated_at();
alter table public.employer_addresses enable row level security;
-- Employer reads/inserts their own; status/review_note can only change through admin RPCs.
-- Admins do NOT get a blanket select policy: they must use admin_get_address() which logs access.
create policy employer_addresses_own_read on public.employer_addresses for select using (employer_id = auth.uid());
create policy employer_addresses_own_insert on public.employer_addresses for insert with check (employer_id = auth.uid() and public.current_user_role() = 'employer');
create policy employer_addresses_own_update on public.employer_addresses for update using (employer_id = auth.uid()) with check (employer_id = auth.uid());

create or replace function public.guard_address_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'submitted'; new.review_note := null; new.standardized := null;
  else
    -- Any edit by the employer resets review status (a changed address must be reviewed again).
    if (new.line1, coalesce(new.line2,''), new.city, new.state, new.postal_code) is distinct from
       (old.line1, coalesce(old.line2,''), old.city, old.state, old.postal_code) then
      new.status := 'submitted'; new.standardized := null;
    else
      new.status := old.status; new.standardized := old.standardized;
    end if;
    new.review_note := old.review_note; new.employer_id := old.employer_id;
  end if;
  return new;
end $$;
create trigger employer_addresses_guard before insert or update on public.employer_addresses
  for each row execute function public.guard_address_write();

-- Truthful, separate indicators (public: booleans only).
create or replace function public.employer_trust_indicators(p_employers uuid[])
returns table (employer_id uuid, email_confirmed boolean, phone_confirmed boolean, address_reviewed boolean,
               address_possession_confirmed boolean, manually_reviewed boolean)
language sql stable security definer set search_path = public, auth as $$
  select e.user_id,
         exists (select 1 from auth.users au where au.id = e.user_id and au.email_confirmed_at is not null),
         e.phone_confirmed_at is not null,
         exists (select 1 from public.employer_addresses a where a.employer_id = e.user_id and a.status in ('reviewed','possession_confirmed')),
         exists (select 1 from public.employer_addresses a where a.employer_id = e.user_id and a.status = 'possession_confirmed'),
         e.verification_status = 'verified'
  from public.employer_profiles e
  where e.user_id = any(p_employers[1:200]) and e.onboarded;
$$;
grant execute on function public.employer_trust_indicators(uuid[]) to anon, authenticated;

create or replace function public.employer_ready_to_post(p_employer uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users au where au.id = p_employer and au.email_confirmed_at is not null)
     and exists (select 1 from public.employer_profiles e where e.user_id = p_employer and e.phone_confirmed_at is not null and e.verification_status = 'verified')
     and exists (select 1 from public.employer_addresses a where a.employer_id = p_employer and a.status in ('reviewed','possession_confirmed'))
     and not public.is_restricted(p_employer);
$$;
grant execute on function public.employer_ready_to_post(uuid) to authenticated;

-- Admin address access: always logged with a reason.
create or replace function public.admin_get_address(p_address uuid, p_reason text)
returns setof public.employer_addresses
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required to view an address'; end if;
  perform public.log_event('address.view', 'employer_address', p_address::text, p_reason);
  return query select * from public.employer_addresses where id = p_address;
end $$;
revoke execute on function public.admin_get_address(uuid, text) from public, anon;
grant execute on function public.admin_get_address(uuid, text) to authenticated;

-- Admin list of addresses awaiting review WITHOUT the street line (city/zip only), so review queues don't leak addresses.
create or replace function public.admin_address_queue()
returns table (id uuid, employer_id uuid, employer_name text, city text, postal_code text, status text, standardized_ok boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select a.id, a.employer_id, e.display_name, a.city, a.postal_code, a.status,
           coalesce((a.standardized->>'deliverable')::boolean, false), a.created_at
    from public.employer_addresses a join public.employer_profiles e on e.user_id = a.employer_id
    order by a.created_at;
end $$;
revoke execute on function public.admin_address_queue() from public, anon;
grant execute on function public.admin_address_queue() to authenticated;

create or replace function public.admin_set_address_status(p_address uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employer_addresses%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('pending_review','reviewed','possession_confirmed','rejected') then raise exception 'Invalid status'; end if;
  select * into a from public.employer_addresses where id = p_address for update;
  if not found then raise exception 'Address not found'; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.employer_addresses set status = p_status, review_note = nullif(p_note,'') where id = p_address;
  perform set_config('taskteens.rpc', '', true);
  insert into public.verification_checks (user_id, kind, status, method, reviewer_id, detail)
  values (a.employer_id,
          case when p_status = 'possession_confirmed' then 'address_possession' else 'address_reviewed' end,
          case when p_status = 'rejected' then 'failed' else 'passed' end,
          case when p_status = 'possession_confirmed' then 'mailed_code_or_admin' else 'admin_review' end,
          auth.uid(), jsonb_build_object('address_id', p_address));
  perform public.log_event('address.' || p_status, 'employer_address', p_address::text, p_note);
  perform public.notify(a.employer_id, 'verification_update', 'Address review updated',
    case p_status when 'rejected' then 'Your service address could not be reviewed. Check your verification page.'
                  else 'Your service address review status changed.' end, '/dashboard/employer/verification');
end $$;
revoke execute on function public.admin_set_address_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_address_status(uuid, text, text) to authenticated;

-- Admin manual phone confirmation (pilot fallback when SMS isn't configured). Recorded truthfully.
create or replace function public.admin_confirm_phone(p_user uuid, p_method text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_method not in ('admin_phone_call','admin_sms') then raise exception 'Invalid method'; end if;
  update public.employer_profiles set phone_confirmed_at = now() where user_id = p_user;
  update public.parent_profiles set phone_confirmed_at = now() where user_id = p_user;
  update public.teen_profiles set phone_confirmed_at = now() where user_id = p_user;
  insert into public.verification_checks (user_id, kind, status, method, reviewer_id, detail)
  values (p_user, 'phone', 'passed', p_method, auth.uid(), jsonb_build_object('note', nullif(p_note,'')));
  perform public.log_event('phone.confirm_manual', 'user', p_user::text, p_note, jsonb_build_object('method', p_method));
end $$;
revoke execute on function public.admin_confirm_phone(uuid, text, text) from public, anon;
grant execute on function public.admin_confirm_phone(uuid, text, text) to authenticated;

-- Employers cannot set phone_confirmed_at / legal verification fields themselves.
create or replace function public.guard_employer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.phone_confirmed_at := null;
  else
    new.verification_status := old.verification_status;
    new.phone_confirmed_at := old.phone_confirmed_at;
  end if;
  return new;
end $$;

create or replace function public.guard_teen_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.phone_confirmed_at := null; new.paused_at := null; new.paused_by := null;
  else
    new.phone_confirmed_at := old.phone_confirmed_at; new.paused_at := old.paused_at; new.paused_by := old.paused_by;
  end if;
  return new;
end $$;
create trigger teen_profiles_guard before insert or update on public.teen_profiles
  for each row execute function public.guard_teen_profile_update();

create or replace function public.guard_parent_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then new.phone_confirmed_at := null; else new.phone_confirmed_at := old.phone_confirmed_at; new.user_id := old.user_id; end if;
  return new;
end $$;
create trigger parent_profiles_guard before insert or update on public.parent_profiles
  for each row execute function public.guard_parent_profile_update();

-- ---------------------------------------------------------------------
-- 5. Pilot job restrictions
-- ---------------------------------------------------------------------
alter table public.categories
  add column if not exists pilot_policy text not null default 'review' check (pilot_policy in ('allowed','review','prohibited'));

insert into public.categories (slug, name, description, icon, active, sort) values
  ('plant-watering', 'Plant watering', 'Watering gardens and potted plants', 'Sprout', true, 11),
  ('exterior-cleaning', 'Exterior cleaning', 'Sweeping, washing outdoor furniture — no ladders or harsh chemicals', 'Sparkles', true, 12)
on conflict (slug) do nothing;

update public.categories set pilot_policy = 'allowed'    where slug in ('tutoring','yard-work','plant-watering','household-help','exterior-cleaning');
update public.categories set pilot_policy = 'prohibited' where slug in ('childcare-support');
update public.categories set pilot_policy = 'review'     where slug not in ('tutoring','yard-work','plant-watering','household-help','exterior-cleaning','childcare-support');

alter table public.jobs
  add column if not exists address_id        uuid references public.employer_addresses(id),
  add column if not exists start_time        time,
  add column if not exists duration_minutes  int check (duration_minutes is null or duration_minutes between 15 and 600),
  add column if not exists work_setting      text check (work_setting in ('outdoor','indoor_adult_present','remote','public_place')),
  add column if not exists supervision       text check (char_length(supervision) <= 500),
  add column if not exists equipment         text check (char_length(equipment) <= 500),
  add column if not exists known_risks       text check (char_length(known_risks) <= 500),
  add column if not exists risk_flags        text[] not null default '{}',
  add column if not exists version           int not null default 1;

-- Keyword flags. These only ROUTE a listing to an admin — a human makes every decision.
create or replace function public.job_risk_flags(p_text text) returns text[]
language sql immutable set search_path = public as $$
  select array_remove(array[
    case when p_text ~* '\m(babysit\w*|child ?care|nanny|watch (my|the) (kids?|children)|infant|toddler)\M' then 'childcare' end,
    case when p_text ~* '\m(driv(e|ing)|car ?pool|pick ?up (kids|my)|chauffeur|deliver(y|ies) by car)\M' then 'driving' end,
    case when p_text ~* '\m(overnight|sleep ?over|stay the night|spend the night)\M' then 'overnight' end,
    case when p_text ~* '\m(ladders?|roof\w*|gutters?|scaffold\w*|second[- ]stor(y|ey)|heights?)\M' then 'heights' end,
    case when p_text ~* '\m(power ?tools?|chain ?saw|leaf ?blower|lawn ?mower|mowing|hedge ?trimmer|weed ?whacker|drill|nail ?gun|circular saw)\M' then 'power_tools' end,
    case when p_text ~* '\m(bleach|pesticide|herbicide|roundup|oven cleaner|solvent|paint thinner|chemicals?)\M' then 'chemicals' end,
    case when p_text ~* '\m(construction|demolition|drywall|plumbing|electrical work|wiring)\M' then 'construction' end,
    case when p_text ~* '\m(heavy lifting|lift(ing)? \d{2,} ?(lbs?|pounds)|furniture moving|move (a )?(couch|piano|fridge))\M' then 'heavy_lifting' end,
    case when p_text ~* '\m(alcohol|beer|wine|liquor|bar ?tend\w*|cannabis|marijuana|weed dispensary|vape|firearms?|guns?|ammo|ammunition|casino|gambling|adult entertainment|strip club)\M' then 'restricted_substances_or_venues' end,
    case when p_text ~* '\m(cash (handling|register)|handle (large amounts of )?cash|count(ing)? cash|bank deposits?)\M' then 'cash_handling' end,
    case when p_text ~* '\m(home alone|alone in (the|my) (house|home)|while (we|i)(''re| am| are) (away|out)|let yourself in|key under|lockbox|garage code)\M' then 'alone_in_home' end,
    case when p_text ~* '\m(dog ?walk\w*|pet ?sit\w*|walk (my|the) dogs?|feed (my|the) (cat|dog|pets?))\M' then 'unsupervised_pet_care' end
  ], null);
$$;

create or replace function public.guard_job_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_require boolean; v_policy text; v_text text;
begin
  v_text := coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || array_to_string(coalesce(new.responsibilities,'{}'), ' ')
            || ' ' || coalesce(new.supervision,'') || ' ' || coalesce(new.equipment,'') || ' ' || coalesce(new.known_risks,'');
  new.risk_flags := public.job_risk_flags(v_text);

  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then return new; end if;

  select require_job_approval into v_require from public.platform_settings where id = 1;
  if tg_op = 'INSERT' then
    new.moderation_status := case when coalesce(v_require, true) then 'pending' else 'approved' end;
    new.featured := false;
    new.is_demo := false;
    new.version := 1;
    if new.status = 'removed' then new.status := 'draft'; end if;
  else
    new.employer_id := old.employer_id;
    new.featured := old.featured;
    new.is_demo := old.is_demo;
    new.version := old.version;
    if old.status = 'removed' then new.status := 'removed'; end if;
    if new.status = 'removed' and old.status <> 'removed' then raise exception 'Only administrators can remove listings'; end if;
    new.moderation_status := case when old.moderation_status = 'rejected' then 'pending' else old.moderation_status end;
    -- A material change to an approved listing goes back to a human moderator.
    if old.moderation_status = 'approved' and public.job_material_snapshot(new) is distinct from public.job_material_snapshot(old) then
      new.moderation_status := 'pending';
    end if;
  end if;
  -- Flagged listings always wait for a moderator.
  if cardinality(new.risk_flags) > 0 and new.moderation_status = 'approved'
     and (tg_op = 'INSERT' or new.risk_flags is distinct from old.risk_flags) then
    new.moderation_status := 'pending';
  end if;

  if public.is_restricted(new.employer_id) then
    raise exception 'Your account is temporarily restricted. Listings cannot be created or changed right now.' using errcode = 'P0001';
  end if;

  -- Address must belong to this employer.
  if new.address_id is not null and not exists (select 1 from public.employer_addresses a where a.id = new.address_id and a.employer_id = new.employer_id) then
    raise exception 'Choose one of your own service addresses' using errcode = 'P0001';
  end if;

  if new.status = 'published' then
    select pilot_policy into v_policy from public.categories where slug = new.category;
    if v_policy = 'prohibited' then
      raise exception 'This kind of job is not allowed during the TaskTeens pilot' using errcode = 'P0001';
    end if;
    if not public.employer_ready_to_post(new.employer_id) then
      raise exception 'Finish verification (email, phone, address review and manual review) before publishing' using errcode = 'P0001';
    end if;
    if new.start_date is null or new.start_time is null or new.duration_minutes is null
       or coalesce(trim(new.supervision),'') = '' or new.equipment is null or new.known_risks is null
       or new.work_setting is null or cardinality(new.responsibilities) = 0
       or (new.work_setting <> 'remote' and new.address_id is null) then
      raise exception 'Listings must include duties, pay, date, start time, duration, supervision, equipment, known risks and a service address' using errcode = 'P0001';
    end if;
    if new.work_setting = 'indoor_adult_present' and coalesce(new.supervision,'') !~* 'adult' then
      raise exception 'Indoor jobs require an adult to be present — describe who will be there' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Job versions (material change => parent re-approval)
-- ---------------------------------------------------------------------
create table public.job_versions (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  unique (job_id, version)
);
alter table public.job_versions enable row level security;
create policy job_versions_read on public.job_versions for select using (
  exists (select 1 from public.jobs j where j.id = job_id and j.employer_id = auth.uid())
  or exists (select 1 from public.applications a where a.job_id = job_versions.job_id and (a.teen_id = auth.uid() or public.is_parent_of(a.teen_id)))
  or public.is_admin());
revoke insert, update, delete on public.job_versions from anon, authenticated;

create or replace function public.job_material_snapshot(j public.jobs) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'title', j.title, 'category', j.category, 'description', j.description, 'responsibilities', to_jsonb(j.responsibilities),
    'pay_type', j.pay_type, 'pay_min', j.pay_min, 'pay_max', j.pay_max, 'opportunity_type', j.opportunity_type,
    'start_date', j.start_date, 'start_time', j.start_time, 'duration_minutes', j.duration_minutes, 'schedule', j.schedule,
    'recurrence', j.recurrence, 'work_mode', j.work_mode, 'work_setting', j.work_setting, 'city', j.city, 'neighborhood', j.neighborhood,
    'address_id', j.address_id, 'supervision', j.supervision, 'equipment', j.equipment, 'known_risks', j.known_risks, 'min_age', j.min_age);
$$;

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
  for r in select pa.id, pa.application_id, a.teen_id from public.parent_job_approvals pa
           join public.applications a on a.id = pa.application_id
           where a.job_id = new.id and pa.status = 'active' and pa.decision = 'approved' loop
    update public.parent_job_approvals set status = 'invalidated', invalidated_at = now(), invalidated_reason = 'Job details changed' where id = r.id;
    update public.applications set status = 'selected' where id = r.application_id and status = 'confirmed' and completed_at is null;
    update public.job_shifts set status = 'cancelled' where application_id = r.application_id and status = 'scheduled';
    perform public.notify_parents(r.teen_id, 'parent_approval', 'Job changed — approval needed again',
      'The employer changed “' || new.title || '”. Review the updated details and approve again before your teen works this job.',
      '/dashboard/parent/applications', true);
  end loop;
  perform set_config('taskteens.rpc', '', true);
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 7. Applications: parent-gated flow, no teen contact details to employers
-- ---------------------------------------------------------------------
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('submitted','viewed','interview_requested','selected','confirmed','parent_declined','not_selected','withdrawn','cancelled'));
alter table public.applications alter column applicant_email drop not null;
alter table public.applications alter column applicant_phone drop not null;
alter table public.applications add column if not exists incident_open boolean not null default false;
-- Teen contact details are no longer shared with employers. Communication happens in TaskTeens messages.
update public.applications set applicant_email = null, applicant_phone = null;

create table public.parent_job_approvals (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references public.applications(id) on delete cascade,
  parent_id          uuid not null references public.users(id) on delete cascade,
  job_version        int not null,
  snapshot           jsonb not null,           -- job terms the parent saw and approved/declined
  decision           text not null check (decision in ('approved','declined')),
  note               text check (char_length(note) <= 1000),
  status             text not null default 'active' check (status in ('active','invalidated')),
  invalidated_at     timestamptz,
  invalidated_reason text,
  created_at         timestamptz not null default now()
);
create index parent_job_approvals_app_idx on public.parent_job_approvals(application_id, created_at desc);
alter table public.parent_job_approvals enable row level security;
create policy parent_job_approvals_read on public.parent_job_approvals for select using (
  parent_id = auth.uid()
  or exists (select 1 from public.applications a where a.id = application_id and (a.teen_id = auth.uid() or public.is_parent_of(a.teen_id)))
  or public.is_admin());
revoke insert, update, delete on public.parent_job_approvals from anon, authenticated;

create table public.job_shifts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null check (ends_at > starts_at),
  status         text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled','missed')),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now()
);
create index job_shifts_app_idx on public.job_shifts(application_id, starts_at);
create index job_shifts_window_idx on public.job_shifts(status, starts_at);
alter table public.job_shifts enable row level security;
create policy job_shifts_read on public.job_shifts for select using (
  exists (select 1 from public.applications a where a.id = application_id
          and (a.teen_id = auth.uid() or a.employer_id = auth.uid() or public.is_parent_of(a.teen_id)))
  or public.is_admin());
revoke insert, update, delete on public.job_shifts from anon, authenticated;

create or replace function public.before_application_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; v_policy text;
begin
  select * into j from public.jobs where id = new.job_id;
  if not found or j.status <> 'published' or j.moderation_status <> 'approved' then
    raise exception 'This listing is not accepting applications' using errcode = 'P0001';
  end if;
  if j.deadline is not null and j.deadline < current_date then
    raise exception 'The application deadline has passed' using errcode = 'P0001';
  end if;
  if not public.is_privileged() then
    if public.current_user_role() is distinct from 'teen' then
      raise exception 'Only teen accounts can apply' using errcode = 'P0001';
    end if;
    if not public.teen_can_apply(new.teen_id) then
      raise exception 'A parent or guardian must confirm your account before you can apply' using errcode = 'P0001';
    end if;
    if public.is_restricted(j.employer_id) then
      raise exception 'This listing is not accepting applications' using errcode = 'P0001';
    end if;
    select pilot_policy into v_policy from public.categories where slug = j.category;
    if v_policy = 'prohibited' then raise exception 'This listing is not available' using errcode = 'P0001'; end if;
  end if;
  if public.is_blocked_between(new.teen_id, j.employer_id) then
    raise exception 'You cannot apply to this listing' using errcode = 'P0001';
  end if;
  new.employer_id := j.employer_id;
  if not public.is_privileged() then
    new.status := 'submitted';
    new.viewed_at := null;
    new.status_updated_at := now();
    new.created_at := now();
    new.applicant_email := null;
    new.applicant_phone := null;
    new.incident_open := false;
  end if;
  return new;
end $$;

create or replace function public.after_application_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text;
begin
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  insert into public.conversations (application_id, job_id, employer_id, teen_id) values (new.id, new.job_id, new.employer_id, new.teen_id)
  on conflict (application_id) do nothing;
  perform public.notify(new.employer_id, 'application_received', 'New application',
    new.applicant_name || ' applied to “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
  perform public.notify(new.teen_id, 'application_status', 'Application sent',
    'Your application for “' || v_title || '” was delivered to ' || v_employer || '.', '/dashboard/teen/applications');
  perform public.notify_parents(new.teen_id, 'application_status', 'Your teen applied to a job',
    'Your teen applied to “' || v_title || '” (' || v_employer || '). You will be asked to approve before any work begins.',
    '/dashboard/parent/applications', true);
  return new;
end $$;

-- Employer can move status up to "selected"; only a parent can confirm. Teens can only withdraw.
create or replace function public.guard_application_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  if old.incident_open and new.status is distinct from old.status then
    raise exception 'This job has an incident under review' using errcode = 'P0001';
  end if;

  if auth.uid() = old.teen_id then
    if old.status = 'withdrawn' and new.status = 'submitted' then
      if not public.teen_can_apply(old.teen_id) then
        raise exception 'A parent or guardian must confirm your account before you can apply' using errcode = 'P0001';
      end if;
      if not exists (select 1 from public.jobs j where j.id = old.job_id and j.status = 'published'
                     and j.moderation_status = 'approved' and (j.deadline is null or j.deadline >= current_date)) then
        raise exception 'This listing is not accepting applications' using errcode = 'P0001';
      end if;
      new := old; new.status := 'submitted'; new.viewed_at := null; new.status_updated_at := now(); new.created_at := now();
      new.completed_at := null; new.completed_by := null;
      return new;
    end if;
    if new.status <> 'withdrawn' then raise exception 'Applicants can only withdraw an application'; end if;
    if old.completed_at is not null then raise exception 'This job is already marked completed'; end if;
    new := old; new.status := 'withdrawn'; new.status_updated_at := now();
    return new;
  end if;

  if auth.uid() = old.employer_id then
    if public.is_restricted(old.employer_id) then raise exception 'Your account is temporarily restricted' using errcode = 'P0001'; end if;
    if old.status in ('withdrawn','cancelled') then raise exception 'This application is closed'; end if;
    if new.status in ('withdrawn','confirmed','parent_declined') then raise exception 'Only the teen or their parent can make that change'; end if;
    if old.completed_at is not null and new.status is distinct from old.status then
      raise exception 'This job is already marked completed';
    end if;
    -- lock every column except status + viewed_at
    new.job_id := old.job_id; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
    new.applicant_name := old.applicant_name; new.applicant_email := old.applicant_email; new.applicant_phone := old.applicant_phone;
    new.age_range := old.age_range; new.city := old.city; new.experience := old.experience; new.skills := old.skills;
    new.availability := old.availability; new.transportation := old.transportation; new.interest_statement := old.interest_statement;
    new.resume_path := old.resume_path; new.resume_name := old.resume_name; new.portfolio_url := old.portfolio_url;
    new.work_permit_status := old.work_permit_status; new.guardian_consent_status := old.guardian_consent_status;
    new.agreed_to_safety_rules := old.agreed_to_safety_rules; new.created_at := old.created_at;
    new.completed_at := old.completed_at; new.completed_by := old.completed_by; new.incident_open := old.incident_open;
    -- Employer can't jump a confirmed assignment back to selected, etc.
    if old.status = 'confirmed' and new.status not in ('confirmed','cancelled') then
      raise exception 'This job is confirmed. Cancel it instead.';
    end if;
    if new.status <> 'submitted' and new.viewed_at is null then new.viewed_at := now(); end if;
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  raise exception 'Not allowed';
end $$;

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
  elsif new.status in ('confirmed','parent_declined') then
    perform public.notify(new.employer_id, 'application_status', 'Status: ' || v_label,
      'A parent responded about “' || v_title || '”.', '/dashboard/employer/applications/' || new.id);
    perform public.notify(new.teen_id, 'application_status', 'Status: ' || v_label,
      'Update on “' || v_title || '”.', '/dashboard/teen/applications');
  else
    perform public.notify(new.teen_id, 'application_status', 'Status: ' || v_label,
      v_employer || ' updated your application for “' || v_title || '”.', '/dashboard/teen/applications');
    if new.status = 'selected' then
      perform public.notify_parents(new.teen_id, 'parent_approval', 'Approval needed: your teen was selected',
        v_employer || ' selected your teen for “' || v_title || '”. Review the job details and approve or decline.',
        '/dashboard/parent/applications', true);
    end if;
  end if;
  return new;
end $$;

-- Parent decision on an individual job (after employer selection).
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
revoke execute on function public.parent_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.parent_decide_application(uuid, boolean, text) to authenticated;

create or replace function public.parent_withdraw_application(p_application uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  select * into a from public.applications where id = p_application for update;
  if not found or not public.is_parent_of(a.teen_id) then raise exception 'Not allowed'; end if;
  if a.status in ('withdrawn','cancelled','not_selected','parent_declined') or a.completed_at is not null then raise exception 'This application is already closed'; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.applications set status = case when a.status = 'confirmed' then 'cancelled' else 'withdrawn' end where id = a.id;
  update public.job_shifts set status = 'cancelled' where application_id = a.id and status = 'scheduled';
  perform set_config('taskteens.rpc', '', true);
  perform public.log_event('parent.withdraw_application', 'application', a.id::text, p_note);
end $$;
revoke execute on function public.parent_withdraw_application(uuid, text) from public, anon;
grant execute on function public.parent_withdraw_application(uuid, text) to authenticated;

-- Exact address release. Returns nothing unless the caller is authorised.
create or replace function public.get_job_address(p_application uuid)
returns table (line1 text, line2 text, city text, state text, postal_code text)
language plpgsql stable security definer set search_path = public as $$
declare a public.applications%rowtype; j public.jobs%rowtype;
begin
  select * into a from public.applications where id = p_application;
  if not found then return; end if;
  select * into j from public.jobs where id = a.job_id;
  if j.address_id is null then return; end if;
  if auth.uid() = j.employer_id
     or ((auth.uid() = a.teen_id or public.is_parent_of(a.teen_id))
         and a.status = 'confirmed'
         and exists (select 1 from public.parent_job_approvals pa where pa.application_id = a.id and pa.status = 'active'
                     and pa.decision = 'approved' and pa.job_version = j.version)) then
    return query select ea.line1, ea.line2, ea.city, ea.state, ea.postal_code from public.employer_addresses ea where ea.id = j.address_id;
  end if;
end $$;
revoke execute on function public.get_job_address(uuid) from public, anon;
grant execute on function public.get_job_address(uuid) to authenticated;

-- Fix ratings flow for the new "confirmed" status.
create or replace function public.mark_application_completed(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype; v_by text; v_title text;
begin
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'Application not found'; end if;
  if auth.uid() = a.teen_id then v_by := 'teen';
  elsif auth.uid() = a.employer_id then v_by := 'employer';
  else raise exception 'Not allowed'; end if;
  if a.status <> 'confirmed' then raise exception 'Only a parent-approved job can be marked completed'; end if;
  if a.completed_at is not null then return; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.applications set completed_at = now(), completed_by = v_by where id = a.id;
  update public.job_shifts set status = 'completed' where application_id = a.id and status in ('scheduled','active') and starts_at <= now();
  perform set_config('taskteens.rpc', '', true);
  select title into v_title from public.jobs where id = a.job_id;
  if v_by = 'teen' then
    perform public.notify(a.employer_id, 'application_status', 'Job marked completed',
      a.applicant_name || ' marked “' || v_title || '” as completed. You can leave private feedback for TaskTeens.', '/dashboard/employer/applications/' || a.id);
  else
    perform public.notify(a.teen_id, 'application_status', 'Job marked completed',
      '“' || v_title || '” was marked completed. You can now rate this employer.', '/dashboard/teen/applications');
  end if;
  perform public.notify_parents(a.teen_id, 'job_completed', 'Job completed', '“' || v_title || '” was marked completed.', '/dashboard/parent/history', false);
end $$;

create or replace function public.submit_employer_review(
  p_application uuid, p_stars int, p_paid boolean, p_matched boolean, p_safe boolean, p_respectful boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype; v_type text;
begin
  select * into a from public.applications where id = p_application;
  if not found or a.teen_id <> auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'confirmed' or a.completed_at is null then raise exception 'You can rate an employer after the job is marked completed'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'Choose 1 to 5 stars'; end if;
  select opportunity_type into v_type from public.jobs where id = a.job_id;
  insert into public.employer_reviews (application_id, job_id, employer_id, teen_id, stars, paid_as_promised, matched_listing, felt_safe, respectful, private_note)
  values (a.id, a.job_id, a.employer_id, a.teen_id, p_stars,
          case when v_type = 'volunteer' then null else coalesce(p_paid,false) end,
          coalesce(p_matched,false), coalesce(p_safe,false), coalesce(p_respectful,false), nullif(left(trim(coalesce(p_note,'')), 1000), ''));
exception when unique_violation then raise exception 'You already rated this job';
end $$;

create or replace function public.submit_teen_feedback(
  p_application uuid, p_showed_up boolean, p_communicated boolean, p_completed boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  select * into a from public.applications where id = p_application;
  if not found or a.employer_id <> auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'confirmed' or a.completed_at is null then raise exception 'Mark the job completed before leaving feedback'; end if;
  insert into public.teen_feedback (application_id, job_id, employer_id, teen_id, showed_up, communicated, completed_job, note)
  values (a.id, a.job_id, a.employer_id, a.teen_id, coalesce(p_showed_up,false), coalesce(p_communicated,false), coalesce(p_completed,false), nullif(left(trim(coalesce(p_note,'')), 1000), ''));
exception when unique_violation then raise exception 'You already left feedback for this job';
end $$;

-- ---------------------------------------------------------------------
-- 8. Messaging
-- ---------------------------------------------------------------------
create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  employer_id    uuid not null references public.users(id) on delete cascade,
  teen_id        uuid not null references public.users(id) on delete cascade,
  locked         boolean not null default false,       -- set when an incident is open
  created_at     timestamptz not null default now(),
  last_message_at timestamptz
);
create index conversations_teen_idx on public.conversations(teen_id);
create index conversations_employer_idx on public.conversations(employer_id);
alter table public.conversations enable row level security;
create policy conversations_read on public.conversations for select using (
  teen_id = auth.uid() or employer_id = auth.uid() or public.is_parent_of(teen_id) or public.is_admin());
revoke insert, update, delete on public.conversations from anon, authenticated;

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references public.users(id) on delete set null,
  sender_role     text not null check (sender_role in ('teen','employer','parent','admin','system')),
  body            text not null check (char_length(body) between 1 and 2000),
  flags           text[] not null default '{}',
  delivery        text not null default 'delivered' check (delivery in ('delivered','held')), -- held = not shown to the other party
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
alter table public.messages enable row level security;
-- Held messages are visible to the sender, the teen's parents and admins — not to the other party.
create policy messages_read on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (
    public.is_admin()
    or public.is_parent_of(c.teen_id)
    or ((c.teen_id = auth.uid() or c.employer_id = auth.uid()) and (messages.delivery = 'delivered' or messages.sender_id = auth.uid()))
  )));
revoke insert, update, delete on public.messages from anon, authenticated;
-- Messages are never edited or deleted by anyone through the API.
create trigger messages_immutable before update or delete on public.messages for each row execute function public.prevent_mutation('sender_id');

create table public.moderation_flags (
  id              uuid primary key default gen_random_uuid(),
  source_type     text not null check (source_type in ('message','job','profile','evidence')),
  source_id       uuid not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  flagged_user_id uuid references public.users(id) on delete set null,
  reasons         text[] not null,
  severity        text not null default 'review' check (severity in ('review','held')),
  status          text not null default 'open' check (status in ('open','dismissed','actioned')),
  reviewer_id     uuid references public.users(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now()
);
create index moderation_flags_status_idx on public.moderation_flags(status, created_at desc);
alter table public.moderation_flags enable row level security;
create policy moderation_flags_admin on public.moderation_flags for select using (public.is_admin());
revoke insert, update, delete on public.moderation_flags from anon, authenticated;

-- Off-platform contact detection. Pattern matching only; cannot catch every variation.
-- Returns {reason:severity} where severity 'held' means the message is not delivered.
create or replace function public.detect_contact_attempt(p_text text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare t text; squashed text; r jsonb := '{}'::jsonb;
begin
  t := lower(coalesce(p_text,''));
  -- Normalise common obfuscation: "five one zero", "dot", "at", spaced digits.
  squashed := regexp_replace(t, '\m(zero|oh)\M', '0', 'g');
  squashed := regexp_replace(squashed, '\mone\M', '1', 'g');   squashed := regexp_replace(squashed, '\mtwo\M', '2', 'g');
  squashed := regexp_replace(squashed, '\mthree\M', '3', 'g'); squashed := regexp_replace(squashed, '\mfour\M', '4', 'g');
  squashed := regexp_replace(squashed, '\mfive\M', '5', 'g');  squashed := regexp_replace(squashed, '\msix\M', '6', 'g');
  squashed := regexp_replace(squashed, '\mseven\M', '7', 'g'); squashed := regexp_replace(squashed, '\meight\M', '8', 'g');
  squashed := regexp_replace(squashed, '\mnine\M', '9', 'g');
  squashed := regexp_replace(squashed, '[\s\.,;:\-\(\)_/\\|+*]+', '', 'g');

  if squashed ~ '\d{10,11}' or t ~ '\d{3}[\s\.\-]*\d{3}[\s\.\-]*\d{4}' then r := r || '{"phone_number":"held"}'; end if;
  if t ~ '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*(com|net|org|edu|io|co|us|me)\M' then r := r || '{"email_address":"held"}'; end if;
  if t ~ '\m(instagram|insta|ig|snapchat|snap|sc|tiktok|telegram|whatsapp|wechat|weixin|discord|signal|kik|messenger|facebook|fb|line app|imessage|facetime|venmo|cash ?app|zelle)\M' then r := r || '{"external_platform":"review"}'; end if;
  if t ~ '(^|\s)@[a-z0-9_.]{3,30}' then r := r || '{"social_handle":"held"}'; end if;
  if t ~ '\m(text|call|dm|message|hit|reach|contact|find|add|follow) (me|us)\M' or t ~ '\m(outside|off) (of )?(the )?(app|site|platform|taskteens)\M' or t ~ '\mmy (number|cell|phone|insta|snap|handle|email)\M' then
    r := r || '{"off_platform_request":"review"}';
  end if;
  if t ~ '\mqr ?code\M' then r := r || '{"qr_code_reference":"review"}'; end if;
  if t ~ '\d{2,5}\s+[a-z0-9 ]{2,30}\s(st|street|ave|avenue|rd|road|blvd|way|dr|drive|ct|court|ln|lane|pl|place|ter|terrace)\M' then r := r || '{"street_address":"held"}'; end if;
  return r;
end $$;

create or replace function public.send_message(p_conversation uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype; a public.applications%rowtype; v_role text; v_found jsonb; v_reasons text[]; v_held boolean;
        v_address_ok boolean; v_msg uuid; v_title text;
begin
  select * into c from public.conversations where id = p_conversation for update;
  if not found then raise exception 'Conversation not found'; end if;
  select * into a from public.applications where id = c.application_id;
  if auth.uid() = c.teen_id then v_role := 'teen';
  elsif auth.uid() = c.employer_id then v_role := 'employer';
  elsif public.is_parent_of(c.teen_id) then v_role := 'parent';
  else raise exception 'Not allowed'; end if;

  if c.locked or a.incident_open then raise exception 'This conversation is locked while an incident is reviewed' using errcode = 'P0001'; end if;
  if public.is_restricted(auth.uid()) then raise exception 'Your account is temporarily restricted' using errcode = 'P0001'; end if;
  if public.is_blocked_between(c.teen_id, c.employer_id) then raise exception 'Messaging is unavailable for this conversation' using errcode = 'P0001'; end if;
  if v_role = 'employer' and a.status in ('not_selected','withdrawn','parent_declined','cancelled') then
    raise exception 'This application is closed' using errcode = 'P0001';
  end if;
  if v_role = 'employer' and public.is_restricted(c.employer_id) then raise exception 'Your account is temporarily restricted' using errcode = 'P0001'; end if;

  v_found := public.detect_contact_attempt(p_body);
  -- A street address is fine once the parent has approved this job.
  v_address_ok := a.status = 'confirmed';
  if v_address_ok then v_found := v_found - 'street_address'; end if;
  select array_agg(key order by key) into v_reasons from jsonb_each_text(v_found);
  v_held := exists (select 1 from jsonb_each_text(v_found) where value = 'held');

  insert into public.messages (conversation_id, sender_id, sender_role, body, flags, delivery)
  values (c.id, auth.uid(), v_role, left(trim(p_body), 2000), coalesce(v_reasons,'{}'), case when v_held then 'held' else 'delivered' end)
  returning id into v_msg;
  update public.conversations set last_message_at = now() where id = c.id;

  select title into v_title from public.jobs where id = c.job_id;
  if v_reasons is not null then
    insert into public.moderation_flags (source_type, source_id, conversation_id, flagged_user_id, reasons, severity)
    values ('message', v_msg, c.id, auth.uid(), v_reasons, case when v_held then 'held' else 'review' end);
    perform public.notify_parents(c.teen_id, 'contact_flag', 'Possible off-platform contact attempt',
      'A message about “' || v_title || '” may try to move contact outside TaskTeens. Review the conversation.',
      '/dashboard/parent/messages?c=' || c.id, true);
  end if;

  if not v_held then
    if v_role <> 'teen' then perform public.notify(c.teen_id, 'message', 'New message', 'New message about “' || v_title || '”.', '/dashboard/teen/messages?c=' || c.id); end if;
    if v_role <> 'employer' then perform public.notify(c.employer_id, 'message', 'New message', 'New message about “' || v_title || '”.', '/dashboard/employer/messages?c=' || c.id); end if;
    if v_role <> 'parent' then perform public.notify_parents(c.teen_id, 'message', 'New message in your teen''s conversation',
      'A new message was sent about “' || v_title || '”.', '/dashboard/parent/messages?c=' || c.id, true); end if;
  end if;

  return jsonb_build_object('id', v_msg, 'held', v_held, 'flags', coalesce(to_jsonb(v_reasons), '[]'::jsonb));
end $$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

create or replace function public.admin_review_flag(p_flag uuid, p_status text, p_note text, p_release boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare f public.moderation_flags%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('dismissed','actioned') then raise exception 'Invalid status'; end if;
  select * into f from public.moderation_flags where id = p_flag for update;
  if not found then raise exception 'Flag not found'; end if;
  update public.moderation_flags set status = p_status, reviewer_id = auth.uid(), reviewed_at = now(), review_note = nullif(p_note,'') where id = p_flag;
  -- A false positive can be released to the recipient (system re-post; the original record stays untouched).
  if p_release and f.source_type = 'message' then
    insert into public.messages (conversation_id, sender_id, sender_role, body, flags, delivery)
    select m.conversation_id, m.sender_id, m.sender_role, m.body, array['released_by_moderator'], 'delivered'
    from public.messages m where m.id = f.source_id and m.delivery = 'held';
  end if;
  perform public.log_event('flag.' || p_status, 'moderation_flag', p_flag::text, p_note, jsonb_build_object('released', p_release));
end $$;
revoke execute on function public.admin_review_flag(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_review_flag(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Check-ins, optional live location
-- ---------------------------------------------------------------------
create table public.job_checkins (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references public.job_shifts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  teen_id        uuid not null references public.users(id) on delete cascade,
  kind           text not null check (kind in ('arrived','started','finished','missed')),
  created_at     timestamptz not null default now()
);
create index job_checkins_shift_idx on public.job_checkins(shift_id, created_at);
alter table public.job_checkins enable row level security;
-- Employer sees check-in status (not location).
create policy job_checkins_read on public.job_checkins for select using (
  teen_id = auth.uid() or public.is_parent_of(teen_id)
  or exists (select 1 from public.applications a where a.id = application_id and a.employer_id = auth.uid())
  or public.is_admin());
revoke insert, update, delete on public.job_checkins from anon, authenticated;

create table public.location_sharing_sessions (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid references public.job_shifts(id) on delete set null,
  application_id uuid not null references public.applications(id) on delete cascade,
  teen_id        uuid not null references public.users(id) on delete cascade,
  status         text not null default 'active' check (status in ('active','ended')),
  started_at     timestamptz not null default now(),
  ends_by        timestamptz not null,           -- scheduled end + grace; sharing is never visible past this
  ended_at       timestamptz,
  end_reason     text check (end_reason in ('teen_stopped','checked_out','job_completed','expired','incident_closed','consent_revoked'))
);
create index location_sessions_teen_idx on public.location_sharing_sessions(teen_id, status);
alter table public.location_sharing_sessions enable row level security;
create policy location_sessions_read on public.location_sharing_sessions for select using (
  teen_id = auth.uid() or public.is_parent_of(teen_id));
revoke insert, update, delete on public.location_sharing_sessions from anon, authenticated;

create table public.location_current (
  session_id  uuid primary key references public.location_sharing_sessions(id) on delete cascade,
  teen_id     uuid not null references public.users(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real,
  recorded_at timestamptz not null default now()
);
alter table public.location_current enable row level security;
-- ONLY the teen and their linked parent, ONLY while the session is active and not expired. Never employers, never admins directly.
create policy location_current_read on public.location_current for select using (
  exists (select 1 from public.location_sharing_sessions s where s.id = session_id and s.status = 'active' and s.ends_by > now())
  and (teen_id = auth.uid() or public.is_parent_of(teen_id)));
revoke insert, update, delete on public.location_current from anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. Safety alerts (unsafe / emergency SOS / missed check-in)
-- ---------------------------------------------------------------------
create table public.safety_alerts (
  id                 uuid primary key default gen_random_uuid(),
  teen_id            uuid not null references public.users(id) on delete cascade,
  application_id     uuid references public.applications(id) on delete set null,
  shift_id           uuid references public.job_shifts(id) on delete set null,
  employer_id        uuid references public.users(id) on delete set null,
  level              text not null check (level in ('unsafe','emergency','missed_checkin')),
  status             text not null default 'open' check (status in ('open','resolved')),
  call_screen_requested boolean not null default false,  -- the app opened tel:911; completion is NOT known
  countdown_cancelled boolean not null default false,
  last_location      jsonb,                               -- snapshot kept as an incident-related record
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references public.users(id),
  resolution_note    text
);
create index safety_alerts_open_idx on public.safety_alerts(status, created_at desc);
create index safety_alerts_teen_idx on public.safety_alerts(teen_id, created_at desc);
alter table public.safety_alerts enable row level security;
-- Employers can NEVER read safety alerts.
create policy safety_alerts_read on public.safety_alerts for select using (
  teen_id = auth.uid() or public.is_parent_of(teen_id) or public.is_admin());
revoke insert, update, delete on public.safety_alerts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. Incidents & evidence
-- ---------------------------------------------------------------------
create table public.incident_reports (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid references public.applications(id) on delete set null,
  job_id             uuid references public.jobs(id) on delete set null,
  teen_id            uuid references public.users(id) on delete set null,
  employer_id        uuid references public.users(id) on delete set null,
  reporter_id        uuid references public.users(id) on delete set null,
  reporter_role      text not null check (reporter_role in ('teen','parent','employer','admin')),
  category           text not null check (category in ('safety_emergency','missing_person','lost_pet','injury','property_damage','harassment','payment_dispute','job_different','other')),
  occurred_at        timestamptz,
  location_text      text check (char_length(location_text) <= 300),
  people_involved    text check (char_length(people_involved) <= 1000),
  anyone_in_danger   boolean not null default false,
  anyone_injured     boolean not null default false,
  actions_taken      text check (char_length(actions_taken) <= 2000),
  statement          text not null check (char_length(statement) between 10 and 6000),
  pet_details        jsonb,
  accuracy_confirmed boolean not null check (accuracy_confirmed),
  status             text not null default 'open' check (status in ('open','urgent','awaiting_response','referred','substantiated','unsubstantiated','inconclusive','resolved')),
  response_open      boolean not null default false,  -- other party may respond (admin decides for safety categories)
  related_alert_id   uuid references public.safety_alerts(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index incident_reports_status_idx on public.incident_reports(status, created_at desc);
create trigger incident_reports_touch before update on public.incident_reports for each row execute function public.touch_updated_at();
alter table public.incident_reports enable row level security;

create table public.incident_participants (
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('reporter','teen','parent','employer')),
  can_view    boolean not null default true,
  primary key (incident_id, user_id)
);
alter table public.incident_participants enable row level security;
create policy incident_participants_read on public.incident_participants for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.incident_participants from anon, authenticated;

create or replace function public.can_view_incident(p_incident uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.incident_participants p where p.incident_id = p_incident and p.user_id = auth.uid() and p.can_view)
      or exists (select 1 from public.incident_reports r where r.id = p_incident and r.teen_id is not null and public.is_parent_of(r.teen_id));
$$;

create policy incident_reports_read on public.incident_reports for select using (public.can_view_incident(id));
revoke insert, update, delete on public.incident_reports from anon, authenticated;

create table public.incident_responses (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  author_id   uuid references public.users(id) on delete set null,
  author_role text not null check (author_role in ('teen','parent','employer','admin')),
  body        text not null check (char_length(body) between 1 and 6000),
  admin_only  boolean not null default false,    -- internal admin notes
  created_at  timestamptz not null default now()
);
create index incident_responses_idx on public.incident_responses(incident_id, created_at);
alter table public.incident_responses enable row level security;
create policy incident_responses_read on public.incident_responses for select using (
  public.is_admin() or (not admin_only and public.can_view_incident(incident_id)));
revoke insert, update, delete on public.incident_responses from anon, authenticated;
create trigger incident_responses_immutable before update or delete on public.incident_responses for each row execute function public.prevent_mutation('author_id');

create table public.incident_evidence (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid references public.applications(id) on delete set null,
  incident_id     uuid references public.incident_reports(id) on delete set null,
  uploader_id     uuid references public.users(id) on delete set null,
  uploader_role   text not null check (uploader_role in ('teen','parent','employer','admin')),
  phase           text not null check (phase in ('before','after','incident')),
  storage_path    text not null unique,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256          text,
  original_metadata jsonb not null default '{}'::jsonb,   -- as reported by the uploader's device; may be absent or altered
  integrity_flags text[] not null default '{}',           -- indicators only (duplicate, missing metadata, ...)
  caption         text check (char_length(caption) <= 500),
  locked          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index incident_evidence_app_idx on public.incident_evidence(application_id, created_at);
create index incident_evidence_incident_idx on public.incident_evidence(incident_id);
alter table public.incident_evidence enable row level security;
create policy incident_evidence_read on public.incident_evidence for select using (
  public.is_admin()
  or uploader_id = auth.uid()
  or (incident_id is not null and public.can_view_incident(incident_id))
  or (phase in ('before','after') and exists (select 1 from public.applications a where a.id = application_id
       and (a.teen_id = auth.uid() or a.employer_id = auth.uid() or public.is_parent_of(a.teen_id)))));
revoke insert, update, delete on public.incident_evidence from anon, authenticated;
create trigger incident_evidence_nodelete before delete on public.incident_evidence for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------
-- 12. Notifications: kinds + delivery log
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'application_received','application_status','interview_requested','interview_response','verification_update','listing_moderation','system',
  'parent_invitation','parent_confirmed','parent_approval','message','contact_flag','job_reminder','checkin','missed_checkin','job_completed',
  'incident','incident_response','restriction','emergency','emergency_resolved','consent_revoked','safety_alert'));
alter table public.notifications add column if not exists priority text not null default 'normal' check (priority in ('normal','high','emergency'));

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  channel         text not null check (channel in ('email','sms')),
  status          text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_id     text,
  last_error      text,
  safety_alert_id uuid references public.safety_alerts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index notification_deliveries_pending_idx on public.notification_deliveries(status, next_attempt_at) where status in ('pending','failed');
create index notification_deliveries_alert_idx on public.notification_deliveries(safety_alert_id);
create trigger notification_deliveries_touch before update on public.notification_deliveries for each row execute function public.touch_updated_at();
alter table public.notification_deliveries enable row level security;
create policy notification_deliveries_read on public.notification_deliveries for select using (
  user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.safety_alerts s where s.id = safety_alert_id and s.teen_id = auth.uid()));
revoke insert, update, delete on public.notification_deliveries from anon, authenticated;

create or replace function public.notify_ex(p_user uuid, p_kind text, p_title text, p_body text, p_link text,
                                            p_email boolean default false, p_sms boolean default false,
                                            p_priority text default 'normal', p_alert uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.notifications (user_id, kind, title, body, link, priority) values (p_user, p_kind, p_title, p_body, p_link, p_priority)
  returning id into v_id;
  if p_email then insert into public.notification_deliveries (notification_id, user_id, channel, safety_alert_id) values (v_id, p_user, 'email', p_alert); end if;
  if p_sms then insert into public.notification_deliveries (notification_id, user_id, channel, safety_alert_id) values (v_id, p_user, 'sms', p_alert); end if;
  return v_id;
end $$;
revoke execute on function public.notify_ex(uuid, text, text, text, text, boolean, boolean, text, uuid) from public, anon, authenticated;

create or replace function public.notify_parents(p_teen uuid, p_kind text, p_title text, p_body text, p_link text, p_email boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select parent_id from public.parent_teen_links where teen_id = p_teen and status = 'active' loop
    perform public.notify_ex(r.parent_id, p_kind, p_title, p_body, p_link, p_email, false, 'normal', null);
  end loop;
end $$;
revoke execute on function public.notify_parents(uuid, text, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. Expanded read access for parents (linked teen only)
-- ---------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (
  id = auth.uid() or public.is_admin() or public.is_parent_of(id)
  or exists (select 1 from public.parent_teen_links l where l.teen_id = auth.uid() and l.parent_id = users.id and l.status = 'active'));

drop policy if exists teen_select on public.teen_profiles;
create policy teen_select on public.teen_profiles for select using (user_id = auth.uid() or public.is_parent_of(user_id) or public.is_admin());

alter table public.parent_profiles enable row level security;
create policy parent_profiles_read on public.parent_profiles for select using (
  user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.parent_teen_links l where l.parent_id = parent_profiles.user_id and l.teen_id = auth.uid() and l.status = 'active'));
create policy parent_profiles_update on public.parent_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.parent_teen_links enable row level security;
create policy parent_links_read on public.parent_teen_links for select using (parent_id = auth.uid() or teen_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.parent_teen_links from anon, authenticated;

alter table public.parent_consents enable row level security;
create policy parent_consents_read on public.parent_consents for select using (parent_id = auth.uid() or teen_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.parent_consents from anon, authenticated;

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select using (
  teen_id = auth.uid() or employer_id = auth.uid() or public.is_parent_of(teen_id) or public.is_admin());

drop policy if exists interviews_select on public.interview_requests;
create policy interviews_select on public.interview_requests for select using (
  teen_id = auth.uid() or employer_id = auth.uid() or public.is_parent_of(teen_id) or public.is_admin());

drop policy if exists employer_reviews_select on public.employer_reviews;
create policy employer_reviews_select on public.employer_reviews for select using (
  teen_id = auth.uid() or public.is_parent_of(teen_id) or public.is_admin());

-- Employers can only delete listings nobody has applied to, and never while restricted
-- (applications, messages and incident records must be preserved).
drop policy if exists jobs_employer_delete on public.jobs;
create policy jobs_employer_delete on public.jobs for delete using (
  employer_id = auth.uid() and not public.is_restricted(auth.uid())
  and not exists (select 1 from public.applications a where a.job_id = jobs.id));

-- Restricted employers can't create interview requests.
drop policy if exists interviews_insert on public.interview_requests;
create policy interviews_insert on public.interview_requests for insert with check (
  exists (select 1 from public.applications a where a.id = application_id and a.employer_id = auth.uid())
  and not public.is_restricted(auth.uid()));

-- Interview requests now also alert the parent.
create or replace function public.after_interview_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_employer text;
begin
  select j.title, e.display_name into v_title, v_employer
  from public.jobs j join public.employer_profiles e on e.user_id = j.employer_id where j.id = new.job_id;
  if tg_op = 'INSERT' then
    perform public.notify(new.teen_id, 'interview_requested', 'Interview requested',
      v_employer || ' would like to interview you for “' || v_title || '”. Pick a time in your dashboard.', '/dashboard/teen/interviews');
    perform public.notify_parents(new.teen_id, 'interview_requested', 'Interview requested for your teen',
      v_employer || ' requested an interview with your teen for “' || v_title || '”.', '/dashboard/parent/applications', true);
  elsif new.status is distinct from old.status and new.status in ('accepted','declined') then
    perform public.notify(new.employer_id, 'interview_response', 'Interview ' || new.status,
      'The applicant ' || new.status || ' the interview for “' || v_title || '”.', '/dashboard/employer/applications/' || new.application_id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 14. Triggers wiring
-- ---------------------------------------------------------------------
create trigger jobs_version_after after insert or update on public.jobs for each row execute function public.after_job_write_version();

-- New auth user: allow 'parent' sign-ups (linking still requires a valid invitation token).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := case new.raw_user_meta_data->>'role' when 'employer' then 'employer' when 'parent' then 'parent' else 'teen' end;
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
begin
  insert into public.users (id, email, full_name, role) values (new.id, new.email, v_name, v_role) on conflict (id) do nothing;
  if v_role = 'teen' then
    insert into public.teen_profiles (user_id, display_name) values (new.id, v_name) on conflict do nothing;
  elsif v_role = 'parent' then
    insert into public.parent_profiles (user_id, display_name) values (new.id, v_name) on conflict do nothing;
  end if;
  perform public.notify(new.id, 'system', 'Welcome to TaskTeens',
    case v_role when 'teen' then 'Complete your profile and invite a parent or guardian to confirm your account.'
                when 'parent' then 'Open your invitation link to confirm and link your teen''s account.'
                else 'Finish setting up and verifying your employer profile to post your first job.' end,
    case v_role when 'teen' then '/dashboard/teen/profile' when 'parent' then '/dashboard/parent' else '/onboarding/employer' end);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 15. Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.prevent_mutation() from public, anon, authenticated;
revoke execute on function public.guard_consent_update() from public, anon, authenticated;
revoke execute on function public.guard_address_write() from public, anon, authenticated;
revoke execute on function public.guard_teen_profile_update() from public, anon, authenticated;
revoke execute on function public.guard_parent_profile_update() from public, anon, authenticated;
revoke execute on function public.after_job_write_version() from public, anon, authenticated;
revoke execute on function public.guard_job_write() from public, anon, authenticated;
revoke execute on function public.before_application_insert() from public, anon, authenticated;
revoke execute on function public.after_application_insert() from public, anon, authenticated;
revoke execute on function public.guard_application_update() from public, anon, authenticated;
revoke execute on function public.notify_application_status_change() from public, anon, authenticated;
revoke execute on function public.after_interview_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_employer_update() from public, anon, authenticated;
revoke execute on function public.is_parent_of(uuid) from public, anon;
revoke execute on function public.teen_parent_confirmed(uuid) from public, anon;
revoke execute on function public.is_restricted(uuid) from public, anon;
revoke execute on function public.teen_can_apply(uuid) from public, anon;
grant execute on function public.teen_can_apply(uuid) to authenticated;
revoke execute on function public.can_view_incident(uuid) from public, anon;
revoke execute on function public.job_material_snapshot(public.jobs) from public, anon, authenticated;

-- Realtime for parent dashboards
alter publication supabase_realtime add table public.location_current;
alter publication supabase_realtime add table public.safety_alerts;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.job_checkins;
