# TaskTeens launch checklist (pilot)

Status as of the Phase 9 commit. "Done" items were checked against the live project; everything else
needs a person to do it. This is an engineering checklist, **not legal advice** and not a statement that
TaskTeens complies with any law.

## 1. Blockers — do before real teens use the site

| # | Item | Why it matters | Who |
|---|------|----------------|-----|
| 1 | **Run notification delivery every minute.** Set `CRON_SECRET` in Vercel (Production), enable `pg_cron` + `pg_net` in Supabase, then run `supabase/setup/notification-cron.sql` with the same secret. | Without it, missed check-in alerts and any email/SMS that isn't sent immediately wait for the once-a-day Vercel cron (`vercel.json`). SOS alerts try to send right away, but retries also depend on this. | Owner |
| 2 | **Set up SMS (Twilio)**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. Complete US A2P 10DLC registration. | Until then, parent alerts are in-app + email only, and the app says texting isn't set up. Employer phone codes can't be sent. | Owner |
| 3 | **Turn on admin two-factor (TOTP)** in Supabase Auth → MFA, then enroll every admin at `/auth/mfa`. `platform_settings.require_admin_mfa` is on, so admins can't use admin pages until they enroll. | Admin accounts can see teen data and location snapshots. | Owner |
| 4 | **Turn on leaked-password protection** (Supabase Auth → Passwords). Flagged by the Supabase security advisor. | Blocks passwords known from breaches. | Owner |
| 5 | **Verify the sending domain in Resend** and set `EMAIL_FROM` to an address on it; set `SAFETY_INBOX`. Send yourself a parent invitation and an SOS test to confirm delivery. | Unverified domains land in spam or are rejected. | Owner |
| 6 | **Lawyer review** of `src/content/terms.ts`, `src/content/privacy.ts` and the parent consent statements (`src/lib/safety/consent.ts`). They are labeled pilot drafts. See §4 for questions. | Required before relying on them. | Lawyer |
| 7 | **Decide the production branch.** Vercel currently builds `launch-safety` only as previews; production was promoted manually. Merge `launch-safety` into `main` and set Production Branch = `main`. | Avoids unreviewed code going live and makes deploys predictable. | Owner |
| 8 | **Remove test data**: the "TEST JOB" listings and the `+teen` / `+parent` / `+employer` test accounts (or keep them clearly labeled and never published). | Real visitors can currently see the test listings. | Owner |

## 2. Recommended before wider launch

- **Google Address Validation** (`GOOGLE_ADDRESS_VALIDATION_API_KEY`): without it, addresses go straight to manual admin review.
- **LiveKit push-to-talk** (`NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`): the button is labeled unavailable until set. No audio is recorded.
- **Turnstile** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) for signed-out report and sign-up forms.
- **Backups**: confirm the Supabase plan's backup / point-in-time recovery meets your needs. Evidence files live in the private `incident-evidence` bucket.
- **Content-Security-Policy header**: not set yet (needs allow-listing Supabase, LiveKit, Turnstile and the OpenStreetMap embed). The other security headers are set in `next.config.mjs`.
- **Staff coverage**: SOS and urgent reports notify every active admin by email. Decide who watches the admin inbox and `/admin/safety` during pilot hours, and how fast.

## 3. Security review (done in Phase 9)

- Every public table has row-level security on (checked live and by `supabase/tests/rls_90_grants.sql`).
- Every `SECURITY DEFINER` function pins `search_path` (checked live and in tests).
- Signed-out visitors can call only seven reviewed functions: `is_admin`, `is_parent_of`, `is_active_user`, `employer_listable` (used by row policies), `employer_trust_indicators`, `employer_rating_summaries` (public listing badges), `current_user_role`. A new one fails the test suite.
- Secret keys (`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, Twilio, LiveKit secret, Resend, Turnstile secret, Google key, `CRON_SECRET`) are read only in server code (`server-only` modules and API routes); none appear in the browser build.
- Evidence uploads: own-folder only; downloads only through the evidence record's access rules; records can't be edited or deleted; file type and 25 MB limits enforced in the bucket and in the database.
- Admin data requires MFA (aal2) when `require_admin_mfa` is on. Location and address views by admins require a written reason and are audit-logged.
- Known, accepted: signed-in users can ask whether a given user ID is restricted or what a teen's parent-confirmation status is (yes/no level). Revisit if IDs become guessable or exposed.
- `one_time_codes` has RLS on and no policies on purpose (server-only).

## 4. Questions for a lawyer (not answered here)

- Do the Terms, Privacy Policy and parent consent flow fit California and federal rules for collecting data from users aged 14–17, including any opt-in requirements for minors' data?
- Which California child labor and work-permit rules apply to one-off household jobs arranged through TaskTeens, and what should the site tell families and employers?
- Is the platform's role (connecting teens with households, not employing them) described accurately everywhere?
- Live location: is the parent-permission + teen-opt-in + no-history design, and its disclosure, adequate?
- Incident handling: retention period for reports and evidence; when TaskTeens must or should contact authorities; handling subpoenas or law-enforcement requests; what the "referred" status should trigger.
- Insurance: general liability / platform coverage for the pilot.
- Wording: the site avoids "background checked", "verified identity/age", "completely safe" and "guaranteed notification" (enforced by `tests/banned-language.test.ts`). Confirm the remaining safety wording is acceptable.

## 5. Manual test script (run on production after each release)

Use three browsers or private windows: teen, parent, employer. Admin needs MFA.

1. **Sign-up**: new teen account → parent invitation email arrives → parent signs up from the link and gives consent → teen can apply.
2. **Employer verification**: new employer → phone code (needs Twilio) → address submitted → admin reviews address and profile → employer can publish; listing waits for moderation if enabled.
3. **Apply → approve**: teen applies → employer selects → parent gets approval request → parent approves → exact address appears for teen and parent only.
4. **Messages**: send a message containing a phone number → it's held/flagged → parent sees it; admin sees the flag.
5. **Active job**: inside the time window, teen checks in → parent notified; teen shares location → parent sees map; teen checks out → location stops.
6. **Missed check-in**: confirmed job with no check-in 15 min after start → parent alert (needs §1 #1).
7. **SOS**: teen taps "I feel unsafe" → parent banner + email; admin sees it on `/admin/safety`; teen taps "I'm safe now"; parent closes; admin resolves and unfreezes. Test "Emergency" only on a test employer (it restricts the employer and opens the 911 call screen; cancel the call).
8. **Incident**: teen files a harassment report with a photo → urgent, job frozen, employer can't see it → admin asks employer to respond → employer adds statement → admin closes as inconclusive and unfreezes.
9. **Restriction**: restrict a test employer → listings disappear from `/jobs`, they see the neutral banner → send notice → lift.
10. **Password reset**: "Forgot password" → open the newest email in the same browser → set new password.

## 6. Automated checks (run before every release)

```bash
npm run lint && npx tsc --noEmit && npx vitest run      # unit + banned-language tests
bash scripts/test-db.sh                                  # database permission tests (local Postgres)
NEXT_TELEMETRY_DISABLED=1 npx next build
```
