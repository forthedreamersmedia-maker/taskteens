-- Phase 8: incident reports, statements, evidence.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();
\set T7 '''00000000-0000-4000-8000-0000000007a1'''
\set P7 '''00000000-0000-4000-8000-0000000007b1'''
\set X7 '''00000000-0000-4000-8000-0000000007a2'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''
\set ADM '''00000000-0000-4000-8000-0000000000d1'''
\set APP '''00000000-0000-4000-8000-000000007101'''

-- Who can file
select tests.login(:X7);
select tests.throws($$select public.file_incident_report('00000000-0000-4000-8000-000000007101', 'harassment', 'Something happened here', p_accuracy_confirmed => true)$$, 'unrelated teen cannot report on someone else''s job', 'Not allowed');
select tests.login(:T7);
select tests.throws($$select public.file_incident_report('00000000-0000-4000-8000-000000007101', 'harassment', 'Something happened here')$$, 'accuracy confirmation required', 'accurate');
select tests.throws($$select public.file_incident_report('00000000-0000-4000-8000-000000007101', 'lost_pet', 'The dog ran out the gate', p_accuracy_confirmed => true)$$, 'lost pet needs pet details', 'describe the pet');
select tests.throws($$select public.file_incident_report('00000000-0000-4000-8000-000000007101', 'other', 'short', p_accuracy_confirmed => true)$$, 'statement must be meaningful', 'at least 10');

-- Teen files a harassment report: urgent, job frozen, employer can't see it yet
select public.file_incident_report(:APP, 'harassment', 'The homeowner kept making comments about my appearance and asked for my number.',
  now() - interval '1 hour', 'Backyard', 'Homeowner', false, false, 'I left early', null, true) as inc \gset
select tests.logout();
select tests.ok((select status from public.incident_reports where id = :'inc') = 'urgent', 'harassment report is urgent');
select tests.ok((select incident_open from public.applications where id = :APP), 'safety report freezes the job');
select tests.ok(exists (select 1 from public.notifications where user_id = :ADM and kind = 'incident'), 'admins notified');
select tests.ok(exists (select 1 from public.notifications where user_id = :P7 and title = 'An incident report involves your teen'), 'parent notified');
select tests.ok(not exists (select 1 from public.notifications where user_id = :E1 and kind = 'incident'), 'employer not notified yet');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.incident_reports') = 0, 'employer cannot read the report before it is opened');
select tests.ok(tests.count('select * from public.my_incidents()') = 0, 'employer sees no reports in list');
select tests.throws($$select public.add_incident_statement('$$ || :'inc' || $$', 'Not true')$$, 'employer cannot add a statement yet', 'Not allowed');
select tests.login(:P7);
select tests.ok(tests.count('select * from public.my_incidents()') = 1, 'parent sees the report');
select public.add_incident_statement(:'inc', 'My daughter called me upset right after.');
select tests.login(:X7);
select tests.ok(tests.count('select * from public.incident_reports') = 0, 'unrelated teen cannot read the report');

-- Evidence
select tests.login(:T7);
insert into storage.objects (bucket_id, name, owner) values ('incident-evidence', '00000000-0000-4000-8000-0000000007a1/photo1.jpg', :T7);
select tests.throws($$insert into storage.objects (bucket_id, name) values ('incident-evidence', '00000000-0000-4000-8000-0000000000c1/x.jpg')$$, 'cannot upload into someone else''s folder', 'row-level security');
select tests.throws($$select public.register_evidence(null, '$$ || :'inc' || $$', 'incident', '00000000-0000-4000-8000-0000000000c1/x.jpg', 'image/jpeg', 100, 'abc', '{}', null)$$, 'cannot register another user''s file path', 'Invalid file path');
select tests.throws($$select public.register_evidence(null, '$$ || :'inc' || $$', 'incident', '00000000-0000-4000-8000-0000000007a1/a.exe', 'application/x-msdownload', 100, 'abc', '{}', null)$$, 'file type allow-list', 'isn''t accepted');
select public.register_evidence(null, :'inc', 'incident', '00000000-0000-4000-8000-0000000007a1/photo1.jpg', 'image/jpeg', 2048, 'sha-1', '{"last_modified":"2026-10-01T10:00:00Z","name":"IMG_1.jpg"}', 'Text messages') as ev1 \gset
select public.register_evidence(null, :'inc', 'incident', '00000000-0000-4000-8000-0000000007a1/photo2.jpg', 'image/jpeg', 2048, 'sha-1', '{}', null) as ev2 \gset
select tests.logout();
select tests.ok((select locked and integrity_flags = '{}' from public.incident_evidence where id = :'ev1'), 'incident evidence is locked, no flags');
select tests.ok((select integrity_flags @> array['duplicate_file','missing_device_metadata'] from public.incident_evidence where id = :'ev2'), 'duplicate and missing metadata flagged');
select tests.throws($$update public.incident_evidence set caption = 'edited' where id = '$$ || :'ev1' || $$'$$, 'evidence records cannot be edited', 'can''t be changed');
select tests.throws($$delete from public.incident_evidence where id = '$$ || :'ev1' || $$'$$, 'evidence records cannot be deleted', null);
select tests.login(:P7);
select tests.ok(tests.count($$select * from storage.objects where name = '00000000-0000-4000-8000-0000000007a1/photo1.jpg'$$) = 1, 'parent can download evidence file');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.incident_evidence') = 0, 'employer cannot see incident evidence yet');
select tests.ok(tests.count($$select * from storage.objects where bucket_id = 'incident-evidence'$$) = 0, 'employer cannot download evidence files');

-- Admin opens responses
select tests.login(:ADM, 'aal2');
select tests.ok((select status from public.admin_incidents() where id = :'inc') = 'urgent', 'admin sees it');
select public.admin_open_incident_response(:'inc', 'Asking the employer for their side');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = :E1 and kind = 'incident' and body not ilike '%harass%'), 'employer gets a neutral request to respond');
select tests.login(:E1);
select tests.ok(tests.count('select * from public.incident_reports') = 1, 'employer can read it once opened');
select public.add_incident_statement(:'inc', 'I asked for her number only to schedule the next job.');
select tests.login(:ADM, 'aal2');
select public.add_incident_statement(:'inc', 'Internal: check prior reports on this employer.', true);
select tests.login(:E1);
select tests.ok(tests.count('select * from public.incident_responses where admin_only') = 0, 'admin-only notes hidden from participants');
select tests.throws($$update public.incident_responses set body = 'changed'$$, 'statements are append-only', null);

-- Close + unfreeze
select tests.login(:ADM, 'aal2');
select tests.throws($$select public.admin_set_incident_status('$$ || :'inc' || $$', 'inconclusive', '')$$, 'closing needs a note', 'note');
select public.admin_set_incident_status(:'inc', 'inconclusive', 'Conflicting accounts; employer warned about contact rules.', true);
select tests.logout();
select tests.ok(not (select incident_open from public.applications where id = :APP), 'job unfrozen after close');
select tests.login(:T7);
select tests.throws($$select public.add_incident_statement('$$ || :'inc' || $$', 'one more thing')$$, 'closed reports take no more statements', 'closed');
select tests.ok((select admin_outcome_note is not null from public.incident_reports where id = :'inc'), 'reporter sees the outcome note');
select tests.logout();
select tests.ok(exists (select 1 from public.audit_logs where action = 'incident.status'), 'status change audit-logged');
\echo 'INCIDENT TESTS PASSED'
