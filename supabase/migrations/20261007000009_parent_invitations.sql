-- =====================================================================
-- TaskTeens launch safety — Phase 2: parent invitations, consent, parent controls.
-- Invitation tokens are generated and hashed on the server; only the SHA-256 hash is stored.
-- Creation / acceptance run through server routes with the service role (they record IP and
-- user agent and send email); every function below re-checks its own rules.
-- =====================================================================

alter table public.teen_profiles
  add constraint teen_birth_date_range check (birth_date is null or (birth_date > date '1990-01-01' and birth_date <= current_date - interval '12 years'));

alter table public.teen_profiles add column if not exists parent_phone text check (parent_phone is null or parent_phone ~ '^\+1\d{10}$');
alter table public.parent_profiles add column if not exists phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+1\d{10}$');

alter table public.parent_invitations
  add column if not exists parent_phone text check (parent_phone is null or parent_phone ~ '^\+1\d{10}$'),
  add column if not exists email_status text not null default 'pending' check (email_status in ('pending','sent','failed','skipped')),
  add column if not exists email_error text,
  add column if not exists last_sent_at timestamptz;

create or replace function public.create_parent_invitation(p_teen uuid, p_name text, p_email text, p_phone text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_teen public.users%rowtype; v_id uuid; v_recent int;
begin
  select * into v_teen from public.users where id = p_teen;
  if not found or v_teen.role <> 'teen' or v_teen.status <> 'active' then raise exception 'Only active teen accounts can invite a parent'; end if;
  if lower(trim(p_email)) = lower(v_teen.email) then
    raise exception 'Use your parent or guardian''s own email address, not yours' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users u where lower(u.email) = lower(trim(p_email)) and u.role in ('teen','employer','admin')) then
    raise exception 'That email belongs to a non-parent TaskTeens account. Use a different email for your parent or guardian.' using errcode = 'P0001';
  end if;
  select count(*) into v_recent from public.parent_invitations where teen_id = p_teen and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'You can send up to 3 parent invitations a day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  update public.parent_invitations set status = 'revoked' where teen_id = p_teen and status = 'pending';
  insert into public.parent_invitations (teen_id, parent_name, parent_email, parent_phone, token_hash)
  values (p_teen, trim(p_name), lower(trim(p_email)), p_phone, p_token_hash) returning id into v_id;
  update public.teen_profiles set parent_name = trim(p_name), parent_email = lower(trim(p_email)), parent_phone = coalesce(p_phone, parent_phone) where user_id = p_teen;
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id) values (p_teen, 'teen', 'parent_invitation.create', 'parent_invitation', v_id::text);
  return v_id;
end $$;

create or replace function public.record_invitation_email(p_invitation uuid, p_status text, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.parent_invitations set email_status = p_status, email_error = left(p_error, 300), last_sent_at = now() where id = p_invitation;
$$;

-- What the invitation page may show: only the teen's first name and the invited parent's name.
create or replace function public.parent_invitation_preview(p_token_hash text)
returns table (invitation_id uuid, teen_first_name text, parent_name text, parent_email text, status text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, split_part(u.full_name, ' ', 1), i.parent_name, i.parent_email,
         case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end, i.expires_at
  from public.parent_invitations i join public.users u on u.id = i.teen_id
  where i.token_hash = p_token_hash;
$$;

create or replace function public.accept_parent_invitation(
  p_token_hash text, p_parent uuid, p_consent_version text, p_statements jsonb, p_ip text, p_user_agent text, p_allow_location boolean)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare i public.parent_invitations%rowtype; v_parent public.users%rowtype; v_link uuid; v_email_confirmed timestamptz;
begin
  select * into i from public.parent_invitations where token_hash = p_token_hash for update;
  if not found then raise exception 'This invitation link is not valid' using errcode = 'P0001'; end if;
  if i.status <> 'pending' then raise exception 'This invitation was already used or replaced' using errcode = 'P0001'; end if;
  if i.expires_at <= now() then
    update public.parent_invitations set status = 'expired' where id = i.id;
    raise exception 'This invitation has expired. Ask your teen to send a new one.' using errcode = 'P0001';
  end if;
  select * into v_parent from public.users where id = p_parent;
  if not found or v_parent.role <> 'parent' or v_parent.status <> 'active' then
    raise exception 'Sign in with a parent/guardian account to accept' using errcode = 'P0001';
  end if;
  select email_confirmed_at into v_email_confirmed from auth.users where id = p_parent;
  if v_email_confirmed is null then raise exception 'Confirm your email address first' using errcode = 'P0001'; end if;
  if lower(v_parent.email) <> lower(i.parent_email) then
    raise exception 'This invitation was sent to a different email address. Sign in with the invited email.' using errcode = 'P0001';
  end if;
  if p_parent = i.teen_id then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_statements) <> 'array' or jsonb_array_length(p_statements) < 1 then raise exception 'Consent statements are required'; end if;

  insert into public.parent_teen_links (parent_id, teen_id, status, location_sharing_allowed)
  values (p_parent, i.teen_id, 'active', coalesce(p_allow_location, false))
  on conflict (parent_id, teen_id) do update set status = 'active', unlinked_at = null, location_sharing_allowed = coalesce(p_allow_location, false)
  returning id into v_link;

  insert into public.parent_consents (link_id, parent_id, teen_id, invitation_id, consent_version, statements, ip_address, user_agent)
  values (v_link, p_parent, i.teen_id, i.id, p_consent_version, p_statements, left(p_ip, 64), left(p_user_agent, 400));

  update public.parent_invitations set status = 'accepted', accepted_by = p_parent, accepted_at = now() where id = i.id;
  -- The phone number the teen gave is stored on the parent profile UNCONFIRMED (the parent can confirm it later).
  perform set_config('taskteens.rpc', 'on', true);
  update public.parent_profiles set display_name = coalesce(nullif(display_name,''), i.parent_name),
                                    phone_e164 = coalesce(phone_e164, i.parent_phone)
   where user_id = p_parent;
  perform set_config('taskteens.rpc', '', true);

  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, detail)
  values (p_parent, 'parent', 'parent_consent.give', 'teen', i.teen_id::text, jsonb_build_object('version', p_consent_version, 'location', coalesce(p_allow_location,false)));
  perform public.notify_ex(i.teen_id, 'parent_confirmed', 'Parent confirmed',
    'Your parent or guardian confirmed your TaskTeens account. You can now apply to jobs.', '/dashboard/teen', true);
  return v_link;
