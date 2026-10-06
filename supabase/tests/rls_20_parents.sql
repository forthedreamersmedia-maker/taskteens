-- Phase 2: parent invitations, consent and parent controls.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000002a1','kid@test.local', now(), '{"full_name":"Kid Kim","role":"teen"}'),
 ('00000000-0000-4000-8000-0000000002b1','mom@test.local', now(), '{"full_name":"Mom Kim","role":"parent"}'),
 ('00000000-0000-4000-8000-0000000002b2','stranger@test.local', now(), '{"full_name":"Stranger","role":"parent"}'),
 ('00000000-0000-4000-8000-0000000002b3','unconfirmed@test.local', null, '{"full_name":"Unconfirmed","role":"parent"}');

\set KID '''00000000-0000-4000-8000-0000000002a1'''
\set MOM '''00000000-0000-4000-8000-0000000002b1'''
\set STR '''00000000-0000-4000-8000-0000000002b2'''
\set UNC '''00000000-0000-4000-8000-0000000002b3'''

select tests.login(:KID);
select tests.throws($$select public.create_parent_invitation(auth.uid(), 'Mom', 'mom@test.local', 'h1')$$, 'teen cannot call invitation function directly', 'permission denied');
select tests.ok(public.teen_parent_status(auth.uid()) = 'none', 'new teen starts with no parent');

select tests.as_service();
select tests.throws($$select public.create_parent_invitation('00000000-0000-4000-8000-0000000002a1', 'Me', 'kid@test.local', 'h0')$$, 'teen cannot invite their own email', 'own email');
select tests.throws($$select public.create_parent_invitation('00000000-0000-4000-8000-0000000002a1', 'Teacher', 'teen1@test.local', 'h0')$$, 'cannot invite another teen account as parent', 'non-parent');
select public.create_parent_invitation(:KID, 'Mom Kim', 'Mom@Test.local', 'hash-1');
select public.create_parent_invitation(:KID, 'Mom Kim', 'mom@test.local', 'hash-2');
select public.create_parent_invitation(:KID, 'Mom Kim', 'mom@test.local', 'hash-3');
select tests.throws($$select public.create_parent_invitation('00000000-0000-4000-8000-0000000002a1', 'Mom Kim', 'mom@test.local', 'hash-4')$$, 'invitations are rate limited (3/day)', 'up to 3');
select tests.ok((select status from public.parent_invitations where token_hash = 'hash-1') = 'revoked', 'a new invitation replaces the previous pending one');
select tests.ok((select teen_first_name from public.parent_invitation_preview('hash-3')) = 'Kid', 'invitation preview shows teen first name only');

select tests.login(:KID);
select tests.ok(public.teen_parent_status(auth.uid()) = 'invited', 'teen status = invited');
select tests.ok(tests.count('select * from public.parent_invitations') = 3, 'teen can see own invitations');
select tests.login(:STR);
select tests.ok(tests.count('select * from public.parent_invitations') = 0, 'other parents cannot see invitations');

select tests.as_service();
select tests.throws($$select public.accept_parent_invitation('hash-1', '00000000-0000-4000-8000-0000000002b1', 'v1', '["a"]', '1.1.1.1', 'ua', false)$$, 'replaced invitation cannot be used', 'already used');
select tests.throws($$select public.accept_parent_invitation('hash-3', '00000000-0000-4000-8000-0000000002b2', 'v1', '["a"]', '1.1.1.1', 'ua', false)$$, 'invitation only works for the invited email', 'different email');
select tests.throws($$select public.accept_parent_invitation('hash-3', '00000000-0000-4000-8000-0000000002a1', 'v1', '["a"]', '1.1.1.1', 'ua', false)$$, 'teen account cannot accept its own invitation', 'parent/guardian account');
update public.users set email = 'unconfirmed@test.local' where id = :UNC;
select public.accept_parent_invitation('hash-3', :MOM, '2026-10-pilot-v1', '["parent_or_guardian","approve_each_job"]', '203.0.113.9', 'Mozilla/5.0', true);
select tests.ok((select ip_address = '203.0.113.9' and consent_version = '2026-10-pilot-v1' from public.parent_consents where parent_id = :MOM), 'consent records version, IP and parent');
select tests.throws($$select public.accept_parent_invitation('hash-3', '00000000-0000-4000-8000-0000000002b1', 'v1', '["a"]', '1', 'ua', false)$$, 'invitation cannot be reused', 'already used');
select tests.logout();
update public.parent_invitations set status = 'pending', expires_at = now() - interval '1 minute', token_hash = 'hash-exp' where token_hash = 'hash-2';
select tests.as_service();
select tests.throws($$select public.accept_parent_invitation('hash-exp', '00000000-0000-4000-8000-0000000002b1', 'v1', '["a"]', '1', 'ua', false)$$, 'expired invitation rejected', 'expired');

select tests.login(:KID);
select tests.ok(public.teen_parent_status(auth.uid()) = 'confirmed', 'teen status = confirmed after acceptance');
select tests.ok((select consent_active from public.my_parents()), 'teen sees parent as active');
select tests.ok(exists (select 1 from public.notifications where user_id = auth.uid() and kind = 'parent_confirmed'), 'teen notified when parent confirms');
select tests.throws($$select public.parent_set_pause(auth.uid(), true)$$, 'teen cannot use parent controls', 'Not allowed');

select tests.login(:STR);
select tests.throws($$select public.parent_set_pause('00000000-0000-4000-8000-0000000002a1', true)$$, 'unlinked parent cannot pause', 'Not allowed');
select tests.ok(tests.count('select * from public.my_teens()') = 0, 'unlinked parent has no teens');

select tests.login(:MOM);
select tests.ok((select status from public.my_teens()) = 'confirmed', 'parent overview shows teen');
select public.parent_set_pause(:KID, true);
select tests.ok(not public.teen_can_apply(:KID), 'paused teen cannot apply');
select public.parent_set_pause(:KID, false);
select tests.ok(public.teen_can_apply(:KID), 'resumed teen can apply');
select public.parent_revoke_consent(:KID, 'Changed my mind');
select tests.ok(not public.teen_can_apply(:KID), 'revoked consent blocks applying');
select tests.login(:KID);
select tests.ok(public.teen_parent_status(auth.uid()) = 'revoked', 'teen status = revoked');
select tests.logout();
select tests.ok(exists (select 1 from public.audit_logs where action = 'parent_consent.revoke'), 'revocation audit-logged');
\echo 'PARENT TESTS PASSED'
