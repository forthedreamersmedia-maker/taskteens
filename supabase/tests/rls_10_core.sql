-- Core launch-safety permission tests (Phase 1).
set client_min_messages = notice;
\set ON_ERROR_STOP 1
-- ---------------------------------------------------------------------
-- Fixtures (as superuser)
-- ---------------------------------------------------------------------
select tests.logout();
set client_min_messages = notice;

insert into public.categories (slug,name,description,icon,active,sort) values
 ('tutoring','Tutoring','x','x',true,1), ('pet-care','Pet care','x','x',true,2), ('childcare-support','Childcare','x','x',true,3),
 ('yard-work','Yard work','x','x',true,4), ('household-help','Household help','x','x',true,9)
on conflict (slug) do nothing;
update public.categories set pilot_policy = 'allowed' where slug in ('tutoring','yard-work','household-help');
update public.categories set pilot_policy = 'prohibited' where slug = 'childcare-support';
insert into public.service_areas (slug,name,cities,active) values ('berkeley','Berkeley',array['Berkeley'],true) on conflict do nothing;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000000a1','teen1@test.local', now(), '{"full_name":"Teen One","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000000a2','teen2@test.local', now(), '{"full_name":"Teen Two","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000000b1','parent1@test.local', now(), '{"full_name":"Parent One","role":"parent"}'),
 ('00000000-0000-4000-8000-0000000000b2','parent2@test.local', now(), '{"full_name":"Parent Two","role":"parent"}'),
 ('00000000-0000-4000-8000-0000000000c1','emp1@test.local', now(), '{"full_name":"Employer One","role":"employer"}'),
 ('00000000-0000-4000-8000-0000000000c2','emp2@test.local', now(), '{"full_name":"Employer Two","role":"employer"}'),
 ('00000000-0000-4000-8000-0000000000d1','admin@test.local', now(), '{"full_name":"Admin","role":"teen"}');
update public.users set role = 'admin' where id = '00000000-0000-4000-8000-0000000000d1';
delete from public.teen_profiles where user_id = '00000000-0000-4000-8000-0000000000d1';
update public.teen_profiles set age_range = '16-17', city = 'Berkeley';

insert into public.employer_profiles (user_id, display_name, city, onboarded, verification_status, phone_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000c1','Employer One','Berkeley', true, 'verified', now()),
 ('00000000-0000-4000-8000-0000000000c2','Employer Two','Berkeley', true, 'unverified', null);
insert into public.employer_addresses (id, employer_id, line1, city, postal_code, status) values
 ('00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-0000000000c1','123 Cedar St','Berkeley','94702','reviewed');

-- Parent 1 linked + consented for Teen 1. Parent 2 linked to Teen 2 (no consent yet).
insert into public.parent_teen_links (id, parent_id, teen_id) values
 ('00000000-0000-4000-8000-00000000f001','00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1'),
 ('00000000-0000-4000-8000-00000000f002','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2');
insert into public.parent_consents (link_id, parent_id, teen_id, consent_version, statements) values
 ('00000000-0000-4000-8000-00000000f001','00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','2026-10-pilot-v1','["parent_or_guardian","approve_jobs"]');

insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
                         start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status, moderation_status)
values ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000000c1', 'Rake leaves in backyard', 'yard-work',
        'Rake and bag leaves in the backyard. Homeowner will be in the yard the whole time.', array['Rake leaves','Bag leaves'],
        'Berkeley','berkeley','hourly',20,'Saturday morning', current_date + 7, '10:00', 120, 'outdoor', 'Adult homeowner present in yard',
        'Rakes and bags provided', 'Uneven ground', '00000000-0000-4000-8000-00000000e001', 'published', 'approved');

