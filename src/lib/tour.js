/**
 * tour.js — Shepherd.js wrapper used by all tutorial tours.
 *
 * Why a wrapper:
 *   - Centralizes brand styling (blue/yellow tooltips, brand-aligned buttons)
 *   - Adds React Router awareness — tours can navigate between pages and wait
 *     for the next screen to mount before continuing
 *   - Handles cleanup so a tour doesn't leak overlays after route changes
 *
 * Typical usage:
 *   import { startTour } from './lib/tour'
 *   import { WATER_MIT_TOUR } from './tours/waterMitTour'
 *
 *   startTour(WATER_MIT_TOUR, { navigate })  // navigate from useNavigate()
 *
 * A tour is a plain array of step definitions:
 *   [{
 *     id: 'create-job',
 *     title: 'Create a new job',
 *     text: 'Every customer interaction starts with a job. Tap "+ New job".',
 *     attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
 *     showNext: true,
 *     showBack: true,
 *     navigateBefore: '/jobs',      // optional: navigate to this path before showing
 *     waitForElement: '[data-tour="..."]'  // optional: wait for selector to exist
 *   }, ...]
 */

import Shepherd from 'shepherd.js'
import 'shepherd.js/dist/css/shepherd.css'

// ---------------------------------------------------------------------------
// Brand-themed CSS classes (injected once)
// ---------------------------------------------------------------------------
let STYLES_INJECTED = false
function ensureStyles() {
  if (STYLES_INJECTED) return
  STYLES_INJECTED = true
  const style = document.createElement('style')
  style.textContent = `
    .shepherd-element.rs-tour {
      font-family: inherit;
      max-width: 360px;
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.25);
      border: 2px solid #FFF200;
    }
    .shepherd-element.rs-tour .shepherd-content {
      border-radius: 6px;
      overflow: hidden;
    }
    .shepherd-element.rs-tour .shepherd-header {
      background-color: #0061AF;
      padding: 12px 16px;
      border-bottom: 3px solid #FFF200;
    }
    .shepherd-element.rs-tour .shepherd-title {
      color: white;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .shepherd-element.rs-tour .shepherd-text {
      padding: 14px 16px;
      font-size: 14px;
      line-height: 1.5;
      color: #1E293B;
    }
    .shepherd-element.rs-tour .shepherd-footer {
      padding: 0 12px 12px;
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    .shepherd-element.rs-tour .shepherd-button {
      padding: 6px 14px;
      font-size: 13px;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background-color 0.15s, opacity 0.15s;
    }
    .shepherd-element.rs-tour .shepherd-button-primary {
      background-color: #0061AF;
      color: white;
    }
    .shepherd-element.rs-tour .shepherd-button-primary:hover {
      background-color: #004A85;
    }
    .shepherd-element.rs-tour .shepherd-button-secondary {
      background-color: #E2E8F0;
      color: #334155;
    }
    .shepherd-element.rs-tour .shepherd-button-secondary:hover {
      background-color: #CBD5E1;
    }
    .shepherd-element.rs-tour .shepherd-button-skip {
      background-color: transparent;
      color: #64748B;
      text-decoration: underline;
    }
    .shepherd-element.rs-tour .shepherd-cancel-icon {
      color: white;
      font-size: 18px;
      opacity: 0.7;
    }
    .shepherd-element.rs-tour .shepherd-cancel-icon:hover {
      opacity: 1;
    }
    .shepherd-modal-overlay-container {
      opacity: 0.55;
      fill: #0F172A;
      transition: opacity 0.2s;
    }
    /* Highlighted element glow */
    .shepherd-target {
      transition: outline 0.2s, box-shadow 0.2s;
    }
    .shepherd-target.shepherd-enabled {
      outline: 3px solid #FFF200 !important;
      outline-offset: 2px;
      border-radius: 4px;
      position: relative;
      z-index: 9999;
    }
    /* Step counter */
    .rs-tour-step-counter {
      font-size: 11px;
      color: #94A3B8;
      margin-right: auto;
      align-self: center;
      padding-left: 6px;
    }
  `
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Wait for an element to exist in the DOM (used when steps require navigation)
// ---------------------------------------------------------------------------
function waitForSelector(selector, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)

    const start = Date.now()
    const interval = setInterval(() => {
      const found = document.querySelector(selector)
      if (found) {
        clearInterval(interval)
        resolve(found)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        reject(new Error(`Timed out waiting for ${selector}`))
      }
    }, 80)
  })
}

// ---------------------------------------------------------------------------
// startTour(steps, { navigate, onComplete, onCancel })
// ---------------------------------------------------------------------------
let CURRENT_TOUR = null

export function startTour(steps, { navigate, onComplete, onCancel } = {}) {
  ensureStyles()

  // Cancel any in-progress tour
  if (CURRENT_TOUR) {
    try { CURRENT_TOUR.cancel() } catch (e) { /* ignore */ }
    CURRENT_TOUR = null
  }

  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      classes: 'rs-tour',
      scrollTo: { behavior: 'smooth', block: 'center' },
      cancelIcon: { enabled: true },
      modalOverlayOpeningPadding: 4,
      modalOverlayOpeningRadius: 4,
    },
  })

  steps.forEach((step, idx) => {
    const buttons = []

    if (idx > 0 && step.showBack !== false) {
      buttons.push({
        text: '← Back',
        classes: 'shepherd-button-secondary',
        action: () => tour.back(),
      })
    }

    if (idx < steps.length - 1) {
      buttons.push({
        text: step.nextLabel || 'Next →',
        classes: 'shepherd-button-primary',
        action: async () => {
          // If this step's "next" requires navigation, do it now
          if (step.navigateOnNext && navigate) {
            navigate(step.navigateOnNext)
          }
          tour.next()
        },
      })
    } else {
      buttons.push({
        text: step.completeLabel || 'Done',
        classes: 'shepherd-button-primary',
        action: () => tour.complete(),
      })
    }

    // "Skip tour" button always available
    if (step.showSkip !== false) {
      buttons.unshift({
        text: 'Skip',
        classes: 'shepherd-button-skip',
        action: () => tour.cancel(),
      })
    }

    tour.addStep({
      id: step.id,
      title: `${step.title}  ·  Step ${idx + 1} of ${steps.length}`,
      text: step.text,
      attachTo: step.attachTo || undefined,
      buttons,
      beforeShowPromise: async () => {
        // Navigate first if requested
        if (step.navigateBefore && navigate) {
          navigate(step.navigateBefore)
          // small delay for route to mount
          await new Promise((r) => setTimeout(r, 200))
        }
        // Wait for the target element if requested
        const waitSel = step.waitForElement || step.attachTo?.element
        if (waitSel) {
          try {
            await waitForSelector(waitSel, 6000)
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`[tour] couldn't find ${waitSel}, continuing anyway`)
          }
        }
      },
    })
  })

  tour.on('complete', () => {
    CURRENT_TOUR = null
    onComplete?.()
  })
  tour.on('cancel', () => {
    CURRENT_TOUR = null
    onCancel?.()
  })

  CURRENT_TOUR = tour
  tour.start()
  return tour
}

export function isTourActive() {
  return !!CURRENT_TOUR
}

export function cancelCurrentTour() {
  if (CURRENT_TOUR) {
    try { CURRENT_TOUR.cancel() } catch (e) { /* ignore */ }
    CURRENT_TOUR = null
  }
}
