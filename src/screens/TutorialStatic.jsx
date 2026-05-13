import { Link, useParams } from 'react-router-dom'
import {
  Header, Button, Card, CardHeader, CardBody, CardTitle, Badge,
} from '../ui'
import { BASICS_TOUR } from '../tours/basicsTour'
import { WATER_MIT_TOUR } from '../tours/waterMitTour'
import { SCREENING_TOUR } from '../tours/screeningTour'
import { ESTIMATE_TOUR } from '../tours/estimateTour'

const TOURS = {
  basics:    { title: '🧭 App basics',            tour: BASICS_TOUR },
  watermit:  { title: '💧 Water mitigation job',  tour: WATER_MIT_TOUR },
  screening: { title: '🐕 Mold screening job',    tour: SCREENING_TOUR },
  estimate:  { title: '📋 Building an estimate',  tour: ESTIMATE_TOUR },
}

/**
 * TutorialStatic — non-interactive walkthrough viewer.
 *
 * Reads the same step definitions that drive the interactive tours and
 * renders them as a numbered list with each step's title and explainer.
 * Perfect for phone screens where interactive overlay tours fight with the
 * mobile keyboard for screen space.
 */
export default function TutorialStatic() {
  const { tourId } = useParams()
  const config = TOURS[tourId]

  if (!config) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Tutorial', to: '/tutorial' },
          { label: 'Walkthrough' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6">
          <Card>
            <CardBody>
              <p className="text-sm text-ink-700">Tutorial not found.</p>
              <div className="mt-3">
                <Link to="/tutorial"><Button variant="secondary">← Back to Tutorials</Button></Link>
              </div>
            </CardBody>
          </Card>
        </main>
      </div>
    )
  }

  const steps = config.tour

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Tutorial', to: '/tutorial' },
        { label: config.title },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        <Card accent="yellow">
          <CardHeader>
            <CardTitle>{config.title}</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Read through each step at your own pace. Bookmark this page on your phone if you want
              to come back to it during a job.
            </p>
            <div className="mt-2">
              <Badge tone="blue">{steps.length} steps</Badge>
            </div>
          </CardHeader>
        </Card>

        <ol className="space-y-3">
          {steps.map((step, idx) => (
            <li key={step.id} className="bg-white border border-ink-200 border-l-[3px] border-l-brand-blue rounded-md p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-brand-blue text-white font-bold flex items-center justify-center text-sm">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-condensed font-bold text-brand-blue tracking-wide text-base leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-sm text-ink-700 mt-1.5 leading-relaxed">
                    {step.text}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex justify-between flex-wrap gap-2 mt-4">
          <Link to="/tutorial">
            <Button variant="secondary">← Back to Tutorials</Button>
          </Link>
          <Link to="/jobs">
            <Button variant="accent">Go try it in the app →</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