end $$;

-- Parent controls -------------------------------------------------------
create or replace function public.parent_set_pause(p_teen uuid, p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_teen) then raise exception 'Not allowed'; end if;
  perform set_config('taskteens.rpc', 'on', true);
  update public.teen_profiles set paused_at = case when p_paused then now() else null end,
                                  paused_by = case when p_paused then auth.uid() else null end
   where user_id = p_teen;
  perform set_config('taskteens.rpc', '', true);
  perform public.log_event(case when p_paused then 'parent.pause_teen' else 'parent.resume_teen' end, 'teen', p_teen::text);
  perform public.notify_ex(p_teen, 'system',
    case when p_paused then 'Your account is paused' else 'Your account is active again' end,
    case when p_paused then 'Your parent or guardian paused your account. You can''t apply to new jobs until they resume it.'
         else 'Your parent or guardian resumed your account.' end, '/dashboard/teen', false);
end $$;

create or replace function public.parent_set_location_permission(p_teen uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_teen) then raise exception 'Not allowed'; end if;
  update public.parent_teen_links set location_sharing_allowed = p_allowed where parent_id = auth.uid() and teen_id = p_teen and status = 'active';
  if not p_allowed and not exists (select 1 from public.parent_teen_links where teen_id = p_teen and status = 'active' and location_sharing_allowed) then
    delete from public.location_current where teen_id = p_teen;
    update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'consent_revoked' where teen_id = p_teen and status = 'active';
  end if;
  perform public.log_event('parent.location_permission', 'teen', p_teen::text, null, jsonb_build_object('allowed', p_allowed));
end $$;

