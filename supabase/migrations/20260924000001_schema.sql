-- =====================================================================
-- TaskTeens — core schema
-- Tables, constraints, indexes. Row-level security lives in 0002.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations (as check constraints for easier evolution)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- users: one row per auth.users row. Role is set by trigger on sign-up
-- (teen|employer only) and can only be changed by an admin / service role.
-- ---------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'teen' check (role in ('teen','employer','admin')),
  status      text not null default 'active' check (status in ('active','suspended')),
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index users_role_idx on public.users(role);
create index users_email_idx on public.users(lower(email));

create table public.teen_profiles (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  display_name            text not null default '',
  age_range               text check (age_range in ('14-15','16-17','18-19')),
  city                    text,
  bio                     text check (char_length(bio) <= 1000),
  skills                  text[] not null default '{}',
  experience              text check (char_length(experience) <= 2000),
  availability            jsonb not null default '{}'::jsonb,
  transportation          text check (transportation in ('none_needed','transit_accessible','bike_or_walk','own_transportation','employer_provides')),
  resume_path             text,
  resume_name             text,
  portfolio_url           text,
  work_permit_status      text check (work_permit_status in ('not_required','have_permit','in_progress','not_sure')),
  guardian_consent_status text check (guardian_consent_status in ('not_applicable','obtained','will_obtain')),
  email_notifications     boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Public-safe employer fields only. Private contact info (email/phone) stays in public.users.
create table public.employer_profiles (
  user_id              uuid primary key references public.users(id) on delete cascade,
  employer_type        text not null default 'individual' check (employer_type in ('individual','business')),
  display_name         text not null check (char_length(display_name) between 2 and 80),
  city                 text not null,
  service_area         text,
  website              text,
  description          text check (char_length(description) <= 1000),
  logo_url             text,
  verification_status  text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  agreed_to_rules_at   timestamptz,
  onboarded            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index employer_profiles_verification_idx on public.employer_profiles(verification_status);

-- ---------------------------------------------------------------------
-- Reference data managed by admins
-- ---------------------------------------------------------------------
create table public.categories (
  slug        text primary key,
  name        text not null,
  description text not null default '',
  icon        text not null default 'Briefcase',
  active      boolean not null default true,
  sort        int not null default 100
);

create table public.service_areas (
  slug    text primary key,
  name    text not null,
  cities  text[] not null default '{}',
  active  boolean not null default true
);

-- Single-row configurable rules (age / guardian consent / work permit / approval).
-- Starter values are NOT legal advice; review with counsel before launch.
create table public.platform_settings (
  id                              int primary key default 1 check (id = 1),
  min_worker_age                  int not null default 14,
  guardian_consent_under_age      int not null default 18,
  work_permit_reminder_under_age  int not null default 18,
  require_job_approval            boolean not null default true,
  rules_note                      text not null default '',
  updated_at                      timestamptz not null default now()
);
insert into public.platform_settings (id, rules_note) values (1,
  'Work permit and guardian consent requirements depend on your age, the type of work and who is hiring. TaskTeens does not determine whether you legally need a permit. Ask your school''s work permit office or visit the California Department of Industrial Relations for current rules.');

-- array_to_string is only STABLE; generated columns need IMMUTABLE.
create or replace function public.skills_to_text(arr text[]) returns text
language sql immutable parallel safe as $$ select coalesce(array_to_string(arr, ' '), '') $$;

-- ---------------------------------------------------------------------
-- Jobs. Only approximate location (city + neighborhood) is stored.
-- ---------------------------------------------------------------------
create table public.jobs (
  id                    uuid primary key default gen_random_uuid(),
  employer_id           uuid not null references public.employer_profiles(user_id) on delete cascade,
  title                 text not null check (char_length(title) between 5 and 90),
  category              text not null references public.categories(slug) on update cascade,
  description           text not null check (char_length(description) between 40 and 4000),
  responsibilities      text[] not null default '{}',
  required_skills       text[] not null default '{}',
  preferred_skills      text[] not null default '{}',
  city                  text not null,
  neighborhood          text check (char_length(neighborhood) <= 60),
  service_area          text not null,
  work_mode             text not null default 'in_person' check (work_mode in ('in_person','remote','hybrid')),
  pay_type              text not null check (pay_type in ('hourly','flat','stipend')),
  pay_min               numeric(8,2) not null check (pay_min > 0),
  pay_max               numeric(8,2) check (pay_max is null or pay_max >= pay_min),
  schedule              text not null,
  schedule_tags         text[] not null default '{}',
  min_age               int not null default 14 check (min_age between 14 and 19),
  start_date            date,
  recurrence            text not null default 'recurring' check (recurrence in ('one_time','recurring')),
  openings              int not null default 1 check (openings between 1 and 50),
  deadline              date,
  transportation        text not null default 'bike_or_walk' check (transportation in ('none_needed','transit_accessible','bike_or_walk','own_transportation','employer_provides')),
  transportation_notes  text,
  image_url             text,
  status                text not null default 'draft' check (status in ('draft','published','paused','closed','removed')),
  moderation_status     text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  featured              boolean not null default false,
  is_demo               boolean not null default false,
  search                tsvector generated always as (
                          setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                          setweight(to_tsvector('english', coalesce(description,'')), 'B') ||
                          setweight(to_tsvector('english', public.skills_to_text(required_skills)), 'C')
                        ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_at          timestamptz
);
create index jobs_public_idx on public.jobs(status, moderation_status, published_at desc);
create index jobs_employer_idx on public.jobs(employer_id);
create index jobs_category_idx on public.jobs(category);
create index jobs_city_idx on public.jobs(city);
create index jobs_featured_idx on public.jobs(featured) where featured;
create index jobs_search_idx on public.jobs using gin(search);

-- ---------------------------------------------------------------------
-- Applications. employer_id is copied from the job by trigger (never trusted
-- from the client) so RLS can route the application to the right employer.
-- ---------------------------------------------------------------------
create table public.applications (
  id                       uuid primary key default gen_random_uuid(),
  job_id                   uuid not null references public.jobs(id) on delete restrict,
  employer_id              uuid not null references public.employer_profiles(user_id) on delete cascade,
  teen_id                  uuid not null references public.users(id) on delete cascade,
  status                   text not null default 'submitted' check (status in ('submitted','viewed','interview_requested','selected','not_selected','withdrawn')),
  applicant_name           text not null check (char_length(applicant_name) between 2 and 80),
  applicant_email          text not null,
  applicant_phone          text not null,
  age_range                text not null check (age_range in ('14-15','16-17','18-19')),
  city                     text not null,
  experience               text not null check (char_length(experience) <= 1500),
  skills                   text[] not null default '{}',
  availability             text not null check (char_length(availability) <= 500),
  transportation           text not null,
  interest_statement       text not null check (char_length(interest_statement) <= 1200),
  resume_path              text,
  resume_name              text,
  portfolio_url            text,
  work_permit_status       text not null check (work_permit_status in ('not_required','have_permit','in_progress','not_sure')),
  guardian_consent_status  text not null check (guardian_consent_status in ('not_applicable','obtained','will_obtain')),
  agreed_to_safety_rules   boolean not null check (agreed_to_safety_rules),
  viewed_at                timestamptz,
  status_updated_at        timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  -- Prevents duplicate applications (withdrawn applications are re-opened instead).
  constraint applications_one_per_job unique (job_id, teen_id)
);
create index applications_employer_idx on public.applications(employer_id, status, created_at desc);
create index applications_teen_idx on public.applications(teen_id, created_at desc);
create index applications_job_idx on public.applications(job_id);

-- Private employer notes — separate table so teens can never read them.
create table public.application_notes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  employer_id     uuid not null references public.employer_profiles(user_id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index application_notes_app_idx on public.application_notes(application_id);

create table public.saved_jobs (
  user_id     uuid not null references public.users(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('application_received','application_status','interview_requested','interview_response','verification_update','listing_moderation','system')),
  title       text not null,
  body        text not null,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.interview_requests (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  employer_id     uuid not null references public.employer_profiles(user_id) on delete cascade,
  teen_id         uuid not null references public.users(id) on delete cascade,
  proposed_times  timestamptz[] not null check (array_length(proposed_times,1) between 1 and 5),
  confirmed_time  timestamptz,
  format          text not null check (format in ('video','phone','in_person_public')),
  location_note   text check (char_length(location_note) <= 200),
  message         text check (char_length(message) <= 1000),
  guardian_invited boolean not null default true,
  status          text not null default 'proposed' check (status in ('proposed','accepted','declined','cancelled','completed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index interview_requests_teen_idx on public.interview_requests(teen_id, created_at desc);
create index interview_requests_employer_idx on public.interview_requests(employer_id, created_at desc);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.users(id) on delete set null,
  target_type     text not null check (target_type in ('job','user','application','other')),
  target_id       text,
  reason          text not null,
  details         text not null check (char_length(details) between 10 and 4000),
  severity        text not null default 'normal' check (severity in ('normal','urgent','emergency')),
  contact_email   text,
  status          text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index reports_status_idx on public.reports(status, severity, created_at desc);

create table public.verification_requests (
  id              uuid primary key default gen_random_uuid(),
  employer_id     uuid not null references public.employer_profiles(user_id) on delete cascade,
  employer_type   text not null check (employer_type in ('individual','business')),
  submitted_info  jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id     uuid references public.users(id),
  review_note     text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);
create index verification_requests_status_idx on public.verification_requests(status, created_at);
create unique index verification_requests_one_pending on public.verification_requests(employer_id) where status = 'pending';

create table public.admin_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.users(id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    text,
  note         text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs(target_type, target_id);

create table public.blocks (
  blocker_id  uuid not null references public.users(id) on delete cascade,
  blocked_id  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();
create trigger teen_profiles_touch before update on public.teen_profiles for each row execute function public.touch_updated_at();
create trigger employer_profiles_touch before update on public.employer_profiles for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();
create trigger interview_requests_touch before update on public.interview_requests for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();
