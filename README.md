# TaskTeens

**Local jobs. Real experience. Built for teens.**

TaskTeens is a local job platform that connects teenagers in Berkeley, Albany, El Cerrito and the nearby East Bay with safe, legitimate work from local families and small businesses. When a teen applies, the application goes straight into the right employer's dashboard. Nobody has to forward it by hand.

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (Auth, Postgres, RLS, Storage, Realtime) and Resend. It deploys to Vercel.

---

## Quick start (no accounts needed)

```bash
npm install
npm run dev          # http://localhost:3000
```

If no Supabase environment variables are set, the app runs in **local demonstration mode**:

- A yellow banner marks the mode on every page.
- Data is stored in the browser's `localStorage` and seeded with fictional listings. Each one is labeled **"Demo listing"**.
- Sign-in uses demo accounts. The password for all of them is `demo1234`:
  - `teen@demo.taskteens.com`: Maya (teen worker)
  - `employer@demo.taskteens.com`: Solano Paws (employer)
  - `admin@demo.taskteens.com`: platform admin
- Instead of being sent, emails are written to an on-screen outbox at **`/demo`**. You can also reset the demo data there.
- Two tabs in the same browser share data. That means you can apply as the teen in one tab and watch the application appear in the employer tab.

Demo mode is **not secure**, because everything lives in the browser. It exists so you can test the interface.

Ratings demo: sign in as Maya → **My applications** → "Fall yard cleanup" is completed, so click **Rate this employer**. "Farmers-market pop-up" is selected but still in progress, so you can **Mark job as completed** first. Plaza Corner Books has 6 completed jobs and shows the **Reliable Employer** badge. Solano Paws has 3 ratings, so its score shows. Gilman Street Café has only 2, so its score is still hidden. As Solano Paws, open the applicant "Demo Worker D." to leave private feedback, and see **Your ratings** on the dashboard (with a Dispute button). As admin, open **Ratings & feedback**.

Suggested demo: sign in as Maya → apply to "After-school dog walker" → sign in as Solano Paws → open the application (it gets marked Viewed) → Select her → sign back in as Maya and see the notification → sign in as admin → approve the pending listing and look at the audit log.

---

## Project structure

```
src/
  app/                        Next.js routes
    page.tsx                  Homepage
    jobs/                     Marketplace, job detail, /jobs/[id]/apply
    auth/                     sign-in, sign-up, forgot/reset password, verify, callback (PKCE)
    dashboard/teen/*          Teen dashboard (overview, applications, saved, interviews, notifications, profile, settings)
    dashboard/employer/*      Employer dashboard (overview, listings CRUD, applicants, interviews, settings)
    onboarding/employer       3-step employer onboarding + verification request
    admin/*                   Admin: reports, listings moderation, verifications, users, categories/areas, rules, audit log
    api/applications          POST: create application + send emails (server)
    api/applications/[id]/status  POST: employer status change + email (server)
    api/reports               POST: safety report + urgent email (server)
    hire, how-it-works, safety, report, service-area, privacy, terms, guidelines, demo
  components/                 UI kit, layout, jobs, dashboards, safety
  lib/
    data/types.ts             DataClient interface (the only thing the UI talks to)
    data/mock.ts              Demo-mode implementation (localStorage)
    data/supabase.ts          Production implementation (Supabase + API routes)
    data/seed.ts              Demo content (also generates supabase/seed.sql)
    supabase/                 browser / server / middleware clients
    email/                    Resend sender + templates
    validation.ts             Zod schemas shared by client and server
    constants.ts, types.ts
  middleware.ts               Server-side session refresh + role-based route protection
supabase/
  migrations/…_schema.sql     Tables, constraints, indexes
  migrations/…_security.sql   Helper functions, triggers, RLS, storage policies, admin RPCs
  migrations/…_remove_oakland.sql
  migrations/…_ratings.sql    Job completion, employer ratings, private teen feedback, review disputes
  migrations/…_opportunity_types.sql  Paid jobs, internships and volunteer roles
  seed.sql                    Demo data (generated)
scripts/generate-seed-sql.ts
```

**Swapping the data layer:** every screen calls `useData()`, which returns a `DataClient`. `lib/data/index.ts` picks `mock` or `supabase` based on the environment variables. To add a feature, add the method to the interface and implement it in both files. The UI stays the same.