-- Shorthand ids
\set T1 '''00000000-0000-4000-8000-0000000000a1'''
\set T2 '''00000000-0000-4000-8000-0000000000a2'''
\set P1 '''00000000-0000-4000-8000-0000000000b1'''
\set P2 '''00000000-0000-4000-8000-0000000000b2'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''
\set E2 '''00000000-0000-4000-8000-0000000000c2'''
\set A1 '''00000000-0000-4000-8000-0000000000d1'''
\set J1 '''00000000-0000-4000-8000-000000001001'''

-- =====================================================================
-- Roles & admin MFA
-- =====================================================================
select tests.login(:A1, 'aal1');
select tests.ok(not public.is_admin(), 'admin without MFA (aal1) is not treated as admin');
select tests.ok(public.is_admin_pending_mfa(), 'admin without MFA is told to enrol');
select tests.ok(tests.count('select * from public.audit_logs') = 0, 'admin at aal1 cannot read audit logs');
select tests.login(:A1, 'aal2');
select tests.ok(public.is_admin(), 'admin with MFA (aal2) is admin');

select tests.login(:T1);
update public.users set role = 'admin' where id = auth.uid();
select tests.logout();
select tests.ok((select role from public.users where id = :T1) = 'teen', 'teen cannot change own role');

-- =====================================================================
-- Parent links & consent
-- =====================================================================
select tests.login(:T1);
select tests.ok(public.teen_parent_status(auth.uid()) = 'confirmed', 'teen 1 status = confirmed (Parent confirmed)');
select tests.ok(public.teen_parent_status(:T2) is null, 'teen 1 cannot read teen 2 status');
select tests.login(:T2);
select tests.ok(public.teen_parent_status(auth.uid()) = 'none', 'teen 2 without consent = none');
select tests.throws($$insert into public.parent_teen_links (parent_id, teen_id) values ('00000000-0000-4000-8000-0000000000b1', auth.uid())$$, 'teen cannot create a parent link');
select tests.throws($$insert into public.parent_consents (link_id, parent_id, teen_id, consent_version, statements) values ('00000000-0000-4000-8000-00000000f002','00000000-0000-4000-8000-0000000000b2', auth.uid(), 'x', '[]')$$, 'teen cannot forge consent');
select tests.login(:P2);
select tests.throws($$insert into public.parent_consents (link_id, parent_id, teen_id, consent_version, statements) values ('00000000-0000-4000-8000-00000000f002', auth.uid(), '00000000-0000-4000-8000-0000000000a2', 'x', '[]')$$, 'parent cannot write consent rows directly (server records IP/version)');
select tests.ok(tests.count('select * from public.teen_profiles') = 1, 'parent 2 sees only their own linked teen profile');
select tests.ok(tests.count($$select * from public.teen_profiles where user_id = '00000000-0000-4000-8000-0000000000a1'$$) = 0, 'parent 2 cannot see teen 1');
select tests.logout();
select tests.throws($$update public.parent_consents set statements = '[]' where teen_id = '00000000-0000-4000-8000-0000000000a1'$$, 'consent text is immutable even for the database owner', 'cannot be changed');
select tests.throws($$delete from public.parent_consents$$, 'consent rows cannot be deleted', 'append-only');

-- Teen cannot unpause themselves
select tests.logout();
update public.teen_profiles set paused_at = now(), paused_by = :P1 where user_id = :T1;
select tests.login(:T1);
update public.teen_profiles set paused_at = null where user_id = auth.uid();
select tests.ok(public.teen_parent_status(auth.uid()) = 'paused', 'teen cannot lift a parent pause');
select tests.logout();
update public.teen_profiles set paused_at = null, paused_by = null where user_id = :T1;

-- =====================================================================
-- Employer verification / addresses / job restrictions
-- =====================================================================
select tests.login(:E2);
update public.employer_profiles set verification_status = 'verified', phone_confirmed_at = now() where user_id = auth.uid();
select tests.ok((select verification_status from public.employer_profiles where user_id = auth.uid()) = 'unverified', 'employer cannot self-verify');
select tests.ok((select phone_confirmed_at from public.employer_profiles where user_id = auth.uid()) is null, 'employer cannot self-confirm phone');
insert into public.employer_addresses (employer_id, line1, city, postal_code, status) values (auth.uid(), '9 Elm Ave', 'Albany', '94706', 'possession_confirmed');
select tests.ok((select status from public.employer_addresses where employer_id = auth.uid()) = 'submitted', 'employer cannot self-approve an address');
select tests.ok(tests.count($$select * from public.employer_addresses where employer_id <> auth.uid()$$) = 0, 'employer cannot read other employers'' addresses');
select tests.throws($$insert into public.jobs (employer_id, title, category, description, city, service_area, pay_type, pay_min, schedule, status)
  values (auth.uid(), 'Help in garden', 'yard-work', 'Help weed the garden beds for two hours with homeowner present.', 'Albany', 'berkeley', 'hourly', 20, 'Sat', 'published')$$,
  'unverified employer cannot publish', 'Finish verification');
select tests.ok(not (select phone_confirmed from public.employer_trust_indicators(array[auth.uid()])), 'trust indicator: phone not confirmed');

select tests.login(:A1, 'aal2');
select tests.ok(tests.count('select * from public.employer_addresses') = 0, 'admin cannot bulk-read addresses (must use logged RPC)');
select tests.ok(tests.count($$select * from public.admin_get_address('00000000-0000-4000-8000-00000000e001', 'verification review')$$) = 1, 'admin can read an address with a reason');
select tests.throws($$select * from public.admin_get_address('00000000-0000-4000-8000-00000000e001', '')$$, 'admin must give a reason', 'reason');
select tests.ok(exists (select 1 from public.audit_logs where action = 'address.view'), 'address access is audit-logged');

select tests.login(:E1);
select tests.throws($$insert into public.jobs (employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status)
  values (auth.uid(), 'After-school babysitter', 'childcare-support', 'Watch my kids after school until I get home from work.', array['Watch kids'],
  'Berkeley', 'berkeley', 'hourly', 20, 'Weekdays', current_date + 3, '15:00', 120, 'indoor_adult_present', 'Adult present', 'None', 'None',
  '00000000-0000-4000-8000-00000000e001', 'published')$$, 'prohibited category cannot be published', 'not allowed');
select tests.throws($$insert into public.jobs (employer_id, title, category, description, city, service_area, pay_type, pay_min, schedule, status, address_id, work_setting)
  values (auth.uid(), 'Help in garden', 'yard-work', 'Help weed the garden beds for two hours with homeowner present.', 'Berkeley', 'berkeley', 'hourly', 20, 'Sat', 'published', '00000000-0000-4000-8000-00000000e001', 'outdoor')$$,
  'listing missing required safety fields cannot be published', 'must include');
insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status)
values ('00000000-0000-4000-8000-000000001002', auth.uid(), 'Mow the front lawn', 'yard-work', 'Mow the front lawn with my lawn mower and trim the edges with a hedge trimmer.', array['Mow'],
  'Berkeley','berkeley','hourly',20,'Sat', current_date + 5, '09:00', 60, 'outdoor', 'Adult present', 'Lawn mower', 'Blades', '00000000-0000-4000-8000-00000000e001', 'published');
select tests.ok((select 'power_tools' = any(risk_flags) and moderation_status = 'pending' from public.jobs where id = '00000000-0000-4000-8000-000000001002'),
  'power-tool listing is flagged and held for a human moderator');
select tests.ok(public.job_risk_flags('Walk my dog while we are away') @> array['unsupervised_pet_care','alone_in_home'], 'keyword flags: pet care / home alone');

-- =====================================================================
-- Applications & parent approval
-- =====================================================================
select tests.login(:T2);
select tests.throws($$insert into public.applications (job_id, employer_id, teen_id, applicant_name, age_range, city, experience, availability, transportation,
  interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
  values ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000000c1', auth.uid(), 'Teen Two', '16-17', 'Berkeley', 'x', 'Sat', 'bike_or_walk', 'x', 'not_sure', 'will_obtain', true)$$,
  'teen without parent confirmation cannot apply', 'parent or guardian must confirm');

select tests.login(:T1);
insert into public.applications (id, job_id, employer_id, teen_id, applicant_name, applicant_email, applicant_phone, age_range, city, experience, availability, transportation,
  interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
values ('00000000-0000-4000-8000-000000002001', :J1, :E1, auth.uid(), 'Teen One', 'teen1@test.local', '5105551234', '16-17', 'Berkeley', 'Raked before', 'Sat', 'bike_or_walk',
  'I like yard work', 'not_sure', 'will_obtain', true);
select tests.ok((select applicant_email is null and applicant_phone is null from public.applications where id = '00000000-0000-4000-8000-000000002001'),
  'teen contact details are never stored on an application');
select tests.ok(tests.count($$select * from public.get_job_address('00000000-0000-4000-8000-000000002001')$$) = 0, 'teen cannot see exact address before parent approval');
select tests.ok(exists (select 1 from public.conversations where application_id = '00000000-0000-4000-8000-000000002001'), 'application gets a conversation');

select tests.login(:P1);
select tests.ok(tests.count($$select * from public.applications where teen_id = '00000000-0000-4000-8000-0000000000a1'$$) = 1, 'parent sees linked teen''s applications');
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and title = 'Your teen applied to a job'), 'parent was notified of application');
select tests.throws($$select public.parent_decide_application('00000000-0000-4000-8000-000000002001', true)$$, 'parent cannot approve before employer selection', 'not awaiting');
select tests.login(:P2);
select tests.ok(tests.count($$select * from public.applications where teen_id = '00000000-0000-4000-8000-0000000000a1'$$) = 0, 'unlinked parent cannot see another teen''s applications');

select tests.login(:E1);
select tests.throws($$update public.applications set status = 'confirmed' where id = '00000000-0000-4000-8000-000000002001'$$, 'employer cannot confirm a job', 'Only the teen or their parent');
select tests.ok(tests.count($$select applicant_email from public.applications where applicant_email is not null$$) = 0, 'employer sees no teen email/phone');
update public.applications set status = 'selected' where id = '00000000-0000-4000-8000-000000002001';

select tests.login(:T2);
select tests.throws($$select public.parent_decide_application('00000000-0000-4000-8000-000000002001', true)$$, 'a teen cannot approve as parent', 'Not allowed');
select tests.login(:P2);
select tests.throws($$select public.parent_decide_application('00000000-0000-4000-8000-000000002001', true)$$, 'unlinked parent cannot approve', 'Not allowed');
select tests.login(:P1);
select public.parent_decide_application('00000000-0000-4000-8000-000000002001', true, 'Looks fine');
select tests.ok((select status from public.applications where id = '00000000-0000-4000-8000-000000002001') = 'confirmed', 'parent approval confirms the job');
select tests.ok(tests.count('select * from public.job_shifts') = 1, 'confirmed job gets a shift');
select tests.ok((select line1 from public.get_job_address('00000000-0000-4000-8000-000000002001')) = '123 Cedar St', 'parent sees address after approval');
select tests.login(:T1);
select tests.ok((select line1 from public.get_job_address('00000000-0000-4000-8000-000000002001')) = '123 Cedar St', 'teen sees address after approval');
select tests.login(:T2);
select tests.ok(tests.count($$select * from public.get_job_address('00000000-0000-4000-8000-000000002001')$$) = 0, 'other teen never sees the address');

-- Material change invalidates approval
select tests.login(:E1);
update public.jobs set pay_min = 15 where id = :J1;
select tests.logout();
select tests.ok((select status from public.applications where id = '00000000-0000-4000-8000-000000002001') = 'selected', 'material job change sends job back to awaiting parent approval');
select tests.ok((select status from public.parent_job_approvals where application_id = '00000000-0000-4000-8000-000000002001' order by created_at desc limit 1) = 'invalidated', 'old approval invalidated');
select tests.ok((select version from public.jobs where id = :J1) = 2 and (select count(*) from public.job_versions where job_id = :J1) = 2, 'job version snapshot recorded');
select tests.ok((select moderation_status from public.jobs where id = :J1) = 'pending', 'material change sends listing back to moderation');
select tests.login(:T1);
select tests.ok(tests.count($$select * from public.get_job_address('00000000-0000-4000-8000-000000002001')$$) = 0, 'address hidden again until re-approval');
select tests.logout();
update public.jobs set moderation_status = 'approved' where id = :J1;
select tests.login(:P1);
select public.parent_decide_application('00000000-0000-4000-8000-000000002001', true, 'Approved new pay');
select tests.ok((select job_version from public.parent_job_approvals where status = 'active' and application_id = '00000000-0000-4000-8000-000000002001') = 2, 'approval re-recorded against version 2');

-- =====================================================================
-- Messaging
-- =====================================================================
select tests.logout();
\set C1 '(select id from public.conversations where application_id = ''00000000-0000-4000-8000-000000002001'')'
select tests.login(:E1);
select tests.ok((public.send_message(:C1, 'Text me at five one oh, 555, 1234 thanks') ->> 'held')::boolean, 'obfuscated phone number is held');
select tests.ok(not (public.send_message(:C1, 'See you Saturday at 10!') ->> 'held')::boolean, 'normal message delivered');
select tests.ok(((public.send_message(:C1, 'add me on snapchat') ->> 'flags')::jsonb) ? 'external_platform', 'external platform mention flagged');
select tests.throws($$delete from public.messages$$, 'employer cannot delete messages');
select tests.throws($$insert into public.messages (conversation_id, sender_role, body) values ((select id from public.conversations limit 1), 'parent', 'fake')$$, 'cannot insert messages directly (no impersonation)');
select tests.login(:T1);
select tests.ok(tests.count('select * from public.messages where delivery = ''held''') = 0, 'teen does not see held messages');
select tests.ok(tests.count('select * from public.messages') = 2, 'teen sees delivered messages');
select tests.login(:P1);
select tests.ok(tests.count('select * from public.messages') = 3, 'parent sees all messages including held');
select tests.ok((public.send_message(:C1, 'Thanks, she will be there.') ->> 'held') = 'false', 'parent can reply');
select tests.ok((select sender_role from public.messages order by created_at desc limit 1) = 'parent', 'parent reply is labelled as parent');
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and kind = 'contact_flag'), 'parent alerted about contact attempt');
select tests.login(:P2);
select tests.ok(tests.count('select * from public.messages') = 0, 'unlinked parent sees no messages');
select tests.login(:A1, 'aal2');
select tests.ok(tests.count($$select * from public.moderation_flags where status = 'open'$$) >= 2, 'admin moderation flags created');
select tests.logout();
select tests.throws($$update public.messages set body = 'x'$$, 'messages immutable even for owner', 'append-only');

