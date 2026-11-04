# Local Development Setup

This project uses Vercel serverless functions for API endpoints. To run the application locally with full API support, you need to run both the frontend and API servers.

## Quick Start

### Option 1: One command (recommended)

```bash
npm run dev:all
```

Starts the API on port **5001** and Vite on port **3003**. Open http://localhost:3003/

Without the API, email login codes fail with a 500 (Vite proxies `/api/*` to `:5001`). On localhost you can also use **Preview Home (local only)** on the login screen to open the UI without signing in.

### Option 2: Run Both Servers Manually

1. **Start the API Server** (in one terminal):
   ```bash
   npm run dev:api
   ```
   This starts the Express server on port 5001 that handles `/api/*` requests.

2. **Start the Frontend** (in another terminal):
   ```bash
   npm run dev
   ```
   This starts the Vite dev server on port **3003** with automatic proxy to the API server.

3. **Access the Application**:
   Open http://localhost:3003

### Option 2: Use Vercel Dev (Requires Authentication)

```bash
vercel dev
```

This runs both frontend and API in one command, but requires Vercel CLI authentication.

## How It Works

- **Frontend**: Vite dev server with React
- **API**: Express server that dynamically loads and executes TypeScript serverless functions from `/api/*`
- **Proxy**: Vite is configured to proxy `/api/*` requests to `http://localhost:5001`

## Environment Variables

Make sure you have a `.env.local` file with the required environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Ask Admin (OpenAI primary, Anthropic fallback when credits/quota fail)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
# Optional model overrides:
# OPENAI_ASK_ADMIN_MODEL=gpt-4o-mini
# ANTHROPIC_ASK_ADMIN_MODEL=claude-3-5-haiku-20241022

# Legacy (still used by Strategy Brief / Live Huddle if present):
# GEMINI_API_KEY=your_gemini_key

# Optional: PLCC Store order staff alerts (comma-separated). No-op until set.
# STORE_ORDER_NOTIFY_EMAILS=store@example.com,finance@example.com
# Shared secret for store/Supabase → Vault notify webhook:
# STORE_ORDERS_WEBHOOK_SECRET=long-random-string
# Optional public Vault URL used in email links:
# STORE_ORDERS_VAULT_URL=https://plcc-vault.vercel.app

# Optional: extra event calendar approvers (comma-separated user UUIDs).
# SUPER_ADMIN / PASTOR / ADMIN always approve; this seeds others (also seeded via
# event_approver_config from jerlessm@gmail.com in migration events_approval_flow.sql).
# EVENT_APPROVER_USER_IDS=11111111-1111-1111-1111-111111111111

# Fellowship RSVP (Thanksgiving / Marrieds Dinner) → DCB Mark Paid HMAC bridge
# Same secret as DCB Render env AWC_DCB_SERVICE_SECRET.
# AWC_DCB_API_URL=https://awc-digital-contribution-book.onrender.com
# AWC_DCB_SERVICE_SECRET=long-random-shared-secret
# Optional Vault fund UUID for local giving_transactions:
# RSVP_GIFT_FUND_ID=
# MARRIEDS_GIFT_FUND_ID=
# THANKSGIVING_GIFT_FUND_ID=
# Optional DCB fund match (code preferred, else name):
# AWC_DCB_RSVP_FUND_CODE=SPECIAL
# AWC_DCB_RSVP_FUND_NAME=Special Offerings
# (legacy aliases still work: AWC_DCB_THANKSGIVING_FUND_CODE / _NAME)
```

### Thanksgiving & Marrieds Dinner RSVP → DCB (Mark Paid)

1. In Supabase, run migrations if needed:
   - `add_thanksgiving_gift_payment_choice.sql`
   - `add_thanksgiving_dcb_voucher.sql`
   - `add_marrieds_dinner_2026_rsvp.sql`
2. On Vercel (Vault), set `AWC_DCB_API_URL` and `AWC_DCB_SERVICE_SECRET` (same secret as DCB).
3. In DCB, ensure an active fund matches `AWC_DCB_RSVP_FUND_CODE` / `AWC_DCB_RSVP_FUND_NAME` (or legacy `AWC_DCB_THANKSGIVING_*`).
4. Smoke: `/#/marrieds-dinner-rsvp` or `/#/thanksgiving-rsvp` → Pay Now · Zelle → staff **Mark Paid** → gift appears in DCB **Online Giving → Overview → Thanksgiving / RSVP gifts**.

