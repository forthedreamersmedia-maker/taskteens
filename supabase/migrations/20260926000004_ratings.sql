-- =====================================================================
-- TaskTeens — completed jobs, public employer ratings, private teen feedback
--  * Only a teen who was SELECTED for a job, after the job is marked completed,
--    can rate that employer (one review per application).
--  * Public output is aggregate-only (employer_rating_summaries); the overall
--    score is hidden until an employer has 3 published reviews.
--  * Teens are never publicly rated. Employers give private structured
--    feedback that only admins can read.
--  * Reviews have no public free text. The optional note goes to moderators.
--  * Reviews can be disputed through reports (target_type = 'review').
-- =====================================================================

-- ---------------------------------------------------------------------
-- Applications: completion
-- ---------------------------------------------------------------------
alter table public.applications
  add column completed_at timestamptz,
  add column completed_by text check (completed_by in ('teen','employer'));

create index applications_completed_idx on public.applications(employer_id) where completed_at is not null;

-- Replace the application guard so completion columns can only be set by the
-- mark_application_completed() RPC (which sets taskteens.rpc for its transaction).
create or replace function public.guard_application_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() or coalesce(current_setting('taskteens.rpc', true), '') = 'on' then
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  if auth.uid() = old.teen_id then
    if old.status = 'withdrawn' and new.status = 'submitted' then
      if not exists (select 1 from public.jobs j where j.id = old.job_id and j.status = 'published'
                     and j.moderation_status = 'approved' and (j.deadline is null or j.deadline >= current_date)) then
        raise exception 'This listing is not accepting applications' using errcode = 'P0001';
      end if;
      new.job_id := old.job_id; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
      new.viewed_at := null; new.status_updated_at := now(); new.created_at := now();
      new.completed_at := null; new.completed_by := null;
      return new;
    end if;
    if new.status <> 'withdrawn' then raise exception 'Applicants can only withdraw an application'; end if;
    if old.completed_at is not null then raise exception 'This job is already marked completed'; end if;
    new := old; new.status := 'withdrawn'; new.status_updated_at := now();
    return new;
  end if;

  if auth.uid() = old.employer_id then
    if old.status = 'withdrawn' then raise exception 'This application was withdrawn'; end if;
    if new.status = 'withdrawn' then raise exception 'Only the applicant can withdraw'; end if;
    if old.completed_at is not null and new.status is distinct from old.status then
      raise exception 'This job is already marked completed';
    end if;
    new.job_id := old.job_id; new.employer_id := old.employer_id; new.teen_id := old.teen_id;
    new.applicant_name := old.applicant_name; new.applicant_email := old.applicant_email; new.applicant_phone := old.applicant_phone;
    new.age_range := old.age_range; new.city := old.city; new.experience := old.experience; new.skills := old.skills;
    new.availability := old.availability; new.transportation := old.transportation; new.interest_statement := old.interest_statement;
    new.resume_path := old.resume_path; new.resume_name := old.resume_name; new.portfolio_url := old.portfolio_url;
    new.work_permit_status := old.work_permit_status; new.guardian_consent_status := old.guardian_consent_status;
    new.agreed_to_safety_rules := old.agreed_to_safety_rules; new.created_at := old.created_at;
    new.completed_at := old.completed_at; new.completed_by := old.completed_by;
    if new.status <> 'submitted' and new.viewed_at is null then new.viewed_at := now(); end if;
    if new.status is distinct from old.status then new.status_updated_at := now(); end if;
    return new;
  end if;

  raise exception 'Not allowed';
end $$;

-- Completion columns must never be supplied on insert by a client.
create or replace function public.clear_application_completion() returns trigger
language plpgsql as $$
begin
  if not public.is_privileged() then new.completed_at := null; new.completed_by := null; end if;
  return new;
end $$;
create trigger applications_clear_completion before insert on public.applications
for each row execute function public.clear_application_completion();

