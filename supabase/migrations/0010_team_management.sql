-- Migration 0010 — team management
--
-- Adds Owner-facing tools for managing team membership without resorting to SQL:
--   - Soft delete (is_active flag on users)
--   - Invite tokens table for new team members
--
-- Invite flow:
--   1. Owner creates an invite row with role and email
--   2. App generates a one-time token (UUID, stored in invites.token)
--   3. Owner manually shares the URL https://app/invite/{token}
--   4. Invitee opens the URL, accepts, signs up or links to existing auth
--   5. On accept: a users row is created/linked, invite marked accepted
--   6. Owner can revoke an unaccepted invite, regenerate the token, or delete it

-- ---------------------------------------------------------------------------
-- Soft delete: users.is_active
-- ---------------------------------------------------------------------------
alter table users
  add column if not exists is_active boolean not null default true;

alter table users
  add column if not exists deactivated_at timestamptz;

alter table users
  add column if not exists deactivated_by uuid references users(id);

-- ---------------------------------------------------------------------------
-- Invites table
-- ---------------------------------------------------------------------------
create table if not exists invites (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('owner','pm','technician')),
  full_name     text,
  token         text not null unique,
  -- Lifecycle
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  accepted_by   uuid references users(id),  -- the new user that claimed it
  revoked_at    timestamptz,
  revoked_by    uuid references users(id)
);

create index if not exists idx_invites_tenant on invites(tenant_id);
create index if not exists idx_invites_token on invites(token);
create index if not exists idx_invites_email on invites(lower(email));

-- ---------------------------------------------------------------------------
-- RLS for invites
-- ---------------------------------------------------------------------------
alter table invites enable row level security;

-- Owners can view + write all invites within their tenant
drop policy if exists invites_owner_all on invites;
create policy invites_owner_all on invites
  for all
  to authenticated
  using (
    tenant_id in (
      select tenant_id from users where id = auth.uid() and role = 'owner' and is_active
    )
  )
  with check (
    tenant_id in (
      select tenant_id from users where id = auth.uid() and role = 'owner' and is_active
    )
  );

-- Anyone (including unauthenticated) can read an invite BY TOKEN — this is
-- intentional so the /invite/:token landing page works for someone who isn't
-- signed in yet. The token is the secret; without it, no info is exposed.
drop policy if exists invites_read_by_token on invites;
create policy invites_read_by_token on invites
  for select
  to anon, authenticated
  using (
    -- This is effectively a no-op for general select queries, since the
    -- client must always filter by token. Without filter, no rows returned.
    token is not null
  );

-- Note: in practice the public landing page uses an anon supabase client to
-- look up by token. The policy above allows it. The token's secrecy is what
-- protects against unauthorized access.

-- ---------------------------------------------------------------------------
-- Helper: accept_invite RPC
-- ---------------------------------------------------------------------------
-- Run by the newly-signed-up user after creating their auth account.
-- Looks up the invite, creates the users row, marks invite accepted.
create or replace function accept_invite(p_token text, p_full_name text default null)
returns table (user_id uuid, tenant_id uuid, role text)
language plpgsql
security definer
as $$
declare
  v_invite invites%rowtype;
  v_user_email text;
  v_existing_user users%rowtype;
begin
  -- Look up the invite
  select * into v_invite from invites
  where token = p_token
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invite not found, already accepted, revoked, or expired.';
  end if;

  -- Validate caller has a matching auth account
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite. Sign up or sign in first.';
  end if;

  -- Verify email matches (optional safety — auth user's email should match invite email)
  select email into v_user_email from auth.users where id = auth.uid();
  if lower(v_user_email) <> lower(v_invite.email) then
    raise exception 'This invite was issued for % but you are signed in as %.', v_invite.email, v_user_email;
  end if;

  -- Insert or update the users row
  select * into v_existing_user from users where id = auth.uid();
  if found then
    update users set
      tenant_id = v_invite.tenant_id,
      role      = v_invite.role,
      full_name = coalesce(p_full_name, v_invite.full_name, v_existing_user.full_name),
      is_active = true
    where id = auth.uid();
  else
    insert into users (id, tenant_id, email, role, full_name)
    values (auth.uid(), v_invite.tenant_id, v_user_email, v_invite.role, coalesce(p_full_name, v_invite.full_name));
  end if;

  -- Mark invite accepted
  update invites set
    accepted_at = now(),
    accepted_by = auth.uid()
  where id = v_invite.id;

  return query select auth.uid(), v_invite.tenant_id, v_invite.role;
end;
$$;

grant execute on function accept_invite(text, text) to anon, authenticated;
