-- Phase 4: parent job approval, address release, cancellations.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000004a1','t4@test.local', now(), '{"full_name":"Teen Four","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000004b1','p4@test.local', now(), '{"full_name":"Parent Four","role":"parent"}');
update public.teen_profiles set age_range = '16-17', city = 'Berkeley' where user_id = '00000000-0000-4000-8000-0000000004a1';
insert into public.parent_teen_links (id, parent_id, teen_id) values ('00000000-0000-4000-8000-0000000004f1','00000000-0000-4000-8000-0000000004b1','00000000-0000-4000-8000-0000000004a1');
insert into public.parent_consents (link_id, parent_id, teen_id, consent_version, statements) values ('00000000-0000-4000-8000-0000000004f1','00000000-0000-4000-8000-0000000004b1','00000000-0000-4000-8000-0000000004a1','v1','["x"]');
-- reuse Employer One (ready, address e001) from core tests; it was restricted at the end of core tests
update public.account_restrictions set status = 'lifted' where user_id = '00000000-0000-4000-8000-0000000000c1';
insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status, moderation_status)
values ('00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-0000000000c1','Water the garden beds','yard-work','Water the vegetable beds and potted plants while I am in the garden.', array['Water plants'],
  'Berkeley','berkeley','hourly',20,'Sun', current_date + 3, '09:00', 60, 'outdoor','Adult homeowner present','Hose provided','None known','00000000-0000-4000-8000-00000000e001','published','approved'),
       ('00000000-0000-4000-8000-000000004002','00000000-0000-4000-8000-0000000000c1','Sweep the back patio','yard-work','Sweep the back patio and stack the chairs while I am outside with you.', array['Sweep'],
  'Berkeley','berkeley','hourly',20,'Sun', current_date + 3, '11:00', 60, 'outdoor','Adult homeowner present','Broom provided','None known','00000000-0000-4000-8000-00000000e001','published','approved');

\set T4 '''00000000-0000-4000-8000-0000000004a1'''
\set P4 '''00000000-0000-4000-8000-0000000004b1'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''

select tests.login(:T4);
insert into public.applications (id, job_id, employer_id, teen_id, applicant_name, age_range, city, experience, availability, transportation, interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
values ('00000000-0000-4000-8000-000000004101','00000000-0000-4000-8000-000000004001',:E1,auth.uid(),'Teen Four','16-17','Berkeley','x','Sun','bike_or_walk','x','not_sure','will_obtain',true),
       ('00000000-0000-4000-8000-000000004102','00000000-0000-4000-8000-000000004002',:E1,auth.uid(),'Teen Four','16-17','Berkeley','x','Sun','bike_or_walk','x','not_sure','will_obtain',true);
select tests.login(:E1);
update public.applications set status = 'selected' where id in ('00000000-0000-4000-8000-000000004101','00000000-0000-4000-8000-000000004102');

select tests.login(:P4);
select tests.ok((public.parent_application_detail('00000000-0000-4000-8000-000000004101') -> 'job' ->> 'supervision') = 'Adult homeowner present', 'parent sees full job terms before approving');
select tests.ok((public.parent_application_detail('00000000-0000-4000-8000-000000004101') -> 'indicators' ->> 'address_reviewed')::boolean, 'parent sees employer indicators');
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and title like 'Approval needed%'), 'parent asked to approve when teen is selected');
select public.parent_decide_application('00000000-0000-4000-8000-000000004102', false, 'Too far');
select tests.ok((select status from public.applications where id = '00000000-0000-4000-8000-000000004102') = 'parent_declined', 'parent can decline');
select tests.ok(tests.count($$select * from public.get_job_address('00000000-0000-4000-8000-000000004102')$$) = 0, 'declined job never releases the address');
select tests.login(:T4);
select tests.throws($$select public.parent_application_detail('00000000-0000-4000-8000-000000004101')$$, 'teen cannot use parent approval view', 'Not allowed');
select tests.login('00000000-0000-4000-8000-0000000000b1');
select tests.throws($$select public.parent_application_detail('00000000-0000-4000-8000-000000004101')$$, 'another teen''s parent cannot view it', 'Not allowed');

-- Past date can't be confirmed
select tests.logout();
update public.jobs set start_date = current_date - 1 where id = '00000000-0000-4000-8000-000000004001';
select tests.login(:P4);
select tests.throws($$select public.parent_decide_application('00000000-0000-4000-8000-000000004101', true)$$, 'cannot approve a job whose date passed', 'date has passed');
select tests.logout();
update public.jobs set start_date = current_date + 3 where id = '00000000-0000-4000-8000-000000004001';
-- that was a material change by the owner (privileged) — status stays selected, approve now
select tests.login(:P4);
select public.parent_decide_application('00000000-0000-4000-8000-000000004101', true, null);
select tests.ok((select status from public.applications where id = '00000000-0000-4000-8000-000000004101') = 'confirmed', 'approved job confirmed');
select tests.login(:E1);
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and body like 'A parent responded%'), 'employer told a parent responded');
select tests.ok((select line1 from public.get_job_address('00000000-0000-4000-8000-000000004101')) = '123 Cedar St', 'employer sees own address');

-- Employer changes the time -> reset + employer told
update public.jobs set start_time = '10:00' where id = '00000000-0000-4000-8000-000000004001';
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and title = 'Parent approval reset'), 'employer told approval was reset');
select tests.login(:P4);
select tests.ok((select count(*) from public.notifications where user_id = auth.uid() and title like 'Approval needed%') = 2, 'no duplicate "approval needed" alert after a reset (one per original selection)');
select tests.throws($$select public.parent_decide_application('00000000-0000-4000-8000-000000004101', true)$$, 'changed listing must pass moderation again before parent can re-approve', 'moderators');
select tests.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select public.admin_moderate_job('00000000-0000-4000-8000-000000004001', 'approve', null);
select tests.login(:P4);
select public.parent_decide_application('00000000-0000-4000-8000-000000004101', true, 'ok new time');

-- Employer cancels confirmed job -> shifts cancelled, parents told
select tests.login(:E1);
update public.applications set status = 'cancelled' where id = '00000000-0000-4000-8000-000000004101';
select tests.logout();
select tests.ok(not exists (select 1 from public.job_shifts where application_id = '00000000-0000-4000-8000-000000004101' and status in ('scheduled','active')), 'cancelling a confirmed job cancels its shifts');
select tests.ok(exists (select 1 from public.notifications where user_id = :P4 and title = 'Job cancelled'), 'parent notified of cancellation');
select tests.login(:T4);
select tests.ok(tests.count($$select * from public.get_job_address('00000000-0000-4000-8000-000000004101')$$) = 0, 'address hidden after cancellation');
select tests.logout();
\echo 'APPROVAL TESTS PASSED'
