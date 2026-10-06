-- Phase 3: employer verification, admin review, job restrictions.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000003c1','newemp@test.local', now(), '{"full_name":"New Employer","role":"employer"}');
insert into public.employer_profiles (user_id, display_name, city, onboarded, legal_name) values ('00000000-0000-4000-8000-0000000003c1','New Employer','Albany', true, 'Pat Example');
\set NE '''00000000-0000-4000-8000-0000000003c1'''
\set ADM '''00000000-0000-4000-8000-0000000000d1'''

select tests.login(:NE);
select tests.ok(not (select ready_to_post from public.my_verification()), 'new employer is not ready to post');
select tests.throws($$select public.service_confirm_phone(auth.uid(), '+15105550100', 'sms_otp')$$, 'employer cannot confirm own phone directly', 'permission denied');
select tests.throws($$select public.service_check_code(auth.uid(), 'phone', '+15105550100', 'x')$$, 'employer cannot call code checker', 'permission denied');
update public.employer_profiles set phone_e164 = '+15105550100' where user_id = auth.uid();
select tests.ok((select phone_e164 from public.employer_profiles where user_id = auth.uid()) is null, 'employer cannot set phone fields directly');

-- SMS code flow (server side)
select tests.as_service();
select public.service_set_pending_phone(:NE, '+15105550100');
select public.service_store_code(:NE, 'phone', '+15105550100', 'goodhash', 10, 5);
select tests.ok(public.service_check_code(:NE, 'phone', '+15105550100', 'bad') = 'wrong', 'wrong code rejected');
select tests.ok(public.service_check_code(:NE, 'phone', '+15105550100', 'goodhash') = 'ok', 'right code accepted');
select tests.ok(public.service_check_code(:NE, 'phone', '+15105550100', 'goodhash') = 'expired', 'code is single-use');
select public.service_store_code(:NE, 'phone', '+15105550100', 'h2', 10, 5);
select public.service_check_code(:NE, 'phone', '+15105550100', 'x') from generate_series(1,4);
select tests.ok(public.service_check_code(:NE, 'phone', '+15105550100', 'x') = 'locked', 'five wrong attempts lock the code');
select tests.ok(public.service_check_code(:NE, 'phone', '+15105550100', 'h2') = 'locked', 'locked code stays locked even with the right value');
select public.service_store_code(:NE, 'phone', '+15105550100', 'h3', 10, 5);
select public.service_store_code(:NE, 'phone', '+15105550100', 'h4', 10, 5);
select public.service_store_code(:NE, 'phone', '+15105550100', 'h5', 10, 5);
select tests.throws($$select public.service_store_code('00000000-0000-4000-8000-0000000003c1', 'phone', '+15105550100', 'h6', 10, 5)$$, 'code requests are rate limited', 'Too many');
select public.service_confirm_phone(:NE, '+15105550100', 'sms_otp');

-- Address
select tests.login(:NE);
insert into public.employer_addresses (id, employer_id, line1, city, postal_code) values ('00000000-0000-4000-8000-0000000003e1', auth.uid(), '700 Solano Ave', 'Albany', '94706');
select tests.as_service();
select public.service_set_address_standardized('00000000-0000-4000-8000-0000000003e1', '{"provider":"google","deliverable":true}');
select tests.logout();
select tests.ok((select status from public.employer_addresses where id = '00000000-0000-4000-8000-0000000003e1') = 'standardized', 'address standardized');
select tests.as_service();
select tests.throws($$select public.service_confirm_address_possession('00000000-0000-4000-8000-0000000003e1')$$, 'possession cannot be confirmed before admin review', 'reviewed');

select tests.login(:ADM, 'aal2');
select tests.ok((select jsonb_array_length(addresses) from public.admin_employer_overview() where employer_id = :NE) = 1, 'admin overview lists the address');
select tests.ok(not ((select addresses from public.admin_employer_overview() where employer_id = :NE)::text like '%Solano%'), 'admin overview never includes the street line');
select public.admin_set_address_status('00000000-0000-4000-8000-0000000003e1', 'reviewed', 'Matches county records');
select tests.login(:NE);
select tests.ok(not (select ready_to_post from public.my_verification()), 'still not ready without manual review');
select tests.ok((select email_confirmed and phone_confirmed and address_reviewed and not manually_reviewed from public.employer_trust_indicators(array[auth.uid()])), 'indicators show each completed step separately');
update public.employer_profiles set legal_name = 'Changed Name' where user_id = auth.uid();
select tests.logout();
update public.employer_profiles set verification_status = 'verified', legal_name = 'Pat Example' where user_id = :NE;
select tests.login(:NE);
select tests.ok((select ready_to_post from public.my_verification()), 'ready to post after every step');
update public.employer_profiles set legal_name = 'Someone Else' where user_id = auth.uid();
select tests.ok((select verification_status from public.employer_profiles where user_id = auth.uid()) = 'pending', 'changing legal name after review requires review again');
select tests.logout();
update public.employer_profiles set verification_status = 'verified' where user_id = :NE;

-- Possession code flow
select tests.as_service();
select public.service_confirm_address_possession('00000000-0000-4000-8000-0000000003e1');
select tests.login(:NE);
select tests.ok((select address_possession_confirmed from public.employer_trust_indicators(array[auth.uid()])), 'possession confirmed indicator');

-- Admin MFA fallback for phone
select tests.login(:ADM, 'aal2');
select tests.throws($$select public.admin_confirm_phone('00000000-0000-4000-8000-0000000003c1', 'admin_phone_call', '')$$, 'manual phone confirmation needs a note', 'Describe');
select tests.login(:ADM, 'aal1');
select tests.throws($$select public.admin_confirm_phone('00000000-0000-4000-8000-0000000003c1', 'admin_phone_call', 'called')$$, 'manual confirm requires admin MFA', 'Admins only');

-- Moderation
select tests.login(:NE);
insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status)
values ('00000000-0000-4000-8000-000000003001', auth.uid(), 'Clear the gutters', 'household-help', 'Climb the ladder and clear leaves out of the gutters on the roof.', array['Clear gutters'],
  'Albany','berkeley','hourly',22,'Sat', current_date + 4, '10:00', 90, 'outdoor', 'Adult homeowner present', 'Ladder', 'Height', '00000000-0000-4000-8000-0000000003e1', 'published');
select tests.login(:ADM, 'aal2');
select tests.throws($$select public.admin_moderate_job('00000000-0000-4000-8000-000000003001', 'approve', null)$$, 'flagged listing needs an approval note', 'flagged');
select tests.throws($$select public.admin_set_category_policy('childcare-support', 'allowed', 'x')$$, 'childcare cannot be enabled', 'prohibited');
select public.admin_set_category_policy('household-help', 'review', 'pilot tightening');
select tests.ok(exists (select 1 from public.audit_logs where action = 'category.policy'), 'category policy change logged');

-- Prohibited listings are hidden publicly
select tests.logout();
update public.jobs set category = 'childcare-support', moderation_status = 'approved' where id = '00000000-0000-4000-8000-000000003001';
select tests.login(null);
select tests.ok(tests.count($$select * from public.jobs where id = '00000000-0000-4000-8000-000000003001'$$) = 0, 'prohibited category listing is hidden from the public');
select tests.logout();
\echo 'VERIFICATION TESTS PASSED'
