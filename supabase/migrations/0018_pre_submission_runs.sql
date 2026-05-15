-- Migration 0018 — pre-submission AI analysis runs
--
-- Stores the AI analysis result for each job so the team can:
--   - Re-view findings without re-running the analysis (saves API $)
--   - Track when analysis was last run vs when data changed
--   - Audit history of findings

create table if not exists pre_submission_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  summary       text,
  findings      jsonb not null default '[]'::jsonb,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_presubmission_job on pre_submission_runs(job_id, created_at desc);
create index if not exists idx_presubmission_tenant on pre_submission_runs(tenant_id);

alter table pre_submission_runs enable row level security;

drop policy if exists "Tenant members read pre_submission_runs" on pre_submission_runs;
create policy "Tenant members read pre_submission_runs"
on pre_submission_runs for select to authenticated
using (tenant_id = current_tenant_id());

drop policy if exists "Tenant members write pre_submission_runs" on pre_submission_runs;
create policy "Tenant members write pre_submission_runs"
on pre_submission_runs for all to authenticated
using (tenant_id = current_tenant_id())
with check (tenant_id = current_tenant_id());
