-- Migration 0008 — store final recommendations on screening_inspections
--
-- The Recommendations step of the screening workflow lets the user pick from
-- quick-pick templates (from Settings → Screening Recommendations) and
-- optionally call AI to generate detailed recommendations. The final list
-- (after any user edits) is stored here and used by the report PDF.
--
-- We store it as plain text — one recommendation per line. Keeps the storage
-- and rendering simple. If we later want categorization or per-line metadata,
-- we can promote this to a JSON field or its own table.

alter table screening_inspections
  add column if not exists recommendations_text text;

alter table screening_inspections
  add column if not exists recommendations_generated_by text;
  -- 'manual' / 'quickpick' / 'ai' / 'mixed' — informational, helps the UI know
  -- whether to surface "AI-generated, please review" warnings on the report

alter table screening_inspections
  add column if not exists recommendations_updated_at timestamptz;
