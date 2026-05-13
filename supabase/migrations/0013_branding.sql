-- Migration 0013 — branding settings + logo storage bucket  (FIXED)
--
-- Adds a 'branding' setting_type to the existing per-tenant settings table.
-- Stores: company name, phone, email, address, tagline, logo path, and a
-- color palette (5 colors).
--
-- Logos uploaded by the Owner are stored in a new storage bucket
-- 'branding-assets' scoped by tenant_id.

-- ---------------------------------------------------------------------------
-- Seed default branding for the active tenant if not already set
-- ---------------------------------------------------------------------------
insert into settings (tenant_id, setting_type, data)
select id, 'branding', jsonb_build_object(
  'company_name', '1-800 WATER DAMAGE of North Dakota',
  'phone',        '701-840-3336',
  'email',        'jason.phillips@1800waterdamage.com',
  'address',      '929 6th Ave NE, Valley City, ND 58072',
  'tagline',      'Restoring What Matters Most!',
  'logo_path',    null,
  'colors', jsonb_build_object(
    'primary',       '#0061AF',
    'primary_dark',  '#004A85',
    'primary_light', '#3389C7',
    'accent',        '#FFF200',
    'accent_dark',   '#E6D900'
  )
)
from tenants
where not exists (
  select 1 from settings s
  where s.tenant_id = tenants.id
    and s.setting_type = 'branding'
)
on conflict (tenant_id, setting_type) do nothing;

-- ---------------------------------------------------------------------------
-- Storage bucket for branding assets (logos)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding-assets', 'branding-assets', false)
on conflict (id) do nothing;

-- RLS policies on storage.objects
-- The users table uses id = auth.uid() directly (no separate auth_user_id col).
-- Path convention: {tenant_id}/logo.{ext}

drop policy if exists "Owners can manage branding assets" on storage.objects;
create policy "Owners can manage branding assets"
on storage.objects for all
to authenticated
using (
  bucket_id = 'branding-assets'
  and exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'owner'
      and split_part(storage.objects.name, '/', 1) = users.tenant_id::text
  )
)
with check (
  bucket_id = 'branding-assets'
  and exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'owner'
      and split_part(storage.objects.name, '/', 1) = users.tenant_id::text
  )
);

drop policy if exists "Tenant members can read branding assets" on storage.objects;
create policy "Tenant members can read branding assets"
on storage.objects for select
to authenticated
using (
  bucket_id = 'branding-assets'
  and exists (
    select 1 from users
    where users.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = users.tenant_id::text
  )
);
