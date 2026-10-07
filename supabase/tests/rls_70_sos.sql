-- Phase 7: teen SOS alerts and temporary restrictions.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();
\set T7 '''00000000-0000-4000-8000-0000000007a1'''
\set P7 '''00000000-0000-4000-8000-0000000007b1'''
\set X7 '''00000000-0000-4000-8000-0000000007a2'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''
\set ADM '''00000000-0000-4000-8000-0000000000d1'''

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000007a1','sos-teen@test.local', now(), '{"full_name":"Sam Seven","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000007a2','other-teen7@test.local', now(), '{"full_name":"Other Teen","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000007b1','sos-parent@test.local', now(), '{"full_name":"Pat Seven","role":"parent"}');
select public.create_parent_invitation(:T7, 'Pat Seven', 'sos-parent@test.local', '+15105550177', 'hash-sos');
select public.accept_parent_invitation('hash-sos', :P7, 'v1', '["a"]', '1.1.1.1', 'ua', true);
select public.create_parent_invitation(:X7, 'Pat Seven', 'sos-parent@test.local', null, 'hash-sos-x');
select public.accept_parent_invitation('hash-sos-x', :P7, 'v1', '["a"]', '1.1.1.1', 'ua', false);
update public.parent_profiles set phone_e164 = '+15105550177' where user_id = :P7;

insert into public.jobs (id, employer_id, title, category, description, responsibilities, city, service_area, pay_type, pay_min, schedule,
  start_date, start_time, duration_minutes, work_setting, supervision, equipment, known_risks, address_id, status, moderation_status)
values ('00000000-0000-4000-8000-000000007001',:E1,'Water the garden','yard-work','Water the vegetable garden and front lawn while the homeowner is home.', array['Water plants'],
  'Berkeley','berkeley','hourly',20,'Today', current_date, '16:00', 60, 'outdoor','Adult present','Hose','None known','00000000-0000-4000-8000-00000000e001','published','approved');
insert into public.applications (id, job_id, employer_id, teen_id, status, applicant_name, age_range, city, experience, availability, transportation, interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
values ('00000000-0000-4000-8000-000000007101','00000000-0000-4000-8000-000000007001',:E1,:T7,'confirmed','Sam Seven','16-17','Berkeley','x','x','bike_or_walk','x','not_sure','will_obtain',true);
insert into public.job_shifts (id, application_id, starts_at, ends_at) values
 ('00000000-0000-4000-8000-000000007201','00000000-0000-4000-8000-000000007101', now() - interval '10 minutes', now() + interval '50 minutes');
select id as conv from public.conversations where application_id = '00000000-0000-4000-8000-000000007101' \gset

-- Who can raise alerts
select tests.login(:E1);
select tests.throws($$select public.raise_safety_alert('emergency')$$, 'employers cannot raise teen alerts', 'Only teen');
select tests.login(:P7);
select tests.throws($$select public.raise_safety_alert('unsafe')$$, 'parents cannot raise teen alerts', 'Only teen');
select tests.login(:T7);
select tests.throws($$select public.raise_safety_alert('panic')$$, 'invalid level rejected', 'Invalid');
select tests.throws($$select public.raise_safety_alert('unsafe', '00000000-0000-4000-8000-000000006101')$$, 'cannot attach an alert to another teen''s job', 'Not allowed');

-- Unsafe alert during the job
select public.start_location_sharing('00000000-0000-4000-8000-000000007201') as sess \gset
select public.update_location(:'sess', 37.87, -122.26, 20);
select public.raise_safety_alert('unsafe', null, 'He keeps asking me to come inside') as unsafe_id \gset
select tests.ok((select application_id from public.safety_alerts where id = :'unsafe_id') = '00000000-0000-4000-8000-000000007101', 'alert is linked to the job happening now');
select tests.ok((select (last_location->>'lat')::float = 37.87 from public.safety_alerts where id = :'unsafe_id'), 'last shared location is snapshotted');
select tests.ok(public.raise_safety_alert('unsafe') = :'unsafe_id', 'repeat taps return the same open alert');
select tests.ok((select parents_notified = 1 and deliveries_pending >= 2 from public.my_open_alerts() where id = :'unsafe_id'), 'teen sees honest delivery status (queued, not "sent")');
select tests.logout();
select tests.ok((select incident_open from public.applications where id = '00000000-0000-4000-8000-000000007101'), 'job conversation frozen');
select tests.ok(not public.is_restricted(:E1), '"unsafe" does not auto-restrict the employer');
select tests.ok(exists (select 1 from public.notification_deliveries d where d.safety_alert_id = :'unsafe_id' and d.user_id = :P7 and d.channel = 'sms'), 'parent gets an SMS delivery');
select tests.ok(exists (select 1 from public.notification_deliveries d where d.safety_alert_id = :'unsafe_id' and d.user_id = :ADM and d.channel = 'email'), 'admins get an email delivery');

select tests.login(:T7);
select tests.throws($$select public.send_message('$$ || :'conv' || $$', 'hello')$$, 'messages locked during an alert', 'locked');

-- Employers never see alerts
select tests.login(:E1);
select tests.ok(tests.count('select * from public.safety_alerts') = 0, 'employer cannot read safety alerts');
select tests.ok(tests.count('select * from public.parent_open_alerts()') = 0, 'employer gets no parent alert rows');
select tests.throws($$select * from public.admin_safety_alerts()$$, 'employer cannot use admin alert list', 'Admins only');

-- Emergency upgrades and restricts the employer
select tests.login(:T7);
select public.raise_safety_alert('emergency') as em_id \gset
select tests.ok(:'em_id' <> :'unsafe_id', 'emergency creates its own alert');
select public.alert_call_screen_opened(:'em_id');
select tests.logout();
select tests.ok((select call_screen_requested from public.safety_alerts where id = :'em_id'), 'records only that the call screen was opened');
select tests.ok(public.is_restricted(:E1), 'emergency temporarily restricts the employer');
select tests.ok((select created_by_role = 'system' and employer_notice_sent_at is null from public.account_restrictions where related_alert_id = :'em_id'), 'automatic restriction sends no notice to the employer');
select tests.ok(exists (select 1 from public.notifications where user_id = :P7 and kind = 'emergency' and priority = 'emergency'), 'parent gets an emergency-priority notification');
select tests.ok(not exists (select 1 from public.notifications where user_id = :E1 and kind in ('emergency','safety_alert','restriction')), 'employer is not told about the alert');

-- Restricted employer effects
select tests.login(null);
select tests.ok(not exists (select 1 from public.jobs where id = '00000000-0000-4000-8000-000000007001'), 'restricted employer''s listing hidden from the public');
select tests.login(:T7);
select tests.ok(exists (select 1 from public.jobs where id = '00000000-0000-4000-8000-000000007001'), 'teen who applied still sees the listing');
select tests.login(:X7);
select tests.ok(public.teen_can_apply(:X7), 'second teen can otherwise apply');
select tests.throws($$insert into public.applications (job_id, employer_id, teen_id, applicant_name, age_range, city, experience, availability, transportation, interest_statement, work_permit_status, guardian_consent_status, agreed_to_safety_rules)
  values ('00000000-0000-4000-8000-000000007001','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000007a2','Other','16-17','Berkeley','x','x','bike_or_walk','x','not_sure','will_obtain',true)$$,
  'cannot apply to a restricted employer', 'not accepting');
select tests.login(:E1);
select tests.ok((select restricted from public.my_restriction()), 'restricted user can see they are restricted');
select tests.ok(tests.count('select * from public.account_restrictions') = 0, 'restricted user cannot read the restriction record (who/why)');

-- Parent view + teen "I'm safe"
select tests.login(:P7);
select tests.ok(tests.count('select * from public.parent_open_alerts()') = 2, 'parent sees both open alerts');
select tests.login(:T7);
select public.teen_mark_safe(:'em_id', 'I left and I am with my neighbor');
select tests.logout();
select tests.ok((select teen_says_safe_at is not null and status = 'open' from public.safety_alerts where id = :'em_id'), '"I''m safe" keeps the alert open for a parent/admin');
select tests.ok(exists (select 1 from public.notifications where user_id = :P7 and title like '%says they are safe now'), 'parent told the teen says they are safe');
select tests.login(:X7);
select tests.throws($$select public.teen_mark_safe('$$ || :'em_id' || $$')$$, 'other teen cannot touch the alert', 'Not allowed');

select tests.login(:P7);
select public.parent_resolve_alert(:'em_id', 'Talked to Sam, she is home');
select tests.logout();
select tests.ok((select status from public.safety_alerts where id = :'em_id') = 'resolved', 'parent can close the alert');
select tests.ok(public.is_restricted(:E1), 'parent closing the alert does not lift the employer restriction');
select tests.ok((select incident_open from public.applications where id = '00000000-0000-4000-8000-000000007101'), 'job stays frozen until admin review');

-- Admin review
select tests.login(:ADM, 'aal1');
select tests.throws($$select * from public.admin_safety_alerts()$$, 'admin needs MFA (aal2) for alerts', 'Admins only');
select tests.login(:ADM, 'aal2');
select tests.ok(tests.count('select * from public.admin_safety_alerts(true)') >= 2, 'admin lists alerts');
select tests.throws($$select public.admin_alert_location('$$ || :'unsafe_id' || $$', '')$$, 'location view needs a reason', 'reason');
select tests.ok((public.admin_alert_location(:'unsafe_id', 'Reviewing the alert')->>'lat')::float = 37.87, 'admin sees snapshot with a reason');
select tests.throws($$select public.admin_resolve_alert('$$ || :'unsafe_id' || $$', '')$$, 'resolution needs a note', 'note');
select public.admin_resolve_alert(:'unsafe_id', 'Spoke with teen and parent', true);
select tests.logout();
select tests.ok(not (select incident_open from public.applications where id = '00000000-0000-4000-8000-000000007101'), 'admin can unfreeze the job once nothing is open');
select tests.ok(exists (select 1 from public.audit_logs where action = 'alert.location_view'), 'location view audit-logged');

select tests.login(:ADM, 'aal2');
select id as rid from public.admin_restrictions() where user_id = '00000000-0000-4000-8000-0000000000c1' limit 1 \gset
select public.admin_send_restriction_notice(:'rid');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = :E1 and kind = 'restriction' and body !~* '\mteens?\M' and body !~* 'parent'), 'notice to employer is neutral');
select tests.login(:ADM, 'aal2');
select tests.throws($$select public.admin_restrict_user('00000000-0000-4000-8000-0000000000d1', 'x')$$, 'admin cannot restrict themselves', 'own account');
select public.admin_lift_restriction(:'rid', 'Reviewed; no further action');
select tests.logout();
select tests.ok(not public.is_restricted(:E1), 'restriction lifted');
select tests.ok(exists (select 1 from public.audit_logs where action = 'restriction.lift'), 'lift audit-logged');
\echo 'SOS TESTS PASSED'
