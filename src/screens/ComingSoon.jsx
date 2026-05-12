import { Header, Section, EmptyState } from '../ui'

export default function ComingSoon({ title }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: title }]} />
      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <Section title={title}>
          <EmptyState
            title="Coming next"
            body="This screen is wired up in a later build step. The shell, routes, and shared UI are in place; the next step adds the data and form."
          />
        </Section>
      </main>
    </div>
  )
}
