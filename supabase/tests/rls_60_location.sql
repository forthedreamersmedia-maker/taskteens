-- Phase 6: check-ins, live location, safety tick.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();
\set T4 '''00000000-0000-4000-8000-0000000004a1'''
\set P4 '''00000000-0000-4000-8000-0000000004b1'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''
\set ADM '''00000000-0000-4000-8000-0000000000d1'''

delete from public.blocks where blocker_id = :T4;
insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status, moderation_status)
values ('00000000-0000-4000-8000-000000006001',:E1,'Tutor fourth-grade math','tutoring','Help my child with fourth-grade math homework at the kitchen table while I am home.', array['Tutor'],
  'Berkeley','berkeley','hourly',22,'Today', current_date, '16:00', 60, 'indoor_adult_present','Adult parent present the whole time','Workbook','None known','00000000-0000-4000-8000-00000000e001','published','approved');
insert into public.applications (id, job_id, employer_id, teen_id, status, applicant_name, age_range, city, experience, availability, transportation, interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
values ('00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006001',:E1,:T4,'confirmed','Teen Four','16-17','Berkeley','x','x','bike_or_walk','x','not_sure','will_obtain',true);
insert into public.job_shifts (id, application_id, starts_at, ends_at) values
 ('00000000-0000-4000-8000-000000006201','00000000-0000-4000-8000-000000006101', now() + interval '10 minutes', now() + interval '70 minutes'),
 ('00000000-0000-4000-8000-000000006202','00000000-0000-4000-8000-000000006101', now() - interval '20 minutes', now() + interval '40 minutes'),
 ('00000000-0000-4000-8000-000000006203','00000000-0000-4000-8000-000000006101', now() + interval '3 days', now() + interval '3 days 1 hour');

select tests.login(:T4);
select tests.ok((select count(*) from public.active_jobs()) = 3, 'teen sees upcoming confirmed shifts');
select tests.throws($$select public.teen_checkin('00000000-0000-4000-8000-000000006203', 'arrived')$$, 'cannot check in days early', 'opens 30 minutes');
select tests.throws($$select public.teen_checkin('00000000-0000-4000-8000-000000006201', 'finished')$$, 'cannot check out before arriving', 'first');
select tests.throws($$select public.start_location_sharing('00000000-0000-4000-8000-000000006201')$$, 'location needs parent permission', 'not allowed location');
select tests.login(:E1);
select tests.throws($$select public.teen_checkin('00000000-0000-4000-8000-000000006201', 'arrived')$$, 'employer cannot check in for the teen', 'Not allowed');

select tests.login(:P4);
select public.parent_set_location_permission(:T4, true);
select tests.throws($$select public.start_location_sharing('00000000-0000-4000-8000-000000006201')$$, 'parent cannot start sharing for the teen', 'Not allowed');
select tests.login(:T4);
select public.start_location_sharing('00000000-0000-4000-8000-000000006201') as sess \gset
select tests.ok(public.update_location(:'sess', 37.88, -122.27, 15), 'teen sends location');
select tests.ok(public.update_location(:'sess', 37.881, -122.271, 12), 'location updates in place');
select tests.logout();
select tests.ok((select count(*) from public.location_current where session_id = :'sess') = 1, 'only one latest point is stored (no history)');
select tests.login(:P4);
select tests.ok((select lat from public.location_current where session_id = :'sess') = 37.881, 'parent sees latest point');
select tests.ok((select session_id from public.active_jobs() where shift_id = '00000000-0000-4000-8000-000000006201') = :'sess', 'parent sees sharing is on');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.location_current') = 0, 'employer still cannot see location');
select tests.ok(tests.count('select * from public.active_jobs()') = 0, 'employer gets no active_jobs rows');
select tests.login(:ADM, 'aal2');
select tests.throws($$select * from public.admin_view_location('00000000-0000-4000-8000-0000000004a1', 'checking')$$, 'admin location only during an alert/incident', 'only available');

-- Check-in + check-out ends sharing
select tests.login(:T4);
select public.teen_checkin('00000000-0000-4000-8000-000000006201', 'arrived');
select tests.login(:E1);
select tests.ok(tests.count($$select * from public.job_checkins where shift_id = '00000000-0000-4000-8000-000000006201'$$) = 1, 'employer sees check-in status');
select tests.login(:T4);
select public.teen_checkin('00000000-0000-4000-8000-000000006201', 'finished');
select tests.logout();
select tests.ok(not exists (select 1 from public.location_current where session_id = :'sess'), 'checking out deletes the location point');
select tests.ok((select end_reason from public.location_sharing_sessions where id = :'sess') = 'checked_out', 'session ended on checkout');
select tests.ok(exists (select 1 from public.notifications where user_id = :P4 and title = 'Your teen checked out'), 'parent notified of checkout');

-- Missed check-in via safety tick
select tests.as_service();
select tests.ok((public.safety_tick() ->> 'missed_checkins')::int = 1, 'safety tick raises one missed check-in');
select tests.ok((public.safety_tick() ->> 'missed_checkins')::int = 0, 'missed check-in alerts only once');
select tests.logout();
select tests.ok(exists (select 1 from public.notification_deliveries d join public.safety_alerts s on s.id = d.safety_alert_id where s.level = 'missed_checkin' and d.user_id = :P4 and d.channel = 'sms'), 'missed check-in queues email and SMS to parent');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.safety_alerts') = 0, 'employer never sees the missed check-in alert');
select tests.login(:ADM, 'aal2');
select tests.ok(tests.count($$select * from public.admin_view_location('00000000-0000-4000-8000-0000000004a1', 'missed check-in follow-up')$$) = 0, 'admin may query location during an open alert (none shared now)');
select tests.ok(exists (select 1 from public.audit_logs where action = 'location.admin_view'), 'admin location access is logged');
select tests.login(:T4);
select public.teen_checkin('00000000-0000-4000-8000-000000006202', 'arrived');
select tests.logout();
select tests.ok((select status from public.safety_alerts where shift_id = '00000000-0000-4000-8000-000000006202') = 'resolved', 'late check-in resolves the missed alert');

-- Expiry
select tests.login(:T4);
select public.start_location_sharing('00000000-0000-4000-8000-000000006202') as sess2 \gset
select public.update_location(:'sess2', 37.9, -122.3, 10);
select tests.logout();
update public.location_sharing_sessions set ends_by = now() - interval '1 second' where id = :'sess2';
select tests.as_service();
select public.safety_tick();
select tests.logout();
select tests.ok(not exists (select 1 from public.location_current where session_id = :'sess2'), 'expired session location deleted by safety tick');
select tests.login(:T4);
select tests.ok(not public.update_location(:'sess2', 1, 1, 1), 'updates after expiry are refused');
-- Parent turns permission off mid-session
select public.start_location_sharing('00000000-0000-4000-8000-000000006202') as sess3 \gset
select public.update_location(:'sess3', 37.9, -122.3, 10);
select tests.login(:P4);
select public.parent_set_location_permission(:T4, false);
select tests.logout();
select tests.ok(not exists (select 1 from public.location_current where teen_id = :T4), 'parent turning permission off stops sharing immediately');
select tests.login(:T4);
select tests.ok(not public.update_location(:'sess3', 1, 1, 1), 'teen browser told sharing has stopped');
select tests.logout();
\echo 'LOCATION TESTS PASSED'
