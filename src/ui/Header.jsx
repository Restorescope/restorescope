import { Link, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../lib/auth.jsx'

/**
 * Header — uniform blue+yellow header on every authenticated screen.
 *
 * Visual structure (matches locked redesign):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [LOGO]  RESTORESCOPE                  Jason  [Owner]  Out  │   blue bg
 *   │         1-800 Water Damage of North Dakota                 │
 *   ├────────────────────────────────────────────────────────────┤   4px yellow strip
 *   │ Jobs / WD-2026-0042                                        │   breadcrumb (optional)
 *   └────────────────────────────────────────────────────────────┘
 *
 * Props:
 *   - breadcrumb  array of { label, to? }  — last item is the current page (no link)
 *
 * The previous `title` and `right` props are deprecated; use breadcrumb instead.
 * (Old screens passing `title` still work — it shows under the wordmark as the
 *  current breadcrumb item.)
 */
export default function Header({ breadcrumb, title, right }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  // Back-compat: old screens pass `title` — treat as a one-item breadcrumb
  const crumbs = breadcrumb ?? (title ? [{ label: title }] : null)

  return (
    <header className="sticky top-0 z-30">
      {/* Brand bar */}
      <div className="bg-brand-blue text-white shadow-card">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-3 sm:px-6 h-16">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <Logo size="md" />
            <span className="hidden sm:flex flex-col leading-tight">
              <span className="font-condensed font-bold text-xl tracking-wide">
                RESTORESCOPE
              </span>
              <span className="text-xs text-white/80">
                1-800 WATER DAMAGE of North Dakota
              </span>
            </span>
          </Link>

          <div className="flex-1" />

          {right}

          {profile && (
            <div className="flex items-center gap-2">
              <Link
                to="/tutorial"
                className="text-sm font-semibold px-3 h-9 rounded hover:bg-white/10 hidden sm:inline-flex items-center"
              >
                Tutorial
              </Link>
              {profile.role === 'owner' && (
                <Link
                  to="/settings"
                  data-tour="settings-link"
                  className="text-sm font-semibold px-3 h-9 rounded hover:bg-white/10 hidden sm:inline-flex items-center"
                >
                  Settings
                </Link>
              )}
              <span className="hidden md:inline-flex items-center gap-2 text-sm">
                <span className="text-white/95">{profile.full_name || profile.email}</span>
                <span className="text-[10px] uppercase tracking-wider bg-white/15 px-2 py-0.5 rounded font-semibold">
                  {profile.role}
                </span>
              </span>
              <button
                type="button"
                data-tour="signout-button"
                onClick={async () => { await signOut(); navigate('/login') }}
                className="text-sm font-semibold px-3 h-9 rounded hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Yellow strip */}
      <div className="bg-brand-yellow h-1" aria-hidden />

      {/* Breadcrumb (only when provided) */}
      {crumbs && crumbs.length > 0 && (
        <div className="bg-white border-b border-ink-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-10 flex items-center text-sm">
            <Breadcrumbs items={crumbs} />
          </div>
        </div>
      )}
    </header>
  )
}

function Breadcrumbs({ items }) {
  return (
    <ol className="flex items-center gap-1 min-w-0">
      {items.map((c, i) => {
        const isLast = i === items.length - 1
        return (
          <li key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-ink-300 px-1" aria-hidden>/</span>}
            {isLast || !c.to ? (
              <span className="text-ink-900 font-semibold truncate">{c.label}</span>
            ) : (
              <Link to={c.to} className="text-brand-blue hover:underline truncate">{c.label}</Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