---

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | client + server | Used for email links and auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL. Leave empty for demo mode |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Looks up the employer's email for notifications, after the caller has been verified |
| `RESEND_API_KEY` | server | Transactional email. If missing, emails are logged and skipped |
| `EMAIL_FROM` | server | e.g. `TaskTeens <hello@taskteens.com>`. The domain must be verified in Resend |
| `SAFETY_INBOX` | server | Receives copies of urgent and emergency reports |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client | Cloudflare Turnstile CAPTCHA on sign-up, sign-in and password reset. The secret key goes in Supabase (see below). Leave empty to turn it off |

---

## Supabase setup

1. Create a project at supabase.com.
2. Run the migrations, either with the CLI (`supabase link` then `supabase db push`) or by pasting each file in `supabase/migrations/` into the SQL editor, in filename order.
3. **Auth → Providers → Email:** turn on "Confirm email".
4. **Auth → URL configuration:** set Site URL to your domain and add `https://YOUR_DOMAIN/auth/callback` to the redirect URLs.
5. (Optional) Load the demo data with `supabase/seed.sql`. It creates the same fictional accounts, using password `demo1234`. **Don't run it on a production project with real users.** If you edit `src/lib/data/seed.ts`, regenerate the file with `npm run seed:sql`.
6. **CAPTCHA (recommended):** create a free Turnstile widget at dash.cloudflare.com → Turnstile, with your domains (taskteens.com, www.taskteens.com, localhost). Put the **site key** in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel. Put the **secret key** in Supabase → Authentication → Attack Protection → "Enable CAPTCHA protection" → Turnstile. Supabase then checks every sign-up, sign-in and password-reset request, so bots can't skip the widget by calling the API directly. Set both keys together, or no one will be able to sign in.
7. **Create your first admin.** Sign-up only allows the `teen` and `employer` roles, so run this in the SQL editor:
   ```sql
   update public.users set role = 'admin' where email = 'hello@taskteens.com';
   ```
7. The storage buckets (`resumes` is private, `job-images` is public) and the realtime publication are created by the migration.

### Row-level security summary