-- =====================================================================
-- Location & safety alerts — employer never sees them
-- =====================================================================
select tests.logout();
insert into public.location_sharing_sessions (id, application_id, teen_id, ends_by)
values ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000002001', :T1, now() + interval '1 hour');
insert into public.location_current (session_id, teen_id, lat, lng) values ('00000000-0000-4000-8000-000000003001', :T1, 37.87, -122.27);
insert into public.safety_alerts (teen_id, application_id, employer_id, level) values (:T1, '00000000-0000-4000-8000-000000002001', :E1, 'unsafe');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.location_current') = 0, 'employer cannot see live location');
select tests.ok(tests.count('select * from public.location_sharing_sessions') = 0, 'employer cannot see sharing sessions');
select tests.ok(tests.count('select * from public.safety_alerts') = 0, 'employer cannot see safety alerts');
select tests.login(:P1);
select tests.ok(tests.count('select * from public.location_current') = 1, 'linked parent sees live location');
select tests.ok(tests.count('select * from public.safety_alerts') = 1, 'linked parent sees safety alert');
select tests.login(:P2);
select tests.ok(tests.count('select * from public.location_current') = 0, 'unlinked parent cannot see location');
select tests.login(:A1, 'aal2');
select tests.ok(tests.count('select * from public.location_current') = 0, 'admin has no direct location access');
select tests.login(:T1);
select tests.throws($$insert into public.location_current (session_id, teen_id, lat, lng) values ('00000000-0000-4000-8000-000000003001', auth.uid(), 1, 1)$$, 'location written only through RPC');
select tests.logout();
update public.location_sharing_sessions set ends_by = now() - interval '1 minute';
select tests.login(:P1);
select tests.ok(tests.count('select * from public.location_current') = 0, 'expired session location is not visible');

