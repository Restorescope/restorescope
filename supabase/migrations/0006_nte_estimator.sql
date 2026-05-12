-- Migration 0006 — NTE Estimator integration
--
-- Adds three tables:
--   rate_catalog      — per-tenant catalog of priced line items (seeded from
--                       1-800 WATER DAMAGE 2026 National Rate Schedule)
--   estimates         — one or more estimates per job, version-numbered
--   estimate_lines    — line items on each estimate
--
-- Catalog is per-tenant so each franchise can adjust rates independently
-- without affecting other tenants.

-- ============================================================================
-- rate_catalog
-- ============================================================================
create table if not exists rate_catalog (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  section     text not null check (section in ('Labor','Equipment','Consumables')),
  category    text not null,
  name        text not null,
  unit        text not null,
  rate        numeric(10,2) not null,
  active      boolean not null default true,
  display_order integer,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_rate_catalog_tenant on rate_catalog(tenant_id, active);
create index if not exists idx_rate_catalog_section on rate_catalog(tenant_id, section, category);

alter table rate_catalog enable row level security;

drop policy if exists "rate_catalog_tenant_select" on rate_catalog;
drop policy if exists "rate_catalog_tenant_insert" on rate_catalog;
drop policy if exists "rate_catalog_tenant_update" on rate_catalog;
drop policy if exists "rate_catalog_tenant_delete" on rate_catalog;

create policy "rate_catalog_tenant_select" on rate_catalog
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "rate_catalog_tenant_insert" on rate_catalog
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "rate_catalog_tenant_update" on rate_catalog
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "rate_catalog_tenant_delete" on rate_catalog
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- estimates
-- ============================================================================
create table if not exists estimates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  version       integer not null default 1,
  estimate_number text,
  status        text not null default 'draft' check (status in ('draft','sent','accepted','rejected','superseded')),
  scope_summary text,
  estimator_name text,
  markup_pct    numeric(5,2) not null default 0,
  contingency_pct numeric(5,2) not null default 10,
  tax_pct       numeric(5,3) not null default 0,
  subtotal      numeric(12,2) not null default 0,
  markup_amt    numeric(12,2) not null default 0,
  contingency_amt numeric(12,2) not null default 0,
  tax_amt       numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (job_id, version)
);

create index if not exists idx_estimates_job on estimates(job_id);
create index if not exists idx_estimates_tenant on estimates(tenant_id);

alter table estimates enable row level security;

drop policy if exists "estimates_tenant_select" on estimates;
drop policy if exists "estimates_tenant_insert" on estimates;
drop policy if exists "estimates_tenant_update" on estimates;
drop policy if exists "estimates_tenant_delete" on estimates;

create policy "estimates_tenant_select" on estimates
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "estimates_tenant_insert" on estimates
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "estimates_tenant_update" on estimates
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "estimates_tenant_delete" on estimates
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- estimate_lines
-- ============================================================================
create table if not exists estimate_lines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  estimate_id     uuid not null references estimates(id) on delete cascade,
  catalog_id      uuid references rate_catalog(id),
  -- Snapshot fields: when the catalog item is edited later, prior estimate
  -- lines retain the original wording and rate
  section         text not null,
  category        text,
  name            text not null,
  unit            text not null,
  rate            numeric(10,2) not null,
  qty             numeric(12,2) not null default 1,
  days            numeric(10,2) not null default 1,
  line_subtotal   numeric(12,2) not null default 0,
  notes           text,
  display_order   integer,
  created_at      timestamptz default now()
);

create index if not exists idx_estimate_lines_estimate on estimate_lines(estimate_id);

alter table estimate_lines enable row level security;

drop policy if exists "estimate_lines_tenant_select" on estimate_lines;
drop policy if exists "estimate_lines_tenant_insert" on estimate_lines;
drop policy if exists "estimate_lines_tenant_update" on estimate_lines;
drop policy if exists "estimate_lines_tenant_delete" on estimate_lines;

create policy "estimate_lines_tenant_select" on estimate_lines
  for select to authenticated using (tenant_id = current_tenant_id());
create policy "estimate_lines_tenant_insert" on estimate_lines
  for insert to authenticated with check (tenant_id = current_tenant_id());
create policy "estimate_lines_tenant_update" on estimate_lines
  for update to authenticated using (tenant_id = current_tenant_id());
create policy "estimate_lines_tenant_delete" on estimate_lines
  for delete to authenticated using (tenant_id = current_tenant_id());

