-- Phase 5: messaging, parent visibility, notification delivery queue.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();
\set T4 '''00000000-0000-4000-8000-0000000004a1'''
\set P4 '''00000000-0000-4000-8000-0000000004b1'''
\set E1 '''00000000-0000-4000-8000-0000000000c1'''
\set C4 '(select id from public.conversations where application_id = ''00000000-0000-4000-8000-000000004101'')'

-- application 4101 was cancelled in the approval tests; use the declined one? Re-open a fresh selection.
select tests.login(:E1);
select tests.ok(tests.count('select * from public.my_conversations()') >= 1, 'employer inbox lists conversations');
select tests.throws($$select public.send_message((select id from public.conversations where application_id = '00000000-0000-4000-8000-000000004101'), 'Hi again')$$, 'employer cannot message on a cancelled application', 'closed');
select tests.login(:T4);
select tests.ok((public.send_message(:C4, 'Thanks for letting me know.') ->> 'held') = 'false', 'teen can still message on a closed application');
select tests.ok((select unread from public.my_conversations() where application_id = '00000000-0000-4000-8000-000000004101') = 0, 'own messages are not unread');
select tests.login(:P4);
select tests.ok((select unread from public.my_conversations() where application_id = '00000000-0000-4000-8000-000000004101') >= 1, 'parent sees unread teen message');
select public.mark_conversation_read(:C4);
select tests.ok((select unread from public.my_conversations() where application_id = '00000000-0000-4000-8000-000000004101') = 0, 'mark read clears unread');
select tests.ok((select last_sender_role from public.my_conversations() where application_id = '00000000-0000-4000-8000-000000004101') = 'teen', 'inbox shows last sender role');
select tests.login('00000000-0000-4000-8000-0000000002b2');
select tests.throws($$select public.mark_conversation_read((select id from public.conversations limit 1))$$, 'unrelated parent cannot touch conversation', 'Not allowed');

-- Block
select tests.login(:P4);
select public.block_in_conversation(:C4, 'not comfortable');
select tests.ok((select blocked from public.my_conversations() where application_id = '00000000-0000-4000-8000-000000004101'), 'parent can block the employer for their teen');
select tests.login(:T4);
select tests.throws($$select public.send_message((select id from public.conversations where application_id = '00000000-0000-4000-8000-000000004101'), 'hi')$$, 'blocked conversation cannot be used', 'unavailable');

-- Delivery queue
select tests.logout();
select tests.ok(exists (select 1 from public.notification_deliveries where user_id = :P4 and channel = 'email' and status = 'pending'), 'parent emails are queued');
select tests.login(:P4);
select tests.throws($$select * from public.claim_deliveries(5)$$, 'users cannot claim deliveries', 'permission denied');
select tests.ok(tests.count('select * from public.notification_deliveries') >= 1, 'parent sees own delivery records');
select tests.as_service();
create temp table claimed as select * from public.claim_deliveries(500);
select tests.ok((select count(*) from claimed) > 0, 'service claims due deliveries');
select tests.ok(not exists (select 1 from public.notification_deliveries where status = 'pending' and attempts = 0 and id in (select id from claimed)), 'claimed rows are marked sending');
select public.complete_delivery((select id from claimed order by id limit 1), 'failed', null, 'smtp down');
select tests.ok((select status = 'failed' and next_attempt_at > now() from public.notification_deliveries where id = (select id from claimed order by id limit 1)), 'failed delivery scheduled for retry with backoff');
select public.complete_delivery(id, 'sent', 'prov', null) from claimed where id <> (select id from claimed order by id limit 1);
select id as failed_id from claimed order by id limit 1 \gset
select tests.ok(tests.count('select * from public.claim_deliveries(500)') = 0, 'nothing due right after a run');
select tests.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select public.admin_retry_delivery(:'failed_id');
select tests.logout();
select tests.ok((select status from public.notification_deliveries where id = :'failed_id') = 'pending', 'admin can retry a failed delivery');
select tests.logout();
\echo 'MESSAGING TESTS PASSED'