-- =====================================================================
-- Restrictions, deletions, audit immutability
-- =====================================================================
select tests.logout();
insert into public.account_restrictions (user_id, reason) values (:E1, 'test');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.account_restrictions') = 0, 'restricted employer cannot see restriction details');
select tests.throws($$select public.send_message((select id from public.conversations limit 1), 'hello')$$, 'restricted employer cannot message', 'restricted');
select tests.throws($$update public.jobs set title = 'Rake leaves in front yard' where id = '00000000-0000-4000-8000-000000001001'$$, 'restricted employer cannot edit listings', 'restricted');
delete from public.jobs where id = '00000000-0000-4000-8000-000000001001';
select tests.logout();
select tests.ok(exists (select 1 from public.jobs where id = :J1), 'listing with applications cannot be deleted');
select tests.throws($$update public.audit_logs set action = 'x'$$, 'audit log is append-only', 'append-only');
insert into public.admin_audit_logs (action, target_type) values ('test','test');
select tests.throws($$delete from public.admin_audit_logs$$, 'admin audit log is append-only', 'append-only');
select tests.throws($$update public.admin_audit_logs set note = 'edited'$$, 'admin audit notes cannot be edited', 'append-only');
update public.admin_audit_logs set admin_id = null;
select tests.ok(true, 'audit actor reference can be nulled when an account is deleted');
select tests.login(:E1);
select tests.throws($$insert into public.audit_logs (action, target_type) values ('x','y')$$, 'users cannot write audit logs');

select tests.logout();
\echo 'ALL RLS SAFETY TESTS PASSED'