-- ---------------------------------------------------------------------
-- Reports can target a review (disputes)
-- ---------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('job','user','application','review','other'));

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.employer_reviews (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null unique references public.applications(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  employer_id      uuid not null references public.employer_profiles(user_id) on delete cascade,
  teen_id          uuid not null references public.users(id) on delete cascade,
  stars            smallint not null check (stars between 1 and 5),
  paid_as_promised boolean not null,
  matched_listing  boolean not null,
  felt_safe        boolean not null,
  respectful       boolean not null,
  private_note     text check (char_length(private_note) <= 1000), -- moderators only
  status           text not null default 'published' check (status in ('published','hidden')),
  created_at       timestamptz not null default now()
);
create index employer_reviews_employer_idx on public.employer_reviews(employer_id, status);

create table public.teen_feedback (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  employer_id    uuid not null references public.employer_profiles(user_id) on delete cascade,
  teen_id        uuid not null references public.users(id) on delete cascade,
  showed_up      boolean not null,
  communicated   boolean not null,
  completed_job  boolean not null,
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now()
);
create index teen_feedback_teen_idx on public.teen_feedback(teen_id);

alter table public.employer_reviews enable row level security;
alter table public.teen_feedback enable row level security;

-- Teens read their own review; admins read all. Employers do NOT read rows
-- directly (that would expose teen_id and the private note) — they use
-- my_employer_reviews(). Nobody writes directly; RPCs below do.
create policy employer_reviews_select on public.employer_reviews for select
  using (teen_id = auth.uid() or public.is_admin());

-- Employers read the feedback they wrote; admins read all. Teens never see it.
create policy teen_feedback_select on public.teen_feedback for select
  using (employer_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.employer_reviews from anon, authenticated;
revoke insert, update, delete on public.teen_feedback from anon, authenticated;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.mark_application_completed(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype; v_by text; v_title text;
begin
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'Application not found'; end if;
  if auth.uid() = a.teen_id then v_by := 'teen';
  elsif auth.uid() = a.employer_id then v_by := 'employer';
  else raise exception 'Not allowed'; end if;
  if a.status <> 'selected' then raise exception 'Only a job you were selected for can be marked completed'; end if;
  if a.completed_at is not null then return; end if;

  perform set_config('taskteens.rpc', 'on', true);
  update public.applications set completed_at = now(), completed_by = v_by where id = a.id;
  perform set_config('taskteens.rpc', '', true);

  select title into v_title from public.jobs where id = a.job_id;
  if v_by = 'teen' then
    perform public.notify(a.employer_id, 'application_status', 'Job marked completed',
      a.applicant_name || ' marked “' || v_title || '” as completed. You can leave private feedback for TaskTeens.',
      '/dashboard/employer/applications/' || a.id);
  else
    perform public.notify(a.teen_id, 'application_status', 'Job marked completed',
      '“' || v_title || '” was marked completed. You can now rate this employer.', '/dashboard/teen/applications');
  end if;
end $$;

create or replace function public.submit_employer_review(
  p_application uuid, p_stars int, p_paid boolean, p_matched boolean, p_safe boolean, p_respectful boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  select * into a from public.applications where id = p_application;
  if not found or a.teen_id <> auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'selected' or a.completed_at is null then
    raise exception 'You can rate an employer after the job is marked completed';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'Choose 1 to 5 stars'; end if;
  insert into public.employer_reviews (application_id, job_id, employer_id, teen_id, stars, paid_as_promised, matched_listing, felt_safe, respectful, private_note)
  values (a.id, a.job_id, a.employer_id, a.teen_id, p_stars, coalesce(p_paid,false), coalesce(p_matched,false), coalesce(p_safe,false),
          coalesce(p_respectful,false), nullif(left(trim(coalesce(p_note,'')), 1000), ''));
exception when unique_violation then
  raise exception 'You already rated this job';
end $$;

create or replace function public.submit_teen_feedback(
  p_application uuid, p_showed_up boolean, p_communicated boolean, p_completed boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  select * into a from public.applications where id = p_application;
  if not found or a.employer_id <> auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'selected' or a.completed_at is null then raise exception 'Mark the job completed before leaving feedback'; end if;
  insert into public.teen_feedback (application_id, job_id, employer_id, teen_id, showed_up, communicated, completed_job, note)
  values (a.id, a.job_id, a.employer_id, a.teen_id, coalesce(p_showed_up,false), coalesce(p_communicated,false),
          coalesce(p_completed,false), nullif(left(trim(coalesce(p_note,'')), 1000), ''));
exception when unique_violation then
  raise exception 'You already left feedback for this job';
end $$;

-- Public, aggregate-only. Mirrors src/lib/ratings.ts (keep thresholds in sync:
-- score after 3 published reviews; Reliable = 5+ completed jobs and no open or
-- investigating reports against the employer or their listings).
create or replace function public.employer_rating_summaries(p_employers uuid[])
returns table (
  employer_id uuid, completed_jobs int, review_count int,
  avg_stars numeric, pct_paid int, pct_matched int, pct_respectful int, pct_safe int, reliable boolean)
language sql stable security definer set search_path = public as $$
  with e as (select unnest(p_employers[1:200]) as id),
  c as (select a.employer_id, count(*)::int n from public.applications a
        where a.employer_id = any(p_employers) and a.completed_at is not null group by a.employer_id),
  r as (select v.employer_id, count(*)::int n, avg(v.stars) s,
          avg(v.paid_as_promised::int) p, avg(v.matched_listing::int) m, avg(v.respectful::int) rs, avg(v.felt_safe::int) sf
        from public.employer_reviews v where v.employer_id = any(p_employers) and v.status = 'published' group by v.employer_id),
  o as (select e.id, exists (
          select 1 from public.reports rp
          where rp.status in ('open','investigating')
            and ((rp.target_type = 'user' and rp.target_id = e.id::text)
              or (rp.target_type = 'job' and rp.target_id in (select j.id::text from public.jobs j where j.employer_id = e.id)))
        ) has_open from e)
  select e.id,
         coalesce(c.n, 0),
         coalesce(r.n, 0),
         case when r.n >= 3 then round(r.s, 1) end,
         case when r.n >= 3 then round(r.p * 100)::int end,
         case when r.n >= 3 then round(r.m * 100)::int end,
         case when r.n >= 3 then round(r.rs * 100)::int end,
         case when r.n >= 3 then round(r.sf * 100)::int end,
         coalesce(c.n, 0) >= 5 and not o.has_open
  from e left join c on c.employer_id = e.id left join r on r.employer_id = e.id join o on o.id = e.id;
$$;

-- Employer's own reviews, without the teen's identity or private note.
create or replace function public.my_employer_reviews()
returns table (id uuid, job_title text, stars smallint, paid_as_promised boolean, matched_listing boolean,
               felt_safe boolean, respectful boolean, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, j.title, v.stars, v.paid_as_promised, v.matched_listing, v.felt_safe, v.respectful, v.status,
         date_trunc('month', v.created_at)
  from public.employer_reviews v join public.jobs j on j.id = v.job_id
  where v.employer_id = auth.uid()
  order by v.created_at desc;
$$;

create or replace function public.admin_set_review_status(p_review uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('published','hidden') then raise exception 'Invalid status'; end if;
  update public.employer_reviews set status = p_status where id = p_review;
  if not found then raise exception 'Review not found'; end if;
  perform public.write_audit(case when p_status = 'hidden' then 'review.hide' else 'review.restore' end, 'review', p_review::text, p_note);
end $$;

revoke execute on function public.mark_application_completed(uuid) from public, anon;
revoke execute on function public.submit_employer_review(uuid, int, boolean, boolean, boolean, boolean, text) from public, anon;
revoke execute on function public.submit_teen_feedback(uuid, boolean, boolean, boolean, text) from public, anon;
revoke execute on function public.my_employer_reviews() from public, anon;
revoke execute on function public.admin_set_review_status(uuid, text, text) from public, anon;
grant execute on function public.mark_application_completed(uuid) to authenticated;
grant execute on function public.submit_employer_review(uuid, int, boolean, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.submit_teen_feedback(uuid, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.my_employer_reviews() to authenticated;
grant execute on function public.admin_set_review_status(uuid, text, text) to authenticated;
grant execute on function public.employer_rating_summaries(uuid[]) to anon, authenticated;
