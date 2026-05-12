import { NavLink } from 'react-router-dom'

/**
 * BottomNav — sticky section nav inside a single job, mobile only.
 *
 * Active state uses the brand blue. Pass jobId; items are fixed for Phase 1.
 */
export default function BottomNav({ jobId }) {
  const items = [
    { to: `/jobs/${jobId}`,            label: 'Job',       icon: IconHome },
    { to: `/jobs/${jobId}/rooms`,      label: 'Rooms',     icon: IconRooms },
    { to: `/jobs/${jobId}/readings`,   label: 'Readings',  icon: IconChart },
    { to: `/jobs/${jobId}/equipment`,  label: 'Equipment', icon: IconFan },
    { to: `/jobs/${jobId}/photos`,     label: 'Photos',    icon: IconCamera },
  ]

  return (
    <nav
      aria-label="Job sections"
      className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ink-200 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] pb-safe sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === `/jobs/${jobId}`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium ${
                  isActive ? 'text-brand-blue' : 'text-ink-500'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function IconHome(props) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-9z"/></svg>) }
function IconRooms(props) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>) }
function IconChart(props) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-7"/></svg>) }
function IconFan(props) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4-2-7-5-7 0 4 2 7 5 7zm0 4c0 4 2 7 5 7 0-4-2-7-5-7zm-2-2c-4 0-7 2-7 5 4 0 7-2 7-5zm4 0c4 0 7-2 7-5-4 0-7 2-7 5z"/></svg>) }
function IconCamera(props) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>) }
