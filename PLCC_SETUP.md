# PLCC Canaan — setup notes

PLCC Canaan is the Promised Land Christian Center copy of AWC Canaan. It is a **fully separate deployment**:
its own Supabase project, its own Vercel project, its own keys. Nothing here talks to AWC.

## What was rebranded (Nov 2026)
- Name: Anointed Worship Center → Promised Land Christian Center, "AWC …" → "PLCC …", AWC ONE → **PLCC ONE**
- Pastors: Pastor Grace & Kennedy Hiire (birthday-card signature, sermon speaker default, courtesy titles)
- Colors: burgundy/gold → PLCC forest green `#1d372c` / `#16251f` and warm gold `#C9A35A` / `#E4C98F`
- Fonts: Fraunces (headings) + Manrope (body), same as the PLCC website
- Logos/icons: PLCC sunrise mark, new PLCC ONE seal + wordmark (file names kept as `awc-*` so code paths still work)
- Address: Kira-Kitukutwe Trading Center, Wakiso District, Uganda; time zone `Africa/Kampala`
- Links: plcc-vault / plcc-connect / plcc-chat / plcc-tithe `.vercel.app`; church website → sanctum-live-nine.vercel.app

## Still AWC-shaped (to decide)
- Phone sign-in assumes US numbers (`normalizeUsPhone`); PLCC members use +256
- Money shows in US dollars; PLCC would use UGX
- Giving connects to Stripe/Zelle/Cash App/Venmo via AWC Tithe + DCB; PLCC giving provider still undecided (Flutterwave?)
- Env var names still start with `AWC_` (internal only, not shown to members)
- "First Lady" role name kept; rename if PLCC prefers another title
- Share flyers in `public/images/share/` are AWC event images

## Deploy checklist
1. New Supabase project for PLCC → copy the AWC schema only (no data)
2. New Vercel project from this repo, env vars below
3. Resend: verify a PLCC sending domain, set the from-address in `api/_utils/emailFrom.ts`
4. Daily.co / LiveKit: PLCC's own account for Live Huddle
5. New VAPID keys for phone alerts: `npx web-push generate-vapid-keys`

### Env vars
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VAULT_PUBLIC_ORIGIN=https://plcc-opal.vercel.app
CONNECT_PUBLIC_ORIGIN=https://plcc-connect.vercel.app
VITE_APP_URL=https://plcc-opal.vercel.app
VITE_AUTH_REDIRECT_URL=https://plcc-opal.vercel.app
RESEND_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@plcc.church
CRON_SECRET=
CHAT_REALTIME_SECRET=
```
Leave the `AWC_DCB_*`, `AWC_TITHE_*` and Twilio vars empty until PLCC's giving and SMS are set up.
