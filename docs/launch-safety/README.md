# TaskTeens launch safety — implementation notes

Work happens on branch `launch-safety`, one commit per phase. Nothing here makes TaskTeens
"legally compliant" or makes anyone "safe"; it adds parental control, data minimisation,
truthful status reporting and human review. An attorney must review before launch.

## Roles (§2)

| Spec role | Implementation |
|---|---|
| Teen | `users.role = 'teen'` + `teen_profiles` |
| Parent/Guardian | `users.role = 'parent'` + `parent_profiles`; linked to teens via `parent_teen_links` (separate account — parents never sign in as the teen) |
| Household Employer | `users.role = 'employer'` + `employer_profiles` |
| Administrator | `users.role = 'admin'`; **database admin rights require an MFA (aal2) session** when `platform_settings.require_admin_mfa` is on (default) |

One role per account. `role_assignments` from the spec is represented by `users.role`; a parent who is also an employer uses two accounts.

## Entity mapping (§20)

| Spec entity | Table |
|---|---|
| profiles | `users`, `teen_profiles`, `parent_profiles`, `employer_profiles` |
| parent_teen_links / parent_invitations / parental_consents | `parent_teen_links`, `parent_invitations` (hashed token), `parent_consents` (version, statements, IP, user agent; immutable, revocable) |
| employer_verifications / addresses | `verification_checks` (one row per check), `employer_addresses`, `one_time_codes` (server-only) |
| jobs / job_versions | `jobs` (+ safety fields, `version`, `risk_flags`), `job_versions` |
| job_applications / parent_job_approvals | `applications`, `parent_job_approvals` (snapshot of approved terms) |
| job_shifts / checkins | `job_shifts`, `job_checkins` |
| conversations / participants / messages / moderation_flags | `conversations` (one per application; participants derived), `messages` (append-only), `moderation_flags` |
| location_sharing_sessions / location_points | `location_sharing_sessions`, `location_current` (one latest point per active session — **no movement history**) |
| safety_alerts / emergency_events | `safety_alerts` (`level` = unsafe / emergency / missed_checkin) |
| incident_reports / participants / responses / evidence | `incident_reports`, `incident_participants`, `incident_responses` (append-only), `incident_evidence` (no delete) |
| account_restrictions | `account_restrictions` |
| notifications / notification_deliveries | `notifications`, `notification_deliveries` (email/SMS status + retries) |
| audit_logs | `audit_logs` (append-only) and `admin_audit_logs` (now append-only) |

## Application status flow (§7)

`submitted → viewed → interview_requested → selected (awaiting parent approval) → confirmed`
plus `parent_declined`, `not_selected`, `withdrawn`, `cancelled`.
Only a linked parent can move `selected → confirmed` (`parent_decide_application`). A material
change to the job bumps `jobs.version`, invalidates approvals and moves confirmed jobs back to `selected`.

## RLS summary

- **Location** (`location_current`): readable only by the teen and their linked parent while the session is active and before `ends_by`. No employer or admin policy. Writes only through RPC.
- **Safety alerts**: teen, linked parent, admin (aal2). Never the employer.
- **Messages**: participants see delivered messages and their own held ones; linked parents and admins see all. No insert/update/delete grants — `send_message` RPC only, which sets `sender_role` from the session (no impersonation).
- **Employer addresses**: employer sees own; admins have no table access and must call `admin_get_address(id, reason)` (logged). Teens/parents get the job address only via `get_job_address()` after parent approval of the current job version.
- **Applications**: teen, employer, linked parent, admin. Teen email/phone are no longer stored.
- **Consents, audit logs, incident responses, messages**: append-only (triggers).
- **Restrictions**: `is_restricted()` blocks messaging, job edits/publishing, interview requests and job deletion for restricted accounts.

## Tests

- `npm run test:db` — builds a scratch Postgres DB from all migrations (`supabase/tests/stubs.sql` stands in for Supabase auth) and runs `supabase/tests/rls_safety.sql` (permission tests).
- `npm test` — vitest unit tests (validation, banned-language scan of all copy).
