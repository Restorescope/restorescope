-- Migration 0014 — voice notes for jobs
--
-- Adds a voice_notes table where techs can record audio clips and attach
-- them to a job, optionally with AI-transcribed text and extracted notes.
--
-- The audio file itself lives in storage bucket 'voice-notes' under
-- {tenant_id}/{job_id}/{voice_note_id}.{ext}
--
-- Lifecycle of a voice note:
--   1. Tech records → uploaded to storage → row created with status='draft'
--   2. Optional: AI transcription runs → transcript filled in, status='transcribed'
--   3. Optional: AI extraction runs → structured_data populated
--   4. Tech reviews and saves → status='reviewed'
--   5. Tech can delete anytime
--
-- Why structured_data is JSONB rather than columns: the fields we extract
-- depend on context (room/reading/scope notes might have different shapes).
-- Keeping it open lets us evolve the extraction prompt without schema changes.

create table if not exists voice_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  room_id       uuid references affected_rooms(id) on delete set null,

  -- Audio storage
  storage_path  text not null,            -- 'voice-notes:tenant/job/note.webm' style
  duration_sec  numeric,                  -- approx length, populated client-side
  mime_type     text,                     -- 'audio/webm', 'audio/mp4', etc.

  -- AI-extracted content
  transcript    text,                     -- raw text from speech-to-text
  structured_data jsonb,                  -- AI's parsed fields (open shape)
  ai_notes      text,                     -- human-readable summary

  -- Lifecycle
  status        text not null default 'draft'
                  check (status in ('draft', 'transcribed', 'reviewed', 'archived')),

  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_voice_notes_job on voice_notes(job_id);
create index if not exists idx_voice_notes_tenant on voice_notes(tenant_id);

-- Updated_at trigger (reuses the function from 0001)
create trigger trg_voice_notes_updated_at
  before update on voice_notes
  for each row execute function set_updated_at();

-- RLS — tenant-scoped, standard pattern
alter table voice_notes enable row level security;

drop policy if exists "Tenant members read voice_notes" on voice_notes;
create policy "Tenant members read voice_notes"
on voice_notes for select to authenticated
using (tenant_id = current_tenant_id());

drop policy if exists "Tenant members write voice_notes" on voice_notes;
create policy "Tenant members write voice_notes"
on voice_notes for all to authenticated
using (tenant_id = current_tenant_id())
with check (tenant_id = current_tenant_id());

-- Storage bucket for audio files
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

-- Tenant members can manage their own tenant's audio files.
-- Path convention: {tenant_id}/{job_id}/{voice_note_id}.{ext}

drop policy if exists "Tenant members manage voice notes" on storage.objects;
create policy "Tenant members manage voice notes"
on storage.objects for all to authenticated
using (
  bucket_id = 'voice-notes'
  and exists (
    select 1 from users
    where users.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = users.tenant_id::text
  )
)
with check (
  bucket_id = 'voice-notes'
  and exists (
    select 1 from users
    where users.id = auth.uid()
      and split_part(storage.objects.name, '/', 1) = users.tenant_id::text
  )
);