- **users / teen_profiles:** a user can read only their own row. Admins can read all. A trigger (`guard_user_update`) keeps users from changing their own `role`, `status` or `email`, so **nobody can make themselves an admin from the client**.
- **employer_profiles:** public-safe fields only, readable once onboarded. `verification_status` can only be changed by admins (enforced by a trigger).
- **jobs:** the public sees only listings that are `published` + `approved` and belong to active employers. Employers see and edit their own. Triggers stop employers from approving, featuring, un-removing or marking listings as demo. New listings start as `pending` when `platform_settings.require_job_approval` is on.
- **applications:** a teen sees their own; an employer sees only applications to their own listings. On insert, `employer_id` is **copied from the job by a trigger**, so routing can't be spoofed. Triggers also check that the job is open, the deadline hasn't passed, the applicant is a teen, and neither side has blocked the other. `unique(job_id, teen_id)` prevents duplicates. Column rules: teens can only withdraw, and employers can only change status.
- **application_notes:** only the owning employer can see them. Teens never can.
- **notifications:** only the owner can read them. They're created only by `SECURITY DEFINER` triggers (new application, status change, interview, moderation, verification).
- **reports:** anyone can file one, including signed-out visitors. Only the reporter and admins can read them.
- **admin_audit_logs:** admins can read them. Rows are written only by admin RPCs (`admin_moderate_job`, `admin_review_verification`, `admin_set_user_status`, `admin_update_report`, `admin_add_note`) and by audit triggers on categories, service areas and settings. Admin moderation writes go through these RPCs, so every action gets logged.
- **employer_reviews / teen_feedback:** no one can insert or update rows directly. Writes go through `submit_employer_review` (only the hired teen, only after the job is marked completed, once per job) and `submit_teen_feedback` (only that job's employer). A teen can read their own review. Employers never read review rows: `my_employer_reviews()` returns them without the teen's name or private note, and dates are rounded to the month. The public sees only `employer_rating_summaries()` aggregates. The score stays hidden until an employer has 3 published ratings, and **Reliable Employer** requires 5+ completed jobs and no open or investigating reports. Teen feedback is visible to admins only. Admins hide or restore ratings through `admin_set_review_status` (audited). Only `mark_application_completed` can set `completed_at`.
- **Storage:** résumés live under `{teen_id}/…`. An employer can read one only if an application to their listing references it, and they get it through a 10-minute signed URL.

These policies were tested against Postgres 16 with Supabase's `auth` and `storage` schemas stubbed. The tests covered escalation attempts, cross-tenant reads, application spoofing, duplicate applications, self-verification and non-admins calling the RPCs.

---

## Email integration

`src/lib/email/send.ts` uses Resend. The templates are in `src/lib/email/templates.ts`.

| Event | Recipient | Sent by |
|---|---|---|
| Application submitted | Employer (new applicant) + teen (confirmation) | `POST /api/applications` |
| Status changed (except "viewed") | Teen, unless they opted out | `POST /api/applications/:id/status` |
| Urgent / emergency report | `SAFETY_INBOX` | `POST /api/reports` |
| Sign-up verification, password reset | User | Supabase Auth (customize its templates in the dashboard) |

To use a different provider, replace the body of `sendEmail()`. In-app notifications come from database triggers, so they still work when email isn't configured.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel. The framework is detected as Next.js.
2. Add the environment variables above for the Production and Preview environments.
3. Deploy. Then update Supabase's Site URL and redirect URLs to the Vercel domain.

Fonts load from Google Fonts at runtime, and photos come from Unsplash (with gradient fallbacks). Before launch, replace the placeholder photos with your own licensed images.

---

## Feature status

**Working now (demo mode and Supabase):**

- Public homepage, a marketplace with 11 filters plus sorting, job detail pages, similar jobs, and save/unsave
- Sign-up with role selection, sign-in, sign-out, forgot/reset password, email verification (Supabase), persistent sessions, protected dashboards (middleware + client guard + RLS)
- A complete teen application: validation, résumé upload, duplicate prevention, a confirmation screen, and automatic routing to the employer
- Teen dashboard: profile completion, recommended jobs, saved jobs, applications with progress and withdrawal, interviews (pick a time or decline), a notification center (live via Supabase Realtime), profile/résumé/availability, and privacy settings with blocking
- Employer onboarding (individual or business, verification request, conduct agreement)
- Employer dashboard: stats, listings CRUD (draft, publish, pause, close, delete, image upload), applicants grouped by job with status filters, auto-mark-as-viewed, interview requests, select/decline with a message, private notes, block and report
- Admin: reports queue (emergencies first), listing moderation (approve, reject, pause, remove, restore, feature), verification review, user suspension, categories and service areas, configurable age/consent/permit/approval rules, audit log, and standalone moderation notes
- Safety: a report form (including an emergency route at `/report?severity=emergency`) and block tools. Forms reject street addresses in listings and SSN-like numbers in applications
- Opportunity types: paid jobs, internships (paid, or unpaid for nonprofits) and volunteer roles, with tabs and filters. Unpaid listings require a nonprofit/school/public-agency attestation, database constraints enforce it, and switching a listing to unpaid sends it back to moderation
- CAPTCHA (Cloudflare Turnstile) on sign-up, sign-in and password reset, verified by Supabase Auth
- Ratings: employers get public ratings after completed jobs (stars plus paid as promised, matched listing, felt safe, respectful). Only aggregates are shown, and the score appears after 3 ratings. There's a Reliable Employer badge, private employer feedback about teens (teens are never publicly rated), rating disputes through reports, and admin hide/restore
- Legal pages (Privacy, Terms, Community Guidelines) marked as starter drafts, plus a Safety center

**Needs production credentials or more work:**

- A Supabase project (auth, database, storage, realtime) and a Resend API key with a verified sending domain
- **Background checks and identity verification aren't integrated.** Verification is a manual admin review, and the UI says so everywhere.
- There's no in-app messaging between employers and teens yet. Contact happens by email or phone after applying.
- Distance-radius search uses service areas and cities, not geolocation.
- Account deletion creates a request for an admin to handle. Automated data deletion isn't built yet.
- An attorney needs to review the legal pages, the age and permit rules, and the minimum-wage guidance before a public launch.
- Rate limiting and CAPTCHA on the public report form aren't set up (sign-up already has CAPTCHA once the Turnstile keys are set).
