import { useEffect, useState } from 'react'
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
 * Two modes:
 *   - DESKTOP / TABLET (>= 768px wide): interactive Shepherd.js overlay tour
 *     that highlights real elements on the live app as the user walks through
 *     a real workflow.
 *
 *   - PHONE (< 768px wide): static reading mode. Each "tour" becomes a clean
 *     numbered list of step explanations. No overlay, no keyboard fights.
 *
 * Mode is detected on mount and on resize.
 */
export default function Tutorial() {
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function runInteractive(tour) {
    startTour(tour, { navigate })
  }

  function openStatic(tourId) {
    navigate(`/tutorial/read/${tourId}`)
  }

  function handleStart(tourId, tour) {
    if (isMobile) {
      openStatic(tourId)
    } else {
      runInteractive(tour)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[{ label: 'Tutorial' }]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        <Card accent="yellow">
          <CardHeader>
            <CardTitle>Guided tutorials</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              {isMobile ? (
                <>Pick a tutorial below and read through it step by step. Each tutorial is a clean
                  walkthrough of a real workflow in the app.</>
              ) : (
                <>Pick a tour below and the app walks you through it step by step.
                  Real interactive walkthroughs — you'll click real buttons and fill in
                  real fields as you learn. Skip anytime.</>
              )}
            </p>
          </CardHeader>
        </Card>

        {isMobile && (
          <Card>
            <CardBody>
              <p className="text-xs text-ink-700">
                📱 <strong>You're on a phone.</strong> Tutorials open in <em>reading mode</em> — a
                scrollable step-by-step guide. For the <strong>interactive overlay tutorial</strong> that
                highlights real buttons as it teaches, open this page on a tablet or desktop browser.
              </p>
            </CardBody>
          </Card>
        )}

        <TourTile
          title="🧭 App basics"
          description="Get oriented. Header, navigation, jobs list, settings — the 5-minute starter every new user should do first."
          duration="~5 min"
          steps={BASICS_TOUR.length}
          isMobile={isMobile}
          onStart={() => handleStart('basics', BASICS_TOUR)}
        />

        <TourTile
          title="💧 Water mitigation job"
          description="Complete workflow: create a job, add rooms, set up equipment, take moisture readings, monitor daily, generate the final report."
          duration="~15 min"
          steps={WATER_MIT_TOUR.length}
          isMobile={isMobile}
          onStart={() => handleStart('watermit', WATER_MIT_TOUR)}
        />

        <TourTile
          title="🐕 Mold screening job"
          description="Spore's full workflow: intake, authorization signature, room walkthrough with alerts, sampling, AI recommendations, signed report."
          duration="~12 min"
          steps={SCREENING_TOUR.length}
          isMobile={isMobile}
          onStart={() => handleStart('screening', SCREENING_TOUR)}
        />

        <TourTile
          title="📋 Building an estimate"
          description="NTE estimate workflow: pick line items, calculate totals, get customer signature, generate the branded PDF."
          duration="~8 min"
          steps={ESTIMATE_TOUR.length}
          isMobile={isMobile}
          onStart={() => handleStart('estimate', ESTIMATE_TOUR)}
        />
      </main>
    </div>
  )
}

function TourTile({ title, description, duration, steps, isMobile, onStart }) {
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
        <Button onClick={onStart} variant="accent">
          {isMobile ? 'Read tutorial' : 'Start tour'}
        </Button>
      </CardBody>
    </Card>
  )
}
