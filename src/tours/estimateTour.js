/**
 * ESTIMATE_TOUR — interactive walkthrough of the NTE Estimator.
 *
 * Walks the user through building an estimate from scratch: picking line
 * items from the catalog, adjusting quantities and rates, reviewing the
 * total, getting the customer's signature, and generating the branded
 * NTE PDF.
 *
 * Starts on the estimates list inside a job. User must have a job open
 * first (the previous tours all leave you with a job to work with).
 */
export const ESTIMATE_TOUR = [
  // -----------------------------------------------------------------------
  // INTRO
  // -----------------------------------------------------------------------
  {
    id: 'est-intro',
    title: 'Building an NTE estimate',
    text: "This tour walks through building a Not-to-Exceed estimate for a customer — picking line items, totaling the job, getting the customer's signature, and generating the branded PDF. Takes about 8 minutes. You need to be on a real job to do this — open any active job first.",
    showSkip: true,
  },

  // -----------------------------------------------------------------------
  // OPEN ESTIMATES LIST
  // -----------------------------------------------------------------------
  {
    id: 'est-open-estimates',
    title: 'Step 1: Open the Estimates tile',
    text: "From the Job Dashboard, tap the \"Estimates\" tile. This opens the list of estimates for this job. You can have multiple versions — useful when the scope changes mid-job.",
    attachTo: { element: 'a[href$="/estimates"]', on: 'bottom' },
  },
  {
    id: 'est-new-estimate-button',
    title: 'Step 2: Create a new estimate',
    text: 'Tap "+ New estimate". A blank draft estimate is created and you\'re taken to the editor.',
    attachTo: { element: '[data-tour="new-estimate-button"]', on: 'bottom' },
    waitForElement: '[data-tour="new-estimate-button"]',
  },

  // -----------------------------------------------------------------------
  // EDITOR OVERVIEW
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
    title: 'Step 3: Job Info tab',
    text: 'Stay on the Job Info tab. Verify customer details auto-filled from the job. Set markup %, contingency %, and tax % — these get applied to the line subtotal. Defaults are 0/0/0; adjust to your typical numbers.',
  },
  {
    id: 'est-build-tab',
    title: 'Step 4: Build Estimate tab',
    text: 'Tap "Build Estimate" at the top. This is where you actually pick line items from the rate catalog.',
    attachTo: { element: '[data-tour="estimate-tabs"]', on: 'bottom' },
  },

  // -----------------------------------------------------------------------
  // CATALOG + LINES
  // -----------------------------------------------------------------------
  {
    id: 'est-catalog',
    title: 'The rate catalog',
    text: '58 pre-seeded line items at 1-800 Water Damage 2026 national rates — labor, equipment days, consumables, mileage, etc. Search by name or filter by category. Tap any item to add it to the estimate.',
    attachTo: { element: '[data-tour="estimate-catalog"]', on: 'right' },
    waitForElement: '[data-tour="estimate-catalog"]',
  },
  {
    id: 'est-lines',
    title: 'Estimate lines',
    text: 'Right side shows what you\'ve added. Each line has Quantity (number of techs / units / etc.) AND a second unit field (Hours, Days, Gallons, etc.) plus the rate. Total = qty × units × rate. So 4 techs × 8 hours × $68.50 = $2,192.',
    attachTo: { element: '[data-tour="estimate-lines"]', on: 'left' },
  },
  {
    id: 'est-add-items',
    title: 'Try it: add 2-3 items',
    text: 'Add a few items — try "Technician hourly", "LGR dehumidifier day", "Air mover day". Adjust quantities and units to match what would be realistic for a job. The total updates live.',
    waitForElement: '[data-tour="estimate-lines"]',
  },

  // -----------------------------------------------------------------------
  // REVIEW TAB
  // -----------------------------------------------------------------------
  {
    id: 'est-review',
    title: 'Step 5: Review tab',
    text: 'Tap "Review" at the top. This shows the line subtotal, markup, contingency, tax, and the final Not-to-Exceed total. This is what the customer sees on the PDF cover.',
    attachTo: { element: '[data-tour="estimate-tabs"]', on: 'bottom' },
  },
  {
    id: 'est-totals-math',
    title: 'How the totals work',
    text: 'Math: subtotal × markup% = markup; (subtotal + markup) × contingency% = contingency; tax = (subtotal + markup + contingency) × tax%; final = subtotal + markup + contingency + tax. Adjust percentages on the Job Info tab if needed.',
  },

  // -----------------------------------------------------------------------
  // SIGN FOR ACCEPTANCE
  // -----------------------------------------------------------------------
  {
    id: 'est-sign-button',
    title: 'Step 6: Get the customer signature',
    text: "Tap \"Sign for acceptance\". This opens the customer-facing signature page. Hand the phone or tablet to the customer to sign — they read the acceptance terms, check the acknowledgment, sign.",
    attachTo: { element: '[data-tour="estimate-sign"]', on: 'bottom' },
  },
  {
    id: 'est-signature-flow',
    title: 'Customer signs',
    text: 'Customer reads 6 acceptance terms (NTE cap, billing, IICRC standards, taxes, etc.), checks the box, types their printed name, signs on the pad. On save the estimate is locked as "accepted" with the signature on file.',
  },
  {
    id: 'est-back-to-estimate',
    title: 'Back to the estimate',
    text: "After signing, you'll return to the estimate detail. You'll see a green \"✓ Signed by customer\" badge confirming acceptance.",
  },

  // -----------------------------------------------------------------------
  // GENERATE PDF
  // -----------------------------------------------------------------------
  {
    id: 'est-pdf-button',
    title: 'Step 7: Generate the PDF',
    text: 'Tap "Generate PDF". The branded NTE PDF is built — cover with the NTE total, "✓ ACCEPTED BY CUSTOMER" stamp if signed, line items, totals breakdown, acceptance terms, and the signature image on the last page.',
    attachTo: { element: '[data-tour="estimate-pdf"]', on: 'bottom' },
  },

  // -----------------------------------------------------------------------
  // DONE
  // -----------------------------------------------------------------------
  {
    id: 'est-done',
    title: "That's an NTE estimate",
    text: "Seven steps: open Estimates → new estimate → job info → build lines → review totals → customer signs → generate PDF. The signed PDF is your defensible record of customer authorization before work begins. Each new estimate version supersedes prior drafts automatically.",
    showBack: true,
  },
]
