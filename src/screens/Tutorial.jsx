import { useNavigate } from 'react-router-dom'
import {
  Header, Button, Card, CardHeader, CardBody, CardTitle, Badge,
} from '../ui'
import { startTour } from '../lib/tour'
import { BASICS_TOUR } from '../tours/basicsTour'
import { WATER_MIT_TOUR } from '../tours/waterMitTour'
import { SCREENING_TOUR } from '../tours/screeningTour'
import { ESTIMATE_TOUR } from '../tours/estimateTour'

/**
 * Tutorial — landing page that lets the user pick a guided tour.
 *
 * Each tour is an interactive walkthrough that overlays the actual app and
 * highlights elements as it teaches. Powered by Shepherd.js through the tour
 * engine at lib/tour.js.
 *
 * Tours available:
 *   - App basics — orientation for new users
 *   - Water mitigation job — full mit workflow
 *   - Mold screening job — full screening workflow
 *   - Building an estimate — NTE estimator + customer signature
 */
export default function Tutorial() {
  const navigate = useNavigate()

  function run(tour) {
    startTour(tour, { navigate })
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: 'Tutorial' }]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        <Card accent="yellow">
          <CardHeader>
            <CardTitle>Guided tutorials</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Pick a tour below and the app walks you through it step by step.
              Real interactive walkthroughs — you'll click real buttons and fill in
              real fields as you learn. You can skip out anytime.
            </p>
          </CardHeader>
        </Card>

        <TourTile
          title="🧭 App basics"
          description="Get oriented. Header, navigation, jobs list, settings — the 5-minute starter tour everyone should do first."
          duration="~5 min"
          steps={BASICS_TOUR.length}
          onStart={() => run(BASICS_TOUR)}
        />

        <TourTile
          title="💧 Water mitigation job"
          description="Complete workflow: create a job, add rooms, set up equipment, take moisture readings, monitor daily, generate the final report."
          duration="~15 min"
          steps={WATER_MIT_TOUR.length}
          onStart={() => run(WATER_MIT_TOUR)}
        />

        <TourTile
          title="🐕 Mold screening job"
          description="Spore's full workflow: intake, authorization signature, room walkthrough with alerts, sampling, AI recommendations, signed report."
          duration="~12 min"
          steps={SCREENING_TOUR.length}
          onStart={() => run(SCREENING_TOUR)}
        />

        <TourTile
          title="📋 Building an estimate"
          description="NTE estimate workflow: pick line items, calculate totals, get customer signature, generate the branded PDF."
          duration="~8 min"
          steps={ESTIMATE_TOUR.length}
          onStart={() => run(ESTIMATE_TOUR)}
        />

        <Card>
          <CardBody>
            <p className="text-xs text-ink-600">
              <strong>Tip:</strong> These tours work best on a desktop or tablet. On a phone,
              the tooltips can cover the elements they're highlighting. If a tour gets confusing,
              tap the X to exit and try it from a larger screen.
            </p>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}

function TourTile({ title, description, duration, steps, onStart }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h3 className="font-condensed font-bold text-lg text-brand-blue tracking-wide">{title}</h3>
          <p className="text-sm text-ink-600 mt-1">{description}</p>
          <div className="flex gap-2 mt-2">
            <Badge tone="neutral">{duration}</Badge>
            <Badge tone="blue">{steps} steps</Badge>
          </div>
        </div>
        <Button onClick={onStart} variant="accent">Start tour</Button>
      </CardBody>
    </Card>
  )
}
