import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Select, Badge, EmptyState,
} from '../../ui'

/**
 * SettingsTeam — Owner-facing screen to manage the team:
 *   - List current users (with role, active state)
 *   - Promote/demote (change role)
 *   - Deactivate / reactivate (soft delete)
 *   - View pending invites
 *   - Create new invite (manual link share)
 *   - Revoke invite / copy invite link
 *
 * Owner-only at the route level. Soft delete protects the last active Owner.
 */
export default function SettingsTeam() {
  const { profile, tenantId } = useAuth()
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'technician', full_name: '' })
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [newInviteLink, setNewInviteLink] = useState(null) // shows the freshly created link

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    const [usersRes, invitesRes] = await Promise.all([
      supabase.from('users')
        .select('id, email, role, full_name, is_active, deactivated_at, created_at')
        .eq('tenant_id', tenantId)
        .order('is_active', { ascending: false })
        .order('role'),
      supabase.from('invites')
        .select('id, email, role, full_name, token, created_at, expires_at, accepted_at, revoked_at, accepted_by')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    ])
    if (usersRes.error) setError(usersRes.error.message)
    else setUsers(usersRes.data || [])
    if (invitesRes.error) setError((e) => e || invitesRes.error.message)
    else setInvites(invitesRes.data || [])
    setLoading(false)
  }, [tenantId])

  useEffect(() => { if (tenantId) reload() }, [tenantId, reload])

  // -------------------------------------------------------------------------
  // Invite actions
  // -------------------------------------------------------------------------
  async function createInvite() {
    if (!inviteForm.email.trim()) {
      setError('Email is required.')
      return
    }
    setCreatingInvite(true); setError(null); setSuccess(null); setNewInviteLink(null)

    // Generate a UUID v4 client-side for the token (Supabase doesn't expose gen_random_uuid in JS)
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    // Doubled UUID for extra entropy — invite token shouldn't be guessable

    const { data, error: err } = await supabase
      .from('invites')
      .insert({
        tenant_id: tenantId,
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        full_name: inviteForm.full_name.trim() || null,
        token,
        created_by: profile.id,
      })
      .select('id, token')
      .single()

    setCreatingInvite(false)
    if (err) {
      setError(`Could not create invite: ${err.message}`)
      return
    }

    const link = `${window.location.origin}/invite/${data.token}`
    setNewInviteLink(link)
    setSuccess(`Invite created for ${inviteForm.email}. Copy the link below and share it with them.`)
    setInviteForm({ email: '', role: 'technician', full_name: '' })
    setShowInviteForm(false)
    reload()
  }

  async function revokeInvite(invite) {
    if (!confirm(`Revoke the invite for ${invite.email}?\n\nThey will no longer be able to accept it.`)) return
    setError(null); setSuccess(null)
    const { error: err } = await supabase
      .from('invites')
      .update({ revoked_at: new Date().toISOString(), revoked_by: profile.id })
      .eq('id', invite.id)
    if (err) { setError(err.message); return }
    setSuccess('Invite revoked.')
    reload()
  }

  async function deleteInvite(invite) {
    if (!confirm(`Permanently delete this invite record for ${invite.email}?`)) return
    setError(null); setSuccess(null)
    const { error: err } = await supabase.from('invites').delete().eq('id', invite.id)
    if (err) { setError(err.message); return }
    setSuccess('Invite deleted.')
    reload()
  }

  function copyLink(token) {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link).then(
      () => { setSuccess('Link copied to clipboard.'); setTimeout(() => setSuccess(null), 2000) },
      () => { setError('Could not copy automatically — please long-press to copy manually.') },
    )
  }

  // -------------------------------------------------------------------------
  // User actions
  // -------------------------------------------------------------------------
  async function changeRole(user, newRole) {
    if (user.id === profile.id && user.role === 'owner' && newRole !== 'owner') {
      // Don't let the only owner demote themselves
      const ownerCount = users.filter((u) => u.role === 'owner' && u.is_active && u.id !== user.id).length
      if (ownerCount === 0) {
        setError("You're the only active Owner — promote someone else first before changing your own role.")
        return
      }
    }
    if (!confirm(`Change ${user.full_name || user.email}'s role from ${user.role} to ${newRole}?`)) return
    setError(null); setSuccess(null)
    const { error: err } = await supabase.from('users').update({ role: newRole }).eq('id', user.id)
    if (err) { setError(err.message); return }
    setSuccess(`Role updated for ${user.full_name || user.email}.`)
    reload()
  }

  async function deactivateUser(user) {
    if (user.id === profile.id) {
      setError("You can't deactivate yourself.")
      return
    }
    if (user.role === 'owner') {
      const otherActiveOwners = users.filter((u) => u.role === 'owner' && u.is_active && u.id !== user.id).length
      if (otherActiveOwners === 0) {
        setError("Can't deactivate the last active Owner — promote another user to Owner first.")
        return
      }
    }
    if (!confirm(`Deactivate ${user.full_name || user.email}?\n\nThey won't be able to sign in, but their data history will be preserved.`)) return
    setError(null); setSuccess(null)
    const { error: err } = await supabase.from('users').update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: profile.id,
    }).eq('id', user.id)
    if (err) { setError(err.message); return }
    setSuccess(`${user.full_name || user.email} has been deactivated.`)
    reload()
  }

  async function reactivateUser(user) {
    if (!confirm(`Reactivate ${user.full_name || user.email}? They will be able to sign in again.`)) return
    setError(null); setSuccess(null)
    const { error: err } = await supabase.from('users').update({
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
    }).eq('id', user.id)
    if (err) { setError(err.message); return }
    setSuccess(`${user.full_name || user.email} has been reactivated.`)
    reload()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const activeUsers = users.filter((u) => u.is_active)
  const inactiveUsers = users.filter((u) => !u.is_active)
  const pendingInvites = invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date())
  const acceptedInvites = invites.filter((i) => i.accepted_at)
  const expiredOrRevokedInvites = invites.filter((i) => !i.accepted_at && (i.revoked_at || new Date(i.expires_at) <= new Date()))

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Team' },
      ]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
        )}
        {success && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">{success}</div>
        )}

        {newInviteLink && (
          <Card accent="yellow">
            <CardHeader>
              <CardTitle>Invite link ready — copy &amp; share</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-sm text-ink-700">
                Send this one-time link to the invitee by text, email, or however you prefer.
                The link expires in 14 days.
              </p>
              <div className="bg-ink-50 border border-ink-200 rounded p-3 font-mono text-xs break-all">
                {newInviteLink}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => {
                  navigator.clipboard.writeText(newInviteLink).then(() => setSuccess('Link copied!'))
                }}>Copy link</Button>
                <Button variant="ghost" onClick={() => setNewInviteLink(null)}>Done</Button>
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Team management</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Invite new team members, manage roles, and deactivate former staff.
              Deactivated users can't sign in, but their work history is preserved.
            </p>
          </CardHeader>
          <CardBody>
            <Button onClick={() => setShowInviteForm(!showInviteForm)} variant="accent">
              {showInviteForm ? 'Cancel invite' : '+ Invite new team member'}
            </Button>

            {showInviteForm && (
              <div className="bg-ink-50 border border-ink-200 rounded p-3 mt-3 space-y-3">
                <Input
                  label="Email"
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="newuser@example.com"
                />
                <Input
                  label="Full name (optional)"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Jane Doe"
                />
                <Select
                  label="Role"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
                  options={[
                    { key: 'technician', label: 'Technician — field-facing access' },
                    { key: 'pm',         label: 'Project Manager — full access except settings' },
                    { key: 'owner',      label: 'Owner — full access including settings, billing, team' },
                  ]}
                />
                <Button onClick={createInvite} loading={creatingInvite}>Create invite link</Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Active members */}
        <Section title={`Active team members (${activeUsers.length})`}>
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : activeUsers.length === 0 ? (
            <EmptyState title="No active members" body="Invite someone above to get started." />
          ) : (
            <ul className="space-y-2">
              {activeUsers.map((u) => (
                <li key={u.id} className="bg-white border border-ink-200 rounded p-3 flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-900">
                      {u.full_name || <em className="text-ink-500">no name set</em>}
                      {u.id === profile.id && <Badge tone="neutral" className="ml-2">You</Badge>}
                    </div>
                    <div className="text-xs text-ink-600">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      options={[
                        { key: 'technician', label: 'Technician' },
                        { key: 'pm',         label: 'Project Manager' },
                        { key: 'owner',      label: 'Owner' },
                      ]}
                    />
                    <Button size="sm" variant="ghost" onClick={() => deactivateUser(u)}>
                      Deactivate
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <Section title={`Pending invites (${pendingInvites.length})`}>
            <ul className="space-y-2">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="bg-white border border-ink-200 border-l-[3px] border-l-brand-yellow rounded p-3 flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-900">
                      {inv.full_name || inv.email}
                    </div>
                    <div className="text-xs text-ink-600">
                      {inv.email} · {labelRole(inv.role)} · expires {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button size="sm" onClick={() => copyLink(inv.token)}>Copy link</Button>
                    <Button size="sm" variant="ghost" onClick={() => revokeInvite(inv)}>Revoke</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Deactivated members */}
        {inactiveUsers.length > 0 && (
          <Section title={`Deactivated (${inactiveUsers.length})`}>
            <ul className="space-y-2">
              {inactiveUsers.map((u) => (
                <li key={u.id} className="bg-ink-50 border border-ink-200 rounded p-3 flex items-start gap-2 flex-wrap opacity-75">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-700">
                      {u.full_name || u.email}
                    </div>
                    <div className="text-xs text-ink-500">
                      {u.email} · was {labelRole(u.role)}{u.deactivated_at ? ` · deactivated ${new Date(u.deactivated_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => reactivateUser(u)}>
                    Reactivate
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* History — accepted/expired/revoked invites */}
        {(acceptedInvites.length > 0 || expiredOrRevokedInvites.length > 0) && (
          <Section title="Invite history">
            <ul className="space-y-1 text-xs text-ink-600">
              {acceptedInvites.map((i) => (
                <li key={i.id}>
                  ✓ {i.email} accepted on {new Date(i.accepted_at).toLocaleDateString()}
                </li>
              ))}
              {expiredOrRevokedInvites.map((i) => (
                <li key={i.id} className="flex items-center justify-between">
                  <span>
                    {i.revoked_at ? '✗ revoked' : '✗ expired'} — {i.email}
                  </span>
                  <button
                    onClick={() => deleteInvite(i)}
                    className="text-xs text-ink-500 hover:text-danger underline"
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </main>
    </div>
  )
}

function labelRole(r) {
  return { owner: 'Owner', pm: 'Project Manager', technician: 'Technician' }[r] || r
}
