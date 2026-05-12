-- Migration 0009 — customer acceptance signature on estimates
--
-- Adds the ability for a customer to formally accept an NTE estimate by
-- signing it on screen. The signature is stored alongside the estimate so
-- the PDF can render it, and so there is a defensible audit trail of
-- customer acceptance before work begins.
--
-- Fields:
--   customer_signature_data — base64 PNG of the signature canvas
--   customer_signature_name — printed name the customer typed
--   customer_signed_at      — timestamp of acceptance
--   customer_acknowledged   — checkbox confirmation
--
-- Status transitions when signed:
--   draft  → signing transitions to status='accepted'
--   sent   → signing transitions to status='accepted'

alter table estimates
  add column if not exists customer_signature_data text;

alter table estimates
  add column if not exists customer_signature_name text;

alter table estimates
  add column if not exists customer_signed_at timestamptz;

alter table estimates
  add column if not exists customer_acknowledged boolean default false;
