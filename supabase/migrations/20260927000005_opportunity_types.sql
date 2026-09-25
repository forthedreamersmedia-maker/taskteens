-- =====================================================================
-- TaskTeens — internships and volunteer opportunities
--  * jobs.opportunity_type: 'job' (paid work) | 'internship' | 'volunteer'
--  * pay_type 'unpaid' (pay_min = 0) is allowed only for volunteer roles and
--    internships, and only when the poster attests the host is a nonprofit,
--    school, public agency or community group.
--  * Paid jobs must pay; volunteer roles are always unpaid.
--  * Employer ratings: "paid as promised" is not asked for volunteer roles
--    (stored as null and ignored by the percentage).
-- =====================================================================

alter table public.jobs
  add column opportunity_type text not null default 'job' check (opportunity_type in ('job','internship','volunteer')),
  add column nonprofit_attested boolean not null default false;

create index jobs_opportunity_type_idx on public.jobs(opportunity_type) where status = 'published';

alter table public.jobs drop constraint if exists jobs_pay_type_check;
alter table public.jobs drop constraint if exists jobs_pay_min_check;
alter table public.jobs
  add constraint jobs_pay_type_check check (pay_type in ('hourly','flat','stipend','unpaid')),
  add constraint jobs_pay_min_check check (pay_min >= 0),
  add constraint jobs_unpaid_rules check (
    case
      when pay_type = 'unpaid' then pay_min = 0 and pay_max is null and opportunity_type in ('internship','volunteer') and nonprofit_attested
      else pay_min > 0 and opportunity_type in ('job','internship')
    end
  );

-- ---------------------------------------------------------------------
-- Ratings: no pay question for volunteer roles
-- ---------------------------------------------------------------------
alter table public.employer_reviews alter column paid_as_promised drop not null;

create or replace function public.submit_employer_review(
  p_application uuid, p_stars int, p_paid boolean, p_matched boolean, p_safe boolean, p_respectful boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.applications%rowtype; v_type text;
begin
  select * into a from public.applications where id = p_application;
  if not found or a.teen_id <> auth.uid() then raise exception 'Not allowed'; end if;
  if a.status <> 'selected' or a.completed_at is null then
    raise exception 'You can rate an employer after the job is marked completed';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'Choose 1 to 5 stars'; end if;
  select opportunity_type into v_type from public.jobs where id = a.job_id;
  insert into public.employer_reviews (application_id, job_id, employer_id, teen_id, stars, paid_as_promised, matched_listing, felt_safe, respectful, private_note)
  values (a.id, a.job_id, a.employer_id, a.teen_id, p_stars,
          case when v_type = 'volunteer' then null else coalesce(p_paid,false) end,
          coalesce(p_matched,false), coalesce(p_safe,false), coalesce(p_respectful,false),
          nullif(left(trim(coalesce(p_note,'')), 1000), ''));
exception when unique_violation then
  raise exception 'You already rated this job';
end $$;

-- avg() already skips nulls, so pct_paid in employer_rating_summaries() only
-- counts paid roles. Return null (not 0) when no paid role has been rated yet.
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
         case when r.n >= 3 and r.p is not null then round(r.p * 100)::int end,
         case when r.n >= 3 then round(r.m * 100)::int end,
         case when r.n >= 3 then round(r.rs * 100)::int end,
         case when r.n >= 3 then round(r.sf * 100)::int end,
         coalesce(c.n, 0) >= 5 and not o.has_open
  from e left join c on c.employer_id = e.id left join r on r.employer_id = e.id join o on o.id = e.id;
$$;

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

grant execute on function public.employer_rating_summaries(uuid[]) to anon, authenticated;

-- Switching an approved listing to unpaid (or to a different opportunity type)
-- sends it back to moderation, so unpaid roles always get a human look.
create or replace function public.recheck_job_type_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  if new.opportunity_type is distinct from old.opportunity_type
     or (new.pay_type = 'unpaid' and old.pay_type is distinct from 'unpaid') then
    new.moderation_status := 'pending';
  end if;
  return new;
end $$;
-- runs after jobs_guard (triggers fire in name order: jobs_guard < jobs_recheck_type)
create trigger jobs_recheck_type before update on public.jobs for each row execute function public.recheck_job_type_change();
