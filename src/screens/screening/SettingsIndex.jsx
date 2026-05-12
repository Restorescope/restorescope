import { Link } from 'react-router-dom'
import { Header, Section, Card, Badge } from '../../ui'

/**
 * SettingsIndex — landing page for all Owner settings. Each tile links to a
 * dedicated settings screen. Phase 1 only ships a few; the rest are stubbed
 * "Coming next" so the structure exists.
 */
export default function SettingsIndex() {
  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: 'Settings' }]} />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 space-y-5">

        <Section
          title="Settings"
          description="Tune the app to match how 1-800 WATER DAMAGE of North Dakota actually works in the field."
        >
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Tile to="/settings/drying-goals" title="Drying goals" hint="Per-material targets for readings" ready />
            <Tile to="/settings/rooms"     title="Rooms"          hint="Customize the room dropdown" ready />
            <Tile to="/settings/materials" title="Materials"     hint="Customize the material chips" ready />
            <Tile to="/settings/meters"    title="Meters"        hint="Available meter types and their units" ready />
            <Tile to="/settings/equipment" title="Equipment"     hint="Equipment types in the dropdown" ready />
            <Tile to="/settings/loss-sources" title="Loss sources" hint="Source-of-loss dropdown options" ready />
            <Tile to="/settings/scope-library" title="Scope library" hint="Scope items + reason templates" ready />
            <Tile to="/settings/qc-rules"  title="QC rules"      hint="Block / Warn / Off per finalize check" ready />
            <Tile to="/settings/rate-catalog" title="Rate catalog" hint="NTE Estimator priced line items" ready />
            <Tile to="/settings/screening-recommendations" title="Screening recommendations" hint="Quick-picks for mold screening reports" ready />
            <Tile to="/settings/spore-handler-profile" title="Spore & Handler profile" hint="Credentials shown on screening reports" ready />
            <Tile to="/settings/team"      title="Team"          hint="Invite PMs and Technicians" ready />
            <Tile to="/settings/branding"  title="Branding"      hint="Report header, footer, colors" />
          </ul>
        </Section>
      </main>
    </div>
  )
}

function Tile({ to, title, hint, ready = false }) {
  return (
    <li>
      <Link
        to={to}
        className="block bg-white rounded-lg border border-ink-200/60 p-4 shadow-card hover:shadow-card-hover transition-shadow h-full"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ink-900">{title}</h3>
            <p className="text-xs text-ink-500 mt-0.5">{hint}</p>
          </div>
          {ready ? <Badge tone="green">Ready</Badge> : <Badge tone="neutral">Soon</Badge>}
        </div>
      </Link>
    </li>
  )
}
