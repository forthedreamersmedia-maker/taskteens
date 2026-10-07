-- =====================================================================
-- TaskTeens launch safety — Phase 5: messaging, parent visibility, flags, notification delivery.
-- =====================================================================

-- Per-user read markers for unread counts.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;
create policy conversation_reads_own on public.conversation_reads for select using (user_id = auth.uid());
revoke insert, update, delete on public.conversation_reads from anon, authenticated;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation
                 and (c.teen_id = auth.uid() or c.employer_id = auth.uid() or public.is_parent_of(c.teen_id))) then
    raise exception 'Not allowed';
  end if;
  insert into public.conversation_reads (conversation_id, user_id) values (p_conversation, auth.uid())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end $$;

-- Inbox for the signed-in user (teen, employer or parent).
create or replace function public.my_conversations()
returns table (id uuid, application_id uuid, job_id uuid, job_title text, employer_id uuid, employer_name text, teen_id uuid, teen_name text,
               application_status text, locked boolean, blocked boolean, last_message_at timestamptz, last_body text, last_sender_role text, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.application_id, c.job_id, j.title, c.employer_id, e.display_name, c.teen_id, a.applicant_name,
         a.status, (c.locked or a.incident_open), public.is_blocked_between(c.teen_id, c.employer_id), c.last_message_at,
         lm.body, lm.sender_role,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
             and m.created_at > coalesce((select r.last_read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
             and (m.delivery = 'delivered' or public.is_parent_of(c.teen_id)))
  from public.conversations c
  join public.jobs j on j.id = c.job_id
  join public.employer_profiles e on e.user_id = c.employer_id
  join public.applications a on a.id = c.application_id
  left join lateral (
    select m.body, m.sender_role from public.messages m
    where m.conversation_id = c.id and (m.delivery = 'delivered' or m.sender_id = auth.uid() or public.is_parent_of(c.teen_id))
    order by m.created_at desc limit 1) lm on true
  where c.teen_id = auth.uid() or c.employer_id = auth.uid() or public.is_parent_of(c.teen_id)
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- Block from a conversation (teen or employer; a parent blocks on the teen's behalf).
create or replace function public.block_in_conversation(p_conversation uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype; v_blocker uuid; v_blocked uuid;
begin
  select * into c from public.conversations where id = p_conversation;
  if not found then raise exception 'Not found'; end if;
  if auth.uid() = c.teen_id or public.is_parent_of(c.teen_id) then v_blocker := c.teen_id; v_blocked := c.employer_id;
  elsif auth.uid() = c.employer_id then v_blocker := c.employer_id; v_blocked := c.teen_id;
  else raise exception 'Not allowed'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_blocker, v_blocked) on conflict do nothing;
  perform public.log_event('conversation.block', 'conversation', p_conversation::text, p_reason);
  if v_blocker = c.teen_id then
    perform public.notify_parents(c.teen_id, 'contact_flag', 'Employer blocked',
      'An employer was blocked from messaging your teen. You can review the conversation.', '/dashboard/parent/messages?c=' || c.id, true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Notification delivery queue
-- ---------------------------------------------------------------------
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('pending','sending','sent','failed','skipped'));
alter table public.notification_deliveries add column if not exists sent_at timestamptz;

-- Safety-related kinds always email, regardless of the teen's email preference.
create or replace function public.is_safety_kind(p_kind text) returns boolean language sql immutable as $$
  select p_kind in ('emergency','safety_alert','missed_checkin','incident','restriction','contact_flag','consent_revoked','parent_approval','parent_invitation');
$$;

-- Claim due deliveries (service role). SKIP LOCKED lets parallel dispatchers run safely.
create or replace function public.claim_deliveries(p_limit int)
returns table (id uuid, channel text, attempts int, user_id uuid, email text, phone text, kind text, title text, body text, link text, priority text, safety_alert_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  -- Stuck "sending" rows (dispatcher crashed) go back to the queue after 5 minutes.
  update public.notification_deliveries set status = 'pending' where status = 'sending' and updated_at < now() - interval '5 minutes';
  return query
  with due as (
    select d.id from public.notification_deliveries d
    where d.status in ('pending','failed') and d.next_attempt_at <= now() and d.attempts < 5
    order by (select n.priority = 'emergency' from public.notifications n where n.id = d.notification_id) desc nulls last, d.created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), upd as (
    update public.notification_deliveries d set status = 'sending', attempts = d.attempts + 1
    from due where d.id = due.id
    returning d.*
  )
  select u.id, u.channel, u.attempts, u.user_id, usr.email,
         coalesce(pp.phone_e164, ep.phone_e164),
         n.kind, n.title, n.body, n.link, n.priority, u.safety_alert_id
  from upd u
  join public.users usr on usr.id = u.user_id
  left join public.notifications n on n.id = u.notification_id
  left join public.parent_profiles pp on pp.user_id = u.user_id
  left join public.employer_profiles ep on ep.user_id = u.user_id;
end $$;

-- Record the outcome. Failures retry with backoff (1, 5, 15, 60 min); after 5 attempts they stay failed.
create or replace function public.complete_delivery(p_id uuid, p_status text, p_provider_id text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.notification_deliveries%rowtype;
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid status'; end if;
  select * into d from public.notification_deliveries where id = p_id for update;
  if not found then return; end if;
  update public.notification_deliveries
     set status = p_status, provider_id = p_provider_id, last_error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         next_attempt_at = case when p_status = 'failed' then now() + case d.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '15 minutes' else interval '60 minutes' end else next_attempt_at end
   where id = p_id;
end $$;

-- Admin: retry a failed or skipped delivery now.
create or replace function public.admin_retry_delivery(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.notification_deliveries set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
   where id = p_id and status in ('failed','skipped');
  perform public.log_event('delivery.retry', 'notification_delivery', p_id::text);
end $$;

-- Users see delivery status of their own notifications (for "email sent / failed" labels).
create or replace function public.my_delivery_status(p_notifications uuid[])
returns table (notification_id uuid, channel text, status text)
language sql stable security definer set search_path = public as $$
  select d.notification_id, d.channel, d.status from public.notification_deliveries d
  where d.user_id = auth.uid() and d.notification_id = any(p_notifications[1:200]);
$$;

revoke execute on function public.claim_deliveries(int) from public, anon, authenticated;
revoke execute on function public.complete_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_deliveries(int) to service_role;
grant execute on function public.complete_delivery(uuid, text, text, text) to service_role;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.block_in_conversation(uuid, text) from public, anon;
revoke execute on function public.admin_retry_delivery(uuid) from public, anon;
revoke execute on function public.my_delivery_status(uuid[]) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.block_in_conversation(uuid, text) to authenticated;
grant execute on function public.admin_retry_delivery(uuid) to authenticated;
grant execute on function public.my_delivery_status(uuid[]) to authenticated;
