-- Migration 0012 — archive and soft-delete on jobs
--
-- Two distinct removal mechanisms for jobs:
--
--   Archive (soft, reversible)
--     For finished/paid jobs you want out of your active workspace but
--     still need for records, taxes, audits, insurance. Both Owner and PM
--     can archive. Always reversible.
--
--   Delete (soft via column flag, presented as "delete" in UI)
--     For jobs that never should have existed — customer backed out, test
--     jobs, duplicates. Owner-only. The UI treats deleted as gone forever
--     but we keep the row + linked data in case true recovery is ever
--     needed.
--
-- We never use Postgres DELETE on jobs — too much linked data (rooms,
-- readings, photos, samples, screening). Soft delete preserves audit
-- trail and lets us recover from accidents.

alter table jobs
  add column if not exists archived_at timestamptz;

alter table jobs
  add column if not exists archived_by uuid references users(id);

alter table jobs
  add column if not exists deleted_at timestamptz;

alter table jobs
  add column if not exists deleted_by uuid references users(id);

create index if not exists idx_jobs_active_state
  on jobs (tenant_id)
  where archived_at is null and deleted_at is null;
