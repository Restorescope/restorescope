-- Migration 0004 — paid status on jobs + drying goal lock on readings
--
-- Item 2: Owners can close out a finalized job by marking it paid.
--   Adds: jobs.paid_at (timestamp)
--   New status value: 'paid'
--
-- Item 4: Drying goal locks to the first reading per (room, material).
--   Adds: moisture_readings.goal_locked (boolean) — informational flag,
--   the actual lock logic lives in the app form which queries existing
--   readings before saving and copies the goal forward.

-- Add paid_at to jobs (nullable; only set when marked paid)
alter table jobs
  add column if not exists paid_at timestamptz;

-- Add goal_locked flag (default false; first reading per room+material is the
-- "originator" of the goal, all subsequent readings copy it)
alter table moisture_readings
  add column if not exists goal_locked boolean default false;

-- Index for fast lookup of the first reading per (room, material) when the
-- form needs to look up the existing locked goal
create index if not exists idx_moisture_readings_room_material
  on moisture_readings(job_id, room_id, material_key)
  where is_reference = false;
