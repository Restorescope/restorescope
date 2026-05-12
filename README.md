# RestoreScope Mitigation

Phase 1 mitigation report builder for **1-800 WATER DAMAGE of North Dakota**.

Built with **React + Vite + Tailwind + Supabase**. Field-first, mobile-first.

---

## Phase 1 scope

What this build includes:

- Email/password auth with **multi-tenant** structure (Tenants → Users → Jobs)
- Roles: **Owner**, **PM**, **Technician**
- Manual job number entry (validated unique per tenant)
- Job intake (customer + claim + loss info, all required)
- Affected rooms with materials / actions / reasons / final status
- **Drying chambers** that group rooms (matches Encircle's pattern)
- **Work items** for job-level activities (extraction, containment, debris, etc.)
- Moisture readings with per-material drying goals + unaffected reference readings
- Equipment events (placed / monitoring / removed) with asset labels
- Daily monitoring visits with dehu performance + grain depression
- Photo capture with compression, EXIF preserved, auto-tagging
- Owner-editable Settings: rooms, materials, meters, equipment, scope library, **QC rules (block/warn/off)**
- PDF report generation with full brand styling (logo, blue header, yellow accent, Barlow)
- PM finalize → Owner unlock workflow

Out of scope (Phase 2+): AI-written summaries, Word/email export, dashboards, CompanyCam/Encircle/Xactimate integrations, offline mode, two-way SMS, in-app signatures.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

1. Create a new Supabase project at https://supabase.com.
2. In the SQL editor, paste and run `supabase/migrations/0001_phase1_schema.sql`.
3. In the Storage section, create four **private** buckets:
   - `job-photos`
   - `reading-photos`
   - `reports`
   - `tenant-assets`
4. For each bucket, add storage policies that gate by tenant prefix (paste from the bottom of the migration file).

### 3. Env

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:5173. Click **Create an account**, fill in your name and company name (defaults to 1-800 WATER DAMAGE of North Dakota), confirm your email, and sign in.

---

## Architecture rules

These rules are non-negotiable in this codebase:

- **Always import** the Supabase client from `../lib/supabase` — never instantiate elsewhere.
- **Never redefine** shared UI components inside screen files. Import from `../ui` only.
- **Never invent** schema. The migration file is authoritative; if you need a column, add a migration.
- **Targeted fixes only.** No UI redesigns or sweeping refactors during feature work.
- **RLS gates everything.** Every business table has a `tenant_id` column and an RLS policy. Never disable it.
- **Field-first UX.** Tap targets ≥ 44px, forms work one-handed, photo capture is one tap.

---

## Brand

- Primary: `#0061AF` (brand-blue)
- Accent: `#FFF200` (brand-yellow)
- Type: Barlow (body), Barlow Condensed (display)
- Tagline: *Restoring What Matters Most™*
- Phone: 701-670-2022
- Web: 1800waterdamage.com/north-dakota

Always use 1-800 WATER DAMAGE of North Dakota branding only — never any other company.

---

## Build steps (this milestone covers 1–6)

1. ✅ Vite + Tailwind + brand tokens + logo
2. ✅ Supabase client + auth context
3. ✅ Schema migration + RLS + bootstrap_tenant RPC + default seeds
4. ✅ Shared `./ui` library (Button, Input, Select, Textarea, Card, Header, BottomNav, Badge, StatusPill, EmptyState, Section, Logo)
5. ✅ Auth screens (Login, Signup)
6. ✅ App shell + role-aware routing + RequireAuth guard
7. ⏭ Job list + create job (intake form)
8. ⏭ Job dashboard (section nav + QC banner)
9. ⏭ Affected rooms (list + detail)
10. ⏭ Photo upload (compression + auto-tag + storage)
11. ⏭ Moisture readings
12. ⏭ Equipment events
13. ⏭ Monitoring visits
14. ⏭ Scope items + library picker
15. ⏭ Settings screens (rooms, materials, meters, equipment, scope library, qc_rules)
16. ⏭ QC engine + Review screen
17. ⏭ PDF report builder
18. ⏭ Finalize / unlock workflow

Steps 7+ in follow-up turns. Each step lands a working, testable slice.
