/**
 * ESTIMATE_TOUR — interactive walkthrough of the NTE Estimator.
 *
 * Walks the user through building an estimate from scratch: opening a job,
 * picking line items from the catalog, adjusting quantities and rates,
 * reviewing the total, getting the customer's signature, and generating
 * the branded NTE PDF.
 *
 * Starts at the jobs list (works regardless of where you launched the tour
 * from) and walks you through opening a job, getting to the estimates tile,
 * then into the editor.
 */
export const ESTIMATE_TOUR = [
  // -----------------------------------------------------------------------
  // INTRO + GETTING TO A JOB
  // -----------------------------------------------------------------------
  {
    id: 'est-intro',
    title: 'Building an NTE estimate',
    text: "This tour walks through building a Not-to-Exceed estimate for a customer — picking line items, totaling the job, getting the customer's signature, and generating the branded PDF. About 8 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'est-pick-job',
    title: 'Step 1: Open a job',
    text: "Tap any active job from the list. If you don't have one yet, create a new one with \"+ New job\" — the tour will pause while you do that. Click Next once you're on a job's dashboard.",
    waitForElement: 'main',
  },
  {
    id: 'est-find-estimates-tile',
    title: 'Step 2: Find the Estimates tile',
    text: "On the Job Dashboard you'll see a grid of section tiles. Look for \"Estimates\" — typically in the second row. Tap it.",
    attachTo: { element: 'a[href$="/estimates"]', on: 'bottom' },
    waitForElement: 'a[href$="/estimates"]',
  },

  // -----------------------------------------------------------------------
  // ESTIMATES LIST
  // -----------------------------------------------------------------------
  {
    id: 'est-estimates-list',
    title: "You're on the Estimates list",
    text: 'This page shows all estimates for this job. You can have multiple versions — useful when scope changes mid-job. Each version automatically supersedes the previous.',
    waitForElement: 'main',
  },
  {
    id: 'est-new-estimate-button',
    title: 'Step 3: Create a new estimate',
    text: 'Tap "+ New estimate". A blank draft is created and you\'re taken to the editor.',
    attachTo: { element: '[data-tour="new-estimate-button"]', on: 'bottom' },
    waitForElement: '[data-tour="new-estimate-button"]',
  },

  // -----------------------------------------------------------------------
  // EDITOR
  // -----------------------------------------------------------------------
  {
    id: 'est-tabs',
    title: 'Three tabs',
    text: 'The estimate editor has three tabs: Job Info (customer details, markup, tax, contingency), Build Estimate (catalog + lines), and Review (totals + acceptance language).',
    attachTo: { element: '[data-tour="estimate-tabs"]', on: 'bottom' },
    waitForElement: '[data-tour="estimate-tabs"]',
  },
  {
    id: 'est-job-info',
    title: 'Step 4: Job Info tab',
    text: 'Stay on the Job Info tab. Customer details auto-fill from the job. Set markup %, contingency %, and tax % — these apply to the line subtotal. Defaults are 0/0/0; adjust to your typical numbers.',
  },
  {
    id: 'est-build-tab',
    title: 'Step 5: Build Estimate tab',
    text: 'Tap "Build Estimate" at the top of the editor. This is where you pick line items from the rate catalog.',
    attachTo: { element: '[data-tour="estimate-tabs"]', on: 'bottom' },
  },
  {
    id: 'est-catalog',
    title: 'The rate catalog',
    text: '58 pre-seeded line items at 1-800 Water Damage 2026 national rates — labor, equipment days, consumables, mileage. Search by name or filter by category. Tap any item to add it to the estimate.',
    attachTo: { element: '[data-tour="estimate-catalog"]', on: 'right' },
    waitForElement: '[data-tour="estimate-catalog"]',
  },
  {
    id: 'est-lines',
    title: 'Estimate lines',
    text: 'Right side shows what you\'ve added. Each line has Quantity (techs / units) AND a second unit field (Hours, Days, Gallons, etc.) plus the rate. Total = qty × units × rate. So 4 techs × 8 hours × $68.50 = $2,192.',
    attachTo: { element: '[data-tour="estimate-lines"]', on: 'left' },
    waitForElement: '[data-tour="estimate-lines"]',
  },
  {
    id: 'est-add-items',
    title: 'Try adding 2-3 items',
    text: 'Add a few items — try "Technician hourly", "LGR dehumidifier day", "Air mover day". Adjust quantities and units to be realistic for a job. Total updates live.',
    waitForElement: '[data-tour="estimate-lines"]',
  },

  // -----------------------------------------------------------------------
  // REVIEW TAB
  // -----------------------------------------------------------------------
  {
    id: 'est-review',
    title: 'Step 6: Review tab',
    text: 'Tap "Review" at the top. Shows line subtotal, markup, contingency, tax, and the final Not-to-Exceed total. This is what the customer sees on the PDF cover.',
    attachTo: { element: '[data-tour="estimate-tabs"]', on: 'bottom' },
  },
  {
    id: 'est-totals-math',
    title: 'How the totals work',
    text: 'Math: subtotal × markup% = markup; (subtotal + markup) × contingency% = contingency; tax = (subtotal + markup + contingency) × tax%; final = subtotal + markup + contingency + tax. Adjust percentages on Job Info tab if needed.',
  },

  // -----------------------------------------------------------------------
  // SIGNATURE + PDF
  // -----------------------------------------------------------------------
  {
    id: 'est-sign-button',
    title: 'Step 7: Customer signature',
    text: 'Tap "Sign for acceptance". Opens the customer-facing signature page. Hand the device to the customer — they read the acceptance terms, check the acknowledgment, sign.',
    attachTo: { element: '[data-tour="estimate-sign"]', on: 'bottom' },
    waitForElement: '[data-tour="estimate-sign"]',
  },
  {
    id: 'est-signature-flow',
    title: 'Customer signs',
    text: 'Customer reads 6 acceptance terms (NTE cap, billing, IICRC standards, etc.), checks the box, types their printed name, signs. On save the estimate is locked as "accepted" with the signature on file.',
  },
  {
    id: 'est-back-to-estimate',
    title: 'Back to the estimate',
    text: 'After signing, you return to the estimate detail. A green "✓ Signed by customer" badge confirms acceptance.',
  },
  {
    id: 'est-pdf-button',
    title: 'Step 8: Generate the PDF',
    text: 'Tap "Generate PDF". The branded NTE PDF is built — cover with NTE total, "✓ ACCEPTED BY CUSTOMER" stamp if signed, line items, totals breakdown, acceptance terms, signature image on the last page.',
    attachTo: { element: '[data-tour="estimate-pdf"]', on: 'bottom' },
    waitForElement: '[data-tour="estimate-pdf"]',
  },

  // -----------------------------------------------------------------------
  // DONE
  // -----------------------------------------------------------------------
  {
    id: 'est-done',
    title: "That's an NTE estimate",
    text: "Eight steps: open a job → Estimates tile → new estimate → Job Info → Build → Review → customer signs → generate PDF. The signed PDF is your defensible record of customer authorization before work begins.",
    showBack: true,
  },
]