create or replace function public.parent_revoke_consent(p_teen uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_parent_of(p_teen) then raise exception 'Not allowed'; end if;
  update public.parent_consents set revoked_at = now(), revoked_reason = nullif(left(trim(coalesce(p_reason,'')), 500), '')
   where parent_id = auth.uid() and teen_id = p_teen and revoked_at is null;
  update public.parent_teen_links set location_sharing_allowed = false where parent_id = auth.uid() and teen_id = p_teen;
  perform public.log_event('parent_consent.revoke', 'teen', p_teen::text, p_reason);

  -- With no active consent left, open applications close and location sharing stops.
  if not public.teen_parent_confirmed(p_teen) then
    perform set_config('taskteens.rpc', 'on', true);
    for r in select id, status from public.applications
             where teen_id = p_teen and completed_at is null and not incident_open
               and status not in ('withdrawn','not_selected','parent_declined','cancelled') loop
      update public.applications set status = case when r.status = 'confirmed' then 'cancelled' else 'withdrawn' end where id = r.id;
      update public.job_shifts set status = 'cancelled' where application_id = r.id and status = 'scheduled';
    end loop;
    perform set_config('taskteens.rpc', '', true);
    delete from public.location_current where teen_id = p_teen;
    update public.location_sharing_sessions set status = 'ended', ended_at = now(), end_reason = 'consent_revoked' where teen_id = p_teen and status = 'active';
  end if;
  perform public.notify_ex(p_teen, 'consent_revoked', 'Parent consent withdrawn',
    'Your parent or guardian withdrew consent. Open applications were closed, and you can''t apply to jobs until a parent confirms again.', '/dashboard/teen', true);
end $$;

-- Teen-facing parent summary: names and status only (never the parent's phone).
create or replace function public.my_parents()
returns table (parent_name text, linked_at timestamptz, consent_active boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(pp.display_name,''), u.full_name), l.created_at,
         exists (select 1 from public.parent_consents c where c.link_id = l.id and c.revoked_at is null)
  from public.parent_teen_links l join public.users u on u.id = l.parent_id left join public.parent_profiles pp on pp.user_id = l.parent_id
  where l.teen_id = auth.uid() and l.status = 'active';
$$;

-- Parent overview of linked teens.
create or replace function public.my_teens()
returns table (teen_id uuid, full_name text, age_range text, city text, status text, paused boolean,
               location_sharing_allowed boolean, consent_version text, consent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.teen_id, u.full_name, t.age_range, t.city, public.teen_parent_status(l.teen_id), t.paused_at is not null,
         l.location_sharing_allowed,
         (select c.consent_version from public.parent_consents c where c.link_id = l.id and c.revoked_at is null order by c.created_at desc limit 1),
         (select c.created_at from public.parent_consents c where c.link_id = l.id and c.revoked_at is null order by c.created_at desc limit 1)
  from public.parent_teen_links l join public.users u on u.id = l.teen_id left join public.teen_profiles t on t.user_id = l.teen_id
  where l.parent_id = auth.uid() and l.status = 'active';
$$;

revoke execute on function public.create_parent_invitation(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.record_invitation_email(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.parent_invitation_preview(text) from public, anon, authenticated;
revoke execute on function public.accept_parent_invitation(text, uuid, text, jsonb, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.parent_set_pause(uuid, boolean) from public, anon;
revoke execute on function public.parent_set_location_permission(uuid, boolean) from public, anon;
revoke execute on function public.parent_revoke_consent(uuid, text) from public, anon;
revoke execute on function public.my_parents() from public, anon;
revoke execute on function public.my_teens() from public, anon;
grant execute on function public.parent_set_pause(uuid, boolean) to authenticated;
grant execute on function public.parent_set_location_permission(uuid, boolean) to authenticated;
grant execute on function public.parent_revoke_consent(uuid, text) to authenticated;
grant execute on function public.my_parents() to authenticated;
grant execute on function public.my_teens() to authenticated;
grant execute on function public.create_parent_invitation(uuid, text, text, text, text) to service_role;
grant execute on function public.record_invitation_email(uuid, text, text) to service_role;
grant execute on function public.parent_invitation_preview(text) to service_role;
grant execute on function public.accept_parent_invitation(text, uuid, text, jsonb, text, text, boolean) to service_role;

-- Teen sign-up collects the parent's name, email and phone. They're kept privately on the teen
-- profile; the invitation itself is sent once the teen confirms their own email (see app server).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := case new.raw_user_meta_data->>'role' when 'employer' then 'employer' when 'parent' then 'parent' else 'teen' end;
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
  v_pphone text := new.raw_user_meta_data->>'parent_phone';
begin
  insert into public.users (id, email, full_name, role) values (new.id, new.email, v_name, v_role) on conflict (id) do nothing;
  if v_role = 'teen' then
    insert into public.teen_profiles (user_id, display_name, parent_name, parent_email, parent_phone)
    values (new.id, v_name,
            nullif(left(trim(new.raw_user_meta_data->>'parent_name'), 80), ''),
            nullif(lower(trim(new.raw_user_meta_data->>'parent_email')), ''),
            case when v_pphone ~ '^\+1\d{10}$' then v_pphone end)
    on conflict do nothing;
  elsif v_role = 'parent' then
    insert into public.parent_profiles (user_id, display_name) values (new.id, v_name) on conflict do nothing;
  end if;
  perform public.notify(new.id, 'system', 'Welcome to TaskTeens',
    case v_role when 'teen' then 'Your parent or guardian will get an email invitation to confirm your account once you confirm your email.'
                when 'parent' then 'Open your invitation link to confirm and link your teen''s account.'
                else 'Finish setting up and verifying your employer profile to post your first job.' end,
    case v_role when 'teen' then '/dashboard/teen' when 'parent' then '/dashboard/parent' else '/onboarding/employer' end);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
