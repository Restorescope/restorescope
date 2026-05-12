import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import {
  Header, Button, Card, CardHeader, CardBody, CardTitle, Input, Badge,
} from '../ui'

/**
 * AcceptInvite — landing page for /invite/:token
 *
 * Flow:
 *   1. Anonymous user opens the link
 *   2. App fetches the invite by token (must be unaccepted, unrevoked, unexpired)
 *   3. Show invite info: who invited, what role
 *   4. Two paths:
 *      a. New user: sign up with the invite's email + password → calls accept_invite RPC
 *      b. Existing user (matching email): sign in → calls accept_invite RPC
 *   5. On success, redirect to /jobs
 *
 * Security model:
 *   - Token is the secret (long, randomly generated, single-use)
 *   - accept_invite() RPC enforces: token valid, not expired, signed-in user's email matches invite's email
 */
export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { session, refreshProfile } = useAuth()

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('choose') // 'choose' | 'signup' | 'signin'
  const [form, setForm] = useState({ password: '', confirm: '', full_name: '' })
  const [submitting, setSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // Load invite by token
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const { data, error: err } = await supabase
        .from('invites')
        .select('id, email, role, full_name, expires_at, accepted_at, revoked_at')
        .eq('token', token)
        .maybeSingle()
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }
      if (!data) {
        setError("This invite link doesn't exist or has been deleted.")
        setLoading(false); return
      }
      if (data.accepted_at) {
        setError('This invite has already been accepted.')
        setLoading(false); return
      }
      if (data.revoked_at) {
        setError('This invite has been revoked. Contact the person who invited you for a new link.')
        setLoading(false); return
      }
      if (new Date(data.expires_at) <= new Date()) {
        setError('This invite has expired. Contact the person who invited you for a new link.')
        setLoading(false); return
      }
      setInvite(data)
      setForm((f) => ({ ...f, full_name: data.full_name || '' }))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [token])

  async function callAcceptRPC() {
    const { data, error: err } = await supabase.rpc('accept_invite', {
      p_token: token,
      p_full_name: form.full_name.trim() || null,
    })
    if (err) throw err
    if (!data || data.length === 0) throw new Error('Invite acceptance did not return a result.')
    return data[0]
  }

  async function signUpAndAccept() {
    if (!form.password || form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    setError(null); setSubmitting(true)
    try {
      const { data: signUpRes, error: signUpErr } = await supabase.auth.signUp({
        email: invite.email,
        password: form.password,
      })
      if (signUpErr) throw signUpErr
      if (!signUpRes.session) {
        // Email confirmation required — set up a polling-friendly flow
        setError('Account created. Check your email to confirm, then return to this link to finish.')
        setSubmitting(false); return
      }
      // Session is live, call the RPC
      await callAcceptRPC()
      await refreshProfile()
      setAccepted(true)
      setTimeout(() => navigate('/jobs'), 1500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function signInAndAccept() {
    if (!form.password) { setError('Password is required.'); return }
    setError(null); setSubmitting(true)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password: form.password,
      })
      if (signInErr) throw signInErr
      await callAcceptRPC()
      await refreshProfile()
      setAccepted(true)
      setTimeout(() => navigate('/jobs'), 1500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function acceptWhileSignedIn() {
    setError(null); setSubmitting(true)
    try {
      await callAcceptRPC()
      await refreshProfile()
      setAccepted(true)
      setTimeout(() => navigate('/jobs'), 1500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: "Accept invite" }]} />
        <main className="max-w-md mx-auto p-4 sm:p-6 text-ink-500">Loading invite…</main>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: "Accept invite" }]} />
        <main className="max-w-md mx-auto p-4 sm:p-6 space-y-3">
          <Card>
            <CardHeader><CardTitle>Invite issue</CardTitle></CardHeader>
            <CardBody>
              <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
              <div className="mt-3">
                <Link to="/"><Button variant="secondary">← Go home</Button></Link>
              </div>
            </CardBody>
          </Card>
        </main>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[{ label: "Accept invite" }]} />
        <main className="max-w-md mx-auto p-4 sm:p-6">
          <Card accent="yellow">
            <CardHeader><CardTitle>Welcome aboard!</CardTitle></CardHeader>
            <CardBody>
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                You're in. Redirecting you to the jobs list…
              </div>
            </CardBody>
          </Card>
        </main>
      </div>
    )
  }

  // Currently signed in as someone else?
  const wrongUser = session && session.user.email && invite.email && session.user.email.toLowerCase() !== invite.email.toLowerCase()

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: "Accept invite" }]} />
      <main className="max-w-md mx-auto p-4 sm:p-6 space-y-4">
        <Card accent="blue">
          <CardHeader>
            <CardTitle>You've been invited to 1-800 WATER DAMAGE</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="bg-ink-50 border border-ink-200 rounded p-3 text-sm space-y-1">
              <p><strong>Email:</strong> {invite.email}</p>
              <p><strong>Role:</strong> <Badge tone="blue">{labelRole(invite.role)}</Badge></p>
            </div>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
            )}

            {wrongUser && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
                You're signed in as <strong>{session.user.email}</strong>, but this invite was sent to <strong>{invite.email}</strong>.
                <div className="mt-2">
                  <Button size="sm" variant="secondary" onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}>
                    Sign out
                  </Button>
                </div>
              </div>
            )}

            {!wrongUser && session && (
              <>
                <p className="text-sm text-ink-700">
                  You're already signed in. Click below to claim this invite and join the team.
                </p>
                <Button onClick={acceptWhileSignedIn} loading={submitting}>
                  Accept invite as {session.user.email}
                </Button>
              </>
            )}

            {!session && mode === 'choose' && (
              <>
                <p className="text-sm text-ink-700">Are you a new user, or do you already have an account?</p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setMode('signup')}>New — create an account</Button>
                  <Button onClick={() => setMode('signin')} variant="secondary">I already have an account</Button>
                </div>
              </>
            )}

            {!session && mode === 'signup' && (
              <div className="space-y-3">
                <Input
                  label="Full name"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
                <Input
                  label="Password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  hint="At least 8 characters"
                />
                <Input
                  label="Confirm password"
                  type="password"
                  required
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={signUpAndAccept} loading={submitting}>Create account &amp; join</Button>
                  <Button variant="ghost" onClick={() => setMode('choose')}>Back</Button>
                </div>
              </div>
            )}

            {!session && mode === 'signin' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-600">Signing in as <strong>{invite.email}</strong></p>
                <Input
                  label="Password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={signInAndAccept} loading={submitting}>Sign in &amp; join</Button>
                  <Button variant="ghost" onClick={() => setMode('choose')}>Back</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </main>
    </div>
  )
}

function labelRole(r) {
  return { owner: 'Owner', pm: 'Project Manager', technician: 'Technician' }[r] || r
}
