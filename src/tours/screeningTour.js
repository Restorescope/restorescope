/**
 * SCREENING_TOUR — interactive walkthrough of the canine mold screening
 * workflow with Spore.
 *
 * Starts from a job that has screening enabled. Walks through:
 *   1. Intake & Authorization (customer signs)
 *   2. Walkthrough (Spore's alerts room by room)
 *   3. Sampling (optional lab samples)
 *   4. Recommendations (quick-picks + AI)
 *   5. Generate Report (branded PDF)
 *
 * Like the water mit tour, this is interactive — the user actually creates
 * the data, the tour explains each step and points at the right buttons.
 */
export const SCREENING_TOUR = [
  // -----------------------------------------------------------------------
  // INTRO + JOB SETUP
  // -----------------------------------------------------------------------
  {
    id: 'sc-intro',
    title: 'Mold screening with Spore',
    text: "This tour walks through a complete canine mold screening from intake to delivered report. You'll work with a real job. About 12 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'sc-create-or-pick',
    title: 'Use a job with screening enabled',
    text: "If you don't already have one, create a new job with 'Mold screening only' or 'Combo' selected as the job type. Then open that job and tap the \"Mold Screening\" tile on the dashboard to start the workflow.",
    waitForElement: 'main',
  },

  // -----------------------------------------------------------------------
  // SCREENING DASHBOARD
  // -----------------------------------------------------------------------
  {
    id: 'sc-dashboard',
    title: 'Screening dashboard',
    text: "Five step tiles cover the full workflow. Each tile shows status — what's done, what's pending. Steps don't have to be done in order, but the customer needs to sign the authorization before you start the walkthrough.",
    waitForElement: 'a[href*="/screening/authorization"]',
  },

  // -----------------------------------------------------------------------
  // 1. INTAKE & AUTHORIZATION
  // -----------------------------------------------------------------------
  {
    id: 'sc-auth-tile',
    title: 'Step 1: Intake & Authorization',
    text: "Tap \"1. Intake & Authorization\". This captures the reason for screening, customer concerns, property history, scope, and the customer's signed acknowledgment.",
    attachTo: { element: 'a[href*="/screening/authorization"]', on: 'bottom' },
  },
  {
    id: 'sc-auth-intake',
    title: 'Intake fields',
    text: "Fill in why the customer requested screening, any concerns they've raised, what you know about the property history, and the scope of the inspection. These appear in the final report.",
    waitForElement: 'main',
  },
  {
    id: 'sc-auth-form',
    title: 'Authorization & signature',
    text: 'Scroll down to the authorization form. Customer reads the 7 acknowledgment bullets, checks the box, types their printed name, and signs on the signature pad. Once signed the job is cleared to proceed.',
    waitForElement: 'main',
  },
  {
    id: 'sc-back-to-screening-1',
    title: 'Back to screening dashboard',
    text: "Once the customer has signed, navigate back to the screening dashboard (tap \"Screening\" in the breadcrumb at the top). Click Next when you're back.",
  },

  // -----------------------------------------------------------------------
  // 2. PROPERTY HISTORY
  // -----------------------------------------------------------------------
  {
    id: 'sc-property-history-tile',
    title: 'Step 2: Property History',
    text: "Tap \"2. Property History\". Document what you know about the property — prior water damage, structural issues, system concerns. This context goes into the screening report AND helps the AI recommendation engine give smarter suggestions.",
    attachTo: { element: 'a[href*="/screening/property-history"]', on: 'bottom' },
  },
  {
    id: 'sc-property-history-screen',
    title: 'Filling out property history',
    text: "Year built, construction type, then check each issue category that applies (prior water damage, roofing, foundation, HVAC, etc.). When you check a box, a notes field appears for specifics. Anything that doesn't fit goes in 'Other observations'. Save when done, then navigate back.",
    waitForElement: 'main',
  },
  {
    id: 'sc-back-to-screening-2',
    title: 'Back to screening dashboard',
    text: 'Once property history is saved, head back to the screening dashboard.',
  },

  // -----------------------------------------------------------------------
  // 3. WALKTHROUGH
  // -----------------------------------------------------------------------
  {
    id: 'sc-walkthrough-tile',
    title: 'Step 3: Walkthrough with Spore',
    text: "Tap \"3. Walkthrough\". This is where you record Spore's alerts room by room as you walk the property.",
    attachTo: { element: 'a[href*="/screening/walkthrough"]', on: 'bottom' },
  },
  {
    id: 'sc-walkthrough-screen',
    title: 'Recording alerts',
    text: 'Tap "+ Record alert" for each alert. Pick or create a room, classify the alert strength (strong/moderate/weak/negative), describe the location, and capture optional moisture/thermal/wall cavity readings.',
    waitForElement: 'main',
  },
  {
    id: 'sc-walkthrough-photos',
    title: 'Photos on each alert',
    text: 'Each alert card has its own photo uploader. Take photos of the alert location, visible signs, thermal images, and sample collection. Photos auto-appear in the report grouped by room.',
    waitForElement: 'main',
  },
  {
    id: 'sc-back-to-screening-3',
    title: 'Back to screening dashboard',
    text: 'Once alerts are documented, head back to the screening dashboard.',
  },

  // -----------------------------------------------------------------------
  // 4. SAMPLING (optional)
  // -----------------------------------------------------------------------
  {
    id: 'sc-samples-tile',
    title: 'Step 4: Sampling (optional)',
    text: "Tap \"4. Sampling\" if you collected lab samples. Track sample type (air, surface tape, swab, bulk, wall cavity air, outdoor control), lab info, chain of custody, and results when they come back.",
    attachTo: { element: 'a[href*="/screening/samples"]', on: 'bottom' },
  },
  {
    id: 'sc-samples-screen',
    title: 'Logging samples',
    text: 'Tap "+ Add sample". Auto-generated labels (AIR-01, TAPE-02) keep it organized. Lifecycle: Pending → Sent to lab → Received → Reviewed. Result summaries appear in the report.',
    waitForElement: 'main',
  },
  {
    id: 'sc-back-to-screening-4',
    title: 'Back to screening dashboard',
    text: 'When samples are logged (or if you skipped sampling), head back.',
  },

  // -----------------------------------------------------------------------
  // 4. RECOMMENDATIONS
  // -----------------------------------------------------------------------
  {
    id: 'sc-recs-tile',
    title: 'Step 5: Recommendations',
    text: 'Tap "5. Recommendations". This is where the inspector\'s professional recommendations go — what the customer should do based on findings.',
    attachTo: { element: 'a[href*="/screening/recommendations"]', on: 'bottom' },
  },
  {
    id: 'sc-recs-text',
    title: 'The recommendations editor',
    text: "Big text editor at the top. One recommendation per line. You'll fill this either by tapping quick-picks (below), generating with AI, or typing manually. All three can mix.",
    waitForElement: 'main',
  },
  {
    id: 'sc-recs-ai',
    title: '✨ AI generation',
    text: "The \"Generate with AI\" button calls Claude with your screening data and drafts IICRC-aligned recommendations in plain language. Takes 3-8 seconds. Review the output, edit if needed, save. AI doesn't interpret moisture readings — that's your call.",
    waitForElement: 'main',
  },
  {
    id: 'sc-recs-quickpicks',
    title: 'Quick-pick library',
    text: 'Below the editor, 20+ standard recommendations grouped by category (Sampling, Source, Remediation, Health, Clearance). Tap any to append to the editor. Items with {{room}} prompt for a room when applied.',
    waitForElement: 'main',
  },
  {
    id: 'sc-back-to-screening-5',
    title: 'Back to screening dashboard',
    text: 'Save the recommendations, head back to the dashboard for the final step.',
  },

  // -----------------------------------------------------------------------
  // 5. REPORT
  // -----------------------------------------------------------------------
  {
    id: 'sc-report-tile',
    title: 'Step 6: Generate the report',
    text: 'Tap "6. Generate Report" to create the branded PDF. Includes cover with Spore feature, intake summary, room-by-room findings, photo log, lab samples, recommendations, Spore credential page, your handler credential page, signed authorization, and IICRC disclaimer.',
    attachTo: { element: 'a[href*="/screening/report"]', on: 'bottom' },
  },
  {
    id: 'sc-report-screen',
    title: 'Generate & download',
    text: 'Pre-flight warnings show anything missing (unsigned authorization, no alerts, etc.). Tap "Generate & download PDF" — the PDF downloads to your device AND is archived to the reports bucket for your records.',
    waitForElement: 'main',
  },

  // -----------------------------------------------------------------------
  // DONE
  // -----------------------------------------------------------------------
  {
    id: 'sc-done',
    title: "That's a mold screening",
    text: "Five steps: authorization → walkthrough → samples → recommendations → report. The report is your deliverable — send it to the customer (and copy to the realtor for the Realtor Rewards Program if applicable). For real-world screenings, you can pause anywhere in the workflow and come back to the same job dashboard later.",
    showBack: true,
  },
]