-- ============================================================================
-- Seed function — populates rate_catalog for a tenant from the 2026 schedule.
-- Call this once per tenant (manually, after migration runs):
--   select seed_rate_catalog('YOUR-TENANT-UUID-HERE');
-- ============================================================================
create or replace function seed_rate_catalog(_tenant_id uuid)
returns void as $$
declare
  _existing integer;
begin
  select count(*) into _existing from rate_catalog where tenant_id = _tenant_id;
  if _existing > 0 then
    raise notice 'rate_catalog already has % rows for this tenant; skipping seed', _existing;
    return;
  end if;

  insert into rate_catalog (tenant_id, section, category, name, unit, rate, display_order) values
    (_tenant_id, 'Labor', 'General Classifications', 'Restoration Technician', 'Per Hour', 68.5, 1),
    (_tenant_id, 'Labor', 'General Classifications', 'Restoration Supervisor', 'Per Hour', 75.5, 2),
    (_tenant_id, 'Labor', 'General Classifications', 'Dehumidification Technician', 'Per Hour', 83.0, 3),
    (_tenant_id, 'Labor', 'General Classifications', 'Mold Technician', 'Per Hour', 83.0, 4),
    (_tenant_id, 'Labor', 'General Classifications', 'Mold Technician Supervisor', 'Per Hour', 98.0, 5),
    (_tenant_id, 'Labor', 'Environmental Services', 'Hazmat/Asbestos Technician', 'Per Hour', 89.0, 6),
    (_tenant_id, 'Labor', 'Environmental Services', 'Hazmat/Asbestos Lead Technician', 'Per Hour', 98.0, 7),
    (_tenant_id, 'Labor', 'Environmental Services', 'Hazmat/Asbestos Supervisor', 'Per Hour', 119.0, 8),
    (_tenant_id, 'Equipment', 'Air Movers', 'Air movers / carpet blowers / Axial fans', 'Ea / Day', 36.0, 9),
    (_tenant_id, 'Equipment', 'Air Movers', 'Injectidry Unit', 'Ea / Day', 158.0, 10),
    (_tenant_id, 'Equipment', 'Air Filtration', 'AFD Air Scrubber', 'Ea / Day', 172.0, 11),
    (_tenant_id, 'Equipment', 'Drying & Heat', 'Dehumidifier - 100 to 140 AHAM Pints', 'Ea / Day', 175.0, 12),
    (_tenant_id, 'Equipment', 'Drying & Heat', 'Heat Cube', 'Ea / Day', 145.0, 13),
    (_tenant_id, 'Equipment', 'Power', 'Spider Box Cables / 50 Amp', 'Ea / Day', 43.0, 14),
    (_tenant_id, 'Equipment', 'Power', 'Spider Box', 'Ea / Day', 63.0, 15),
    (_tenant_id, 'Equipment', 'Extraction', 'Extraction Unit (Portable)', 'Ea / Day', 188.0, 16),
    (_tenant_id, 'Equipment', 'Extraction', 'Extraction Unit (Truck or Trailer mount)', 'Ea / Day', 680.0, 17),
    (_tenant_id, 'Equipment', 'Vacuums & Insulation', 'Vacuum, Insulation Machine', 'Ea / Day', 109.0, 18),
    (_tenant_id, 'Equipment', 'Vacuums & Insulation', 'Insulation Bags', 'Ea / Day', 60.0, 19),
    (_tenant_id, 'Equipment', 'Floor Prep', 'Flooring Stripper (includes blades)', 'Ea / Day', 225.0, 20),
    (_tenant_id, 'Equipment', 'Floor Prep', 'Concrete Grinder', 'Ea / Day', 575.0, 21),
    (_tenant_id, 'Equipment', 'Pumps', 'Pump, Trash with Hose, 2"', 'Ea / Day', 168.0, 22),
    (_tenant_id, 'Equipment', 'Pumps', 'Pump, Trash with Hose, 2" Hazmat', 'Ea / Day', 374.0, 23),
    (_tenant_id, 'Consumables', 'Bags', 'Bags, Trash (each) 3 mil / 6 mil', 'Each', 2.5, 24),
    (_tenant_id, 'Consumables', 'Bags', 'Bags, Environmental Trash', 'Each', 3.6, 25),
    (_tenant_id, 'Consumables', 'Cleaners & Disinfectants', 'Disinfectant - Bioesque', 'Gallon', 63.0, 26),
    (_tenant_id, 'Consumables', 'Cleaners & Disinfectants', 'Antimicrobial Bioesque', 'Gallon', 62.0, 27),
    (_tenant_id, 'Consumables', 'Cleaners & Disinfectants', 'All-Purpose Cleaner', 'Gallon', 25.0, 28),
    (_tenant_id, 'Consumables', 'Cleaners & Disinfectants', 'Fogger, Thermo Deodorizer', 'Gallon', 81.5, 29),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Filter, Charcoal (Carbon Activated)', 'Each', 79.0, 30),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Filter, HEPA', 'Each', 279.0, 31),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Filter, HEPA Canister', 'Each', 125.0, 32),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Filter, Pleated', 'Each', 25.0, 33),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Filter, Poly (Secondary)', 'Each', 10.0, 34),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Duct, Lay Flat (500'') with hog rings', 'Roll', 565.0, 35),
    (_tenant_id, 'Consumables', 'Sheeting & Floor Protection', 'Plastic Sheeting, 4 mil (10 x 100)', 'Roll', 204.0, 36),
    (_tenant_id, 'Consumables', 'Sheeting & Floor Protection', 'Plastic Sheeting, 6 mil (10 x 100)', 'Roll', 315.0, 37),
    (_tenant_id, 'Consumables', 'Sheeting & Floor Protection', 'Plastic Sheeting, Carpet Protector', 'Roll', 177.0, 38),
    (_tenant_id, 'Consumables', 'Sheeting & Floor Protection', 'Ram Board (38" x 100'')', 'Roll', 195.0, 39),
    (_tenant_id, 'Consumables', 'Sheeting & Floor Protection', 'Red Rosin Paper (200 ft. roll)', 'Roll', 66.0, 40),
    (_tenant_id, 'Consumables', 'PPE', 'Gloves, Latex (Surgical)', 'Per Pair', 8.0, 41),
    (_tenant_id, 'Consumables', 'PPE', 'Gloves, Leather', 'Per Pair', 15.0, 42),
    (_tenant_id, 'Consumables', 'PPE', 'Gloves, Cotton / Rubber Coated Cotton', 'Per Pair', 10.0, 43),
    (_tenant_id, 'Consumables', 'Tape & Adhesive', 'Tape, 2-way (2" x 60'')', 'Roll', 46.0, 44),
    (_tenant_id, 'Consumables', 'Tape & Adhesive', 'Adhesive, Spray', 'Can', 25.0, 45),
    (_tenant_id, 'Consumables', 'Tape & Adhesive', 'Tape, Painters - Blue/Red (2" x 60yd)', 'Roll', 18.0, 46),
    (_tenant_id, 'Consumables', 'PPE', 'Protective Suits (Tyvek)', 'Each', 28.0, 47),
    (_tenant_id, 'Consumables', 'PPE', 'Respirator, N95', 'Each', 6.0, 48),
    (_tenant_id, 'Consumables', 'PPE', 'Respirator, P100', 'Each', 18.0, 49),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Respirator, HEPA + Particulate Replacement Filter', 'Each', 44.0, 50),
    (_tenant_id, 'Consumables', 'Filters & Ducting', 'Respirator, HEPA Replacement Pancake Filter', 'Each', 16.5, 51),
    (_tenant_id, 'Consumables', 'Cleaners & Disinfectants', 'Encapsulant, Antimicrobial (Bioesque)', 'Gallon', 110.0, 52),
    (_tenant_id, 'Consumables', 'Containment', 'Zipper (Containment)', 'Each', 24.0, 53),
    (_tenant_id, 'Consumables', 'Containment', 'Zip Poles, Set of 4', 'Each', 33.0, 54),
    (_tenant_id, 'Equipment', 'Dumpsters & Trailers', 'Dumpster, 20 yd (max weight 4 Tons)', 'Per Load', 666.0, 55),
    (_tenant_id, 'Equipment', 'Dumpsters & Trailers', 'Dumpster, 30 yd (max weight 6 Tons)', 'Per Load', 847.0, 56),
    (_tenant_id, 'Equipment', 'Dumpsters & Trailers', 'Dumpster, 40 yd (max weight 8 Tons)', 'Per Load', 1029.0, 57),
    (_tenant_id, 'Equipment', 'Dumpsters & Trailers', 'Dump Trailer 5x10 (max weight 3.5 Tons)', 'Per Load', 495.0, 58);

  raise notice 'Seeded 58 rate catalog items for tenant %', _tenant_id;
end;
$$ language plpgsql;

-- ============================================================================
-- Auto-seed for any existing tenants that don't have catalog rows yet.
-- Useful when running this migration on an existing database.
-- ============================================================================
do $$
declare
  t record;
begin
  for t in select id from tenants loop
    perform seed_rate_catalog(t.id);
  end loop;
end $$;