Pledges stay on the Vault RSVP list until Mark Paid; only paid gifts post to DCB.

### Ask Admin AI providers

Ask Admin calls the Vault API (`resource=ask-admin`), which tries **OpenAI first**, then **Anthropic** if OpenAI fails due to credits/quota/errors.

Set both keys in **Vercel → Project → Settings → Environment Variables**, then redeploy.

### Store order email webhook

When the PLCC Store (or a Supabase Database Webhook) creates an order, POST to:

`POST /api/vault?resource=store-orders&action=notify`

Headers: `X-Store-Orders-Secret: <STORE_ORDERS_WEBHOOK_SECRET>`  
Body: `{ "id": "<store_orders.id>" }` or a full order object.

Emails send only if `STORE_ORDER_NOTIFY_EMAILS` and `RESEND_API_KEY` are set.

### Consent / E-Sign forms

Templates live in Supabase `consent_forms`. If Forms → Consent / E-Sign shows an empty list:

1. **Preferred:** In Vault, open Consent / E-Sign → click **Install Default Forms** (or Forms tab → **Install Defaults**). This calls `POST /api/vault?resource=consent&action=seed_defaults`.
2. **SQL fallback:** Run `supabase/migrations/insert_awc_consent_forms.sql` then `supabase/migrations/seed_awc_consent_esign_forms.sql` in the Supabase SQL Editor.
3. **Audience column (Children / Adults):** Run `supabase/migrations/add_consent_forms_audience.sql` once in the Supabase SQL Editor. Existing forms default to **children**. Create/Edit and Install Defaults set `audience` after this migration.
4. **Kids check-in vs adult forms:** Run `supabase/migrations/get_missing_consents_exclude_adults.sql` so required adult templates never block child check-in. Then **Sync Defaults** to install Adult Incident / Volunteer Liability / Adult Photo / Adult Code of Conduct.

Parents / members: Forms → Consent / E-Sign → Forms → filter **Children** or **Adults** → tap form. Children forms: pick a child → modal. Adult forms: sign for yourself (no child picker). Kids Check-In later skips child forms already signed. Staff can also use **Children → Collect E-Sign** or the pad during **Kids Check-In**.

## Troubleshooting

- **500 Errors on API Calls**: Make sure the API server (`npm run dev:api`) is running
- **Port Conflicts**: If port 3000 or 5001 is in use, the servers will try alternative ports
- **Module Not Found**: Run `npm install` to ensure all dependencies are installed
- **No e-sign forms / nothing to sign**: Install defaults (see Consent / E-Sign above). Tell parents to come to the Kids Check-In desk — not to hunt forms in Vault alone.

### Supabase compute for multi-member meetings (required ops)

Community Chat, Staff & Roles, and Live Huddle all hit Supabase Auth + Postgres. On **t4g.nano**, concurrent joins can spike Postgres/Auth errors even while the dashboard still says “Healthy.”

**Before the next multi-church / large Huddle meeting:**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project **awc-vault** (East US).
2. **Project Settings → Compute / Add-ons** (or Infrastructure) → upgrade Primary Database **off t4g.nano** to at least the next **Micro** or **Small** tier.
3. After upgrade, confirm **Postgres** and **Auth** error charts stay low during a 5–10 person practice join.
4. Reminder: keep Huddles **audio-first** (camera off until needed); one host starts, others Join a few seconds apart.

### Supabase OTP email (Resend SMTP)

If login OTP emails fail and your Supabase logs show an error like **`535 Authentication credentials invalid`**, the issue is SMTP authentication (not your frontend code).

- **Supabase**: Authentication → Email → SMTP Settings
  - **Host**: `smtp.resend.com`
  - **Port**: `587` (STARTTLS is automatic on 587) or `465`
  - **Username**: `resend`
  - **Password**: your Resend API key (`re_...`)
- **Resend**: verify the **sender domain** used in Supabase (the domain after the `@`) or Resend may reject sending.
  - This project was configured with `anointedworshipcenter@atomicmail.io` as the sender address. If you change the sender, make sure that domain is verified in Resend.
