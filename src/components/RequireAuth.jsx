import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

/**
 * RequireAuth — wraps protected routes. Redirects to /login when no profile,
 * preserving the attempted destination.
 *
 * Pass `roles` to limit to specific roles, e.g. <RequireAuth roles={['owner']}>.
 */
export default function RequireAuth({ children, roles }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Logged in but no tenant profile yet (rare — likely email-confirmation race)
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500 px-6 text-center">
        Setting up your account… If this takes more than a moment, sign out and sign back in.
      </div>
    )
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/jobs" replace />
  }

  return children
}
