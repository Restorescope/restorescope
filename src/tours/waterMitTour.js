/**
 * WATER_MIT_TOUR — interactive walkthrough of the full water mitigation
 * workflow. Walks the user from the jobs list → creating a job → adding
 * documentation → finalizing → generating the PDF.
 *
 * Strategy: tour highlights big sections rather than every individual field.
 * The user reads the explainer, fills in the fields on their own, clicks
 * Next when ready to advance.
 *
 * The tour does NOT auto-navigate or auto-submit forms — every navigation
 * happens manually by the user clicking the actual link or button the tour
 * is pointing at. This means the tour can pause at decision points and the
 * user genuinely learns by doing.
 */
export const WATER_MIT_TOUR = [
  // -----------------------------------------------------------------------
  // INTRO + JOB CREATION
  // -----------------------------------------------------------------------
  {
    id: 'wm-intro',
    title: 'Water mitigation workflow',
    text: "This tour walks through a complete water mitigation job from start to finish. You'll create a real job, add rooms, take readings, set up equipment, and finalize the report. Takes about 15 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'wm-new-job',
    title: 'Step 1: Create the job',
    text: "Every customer interaction starts with a job. Tap the \"+ New job\" button to begin. The tour continues when you're on the new job screen.",
    attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
  },
  {
    id: 'wm-job-number',
    title: 'Job number',
    text: "Type a unique job number (e.g. WD-2026-0001). Use whatever numbering scheme makes sense. Once set, this is the job's permanent ID.",
    attachTo: { element: '[data-tour="job-number"]', on: 'bottom' },
    navigateBefore: '/jobs/new',
  },
  {
    id: 'wm-customer-block',
    title: 'Customer info',
    text: "Fill in the customer's name, address, phone, and email. The address shows on every report.",
    attachTo: { element: '[data-tour="customer-block"]', on: 'top' },
  },
  {
    id: 'wm-job-type',
    title: 'Job type',
    text: 'Three options: Water mitigation only, Mold screening only, or Combo. For this tour pick "Water mitigation only".',
    attachTo: { element: '[data-tour="job-type"]', on: 'top' },
  },
  {
    id: 'wm-loss-info',
    title: 'Loss info (water mit jobs)',
    text: "For water mit, claim number, carrier, date of loss, category, and class are required. Drives insurance billing and IICRC documentation.",
    attachTo: { element: '[data-tour="loss-info"]', on: 'top' },
  },
  {
    id: 'wm-submit-job',
    title: 'Create the job',
    text: 'When the form is filled out, tap "Create job". You\'ll land on the Job Dashboard.',
    attachTo: { element: '[data-tour="submit-job"]', on: 'top' },
  },

  // -----------------------------------------------------------------------
  // JOB DASHBOARD
  // -----------------------------------------------------------------------
  {
    id: 'wm-dashboard',
    title: 'Job Dashboard',
    text: "This is the home page for this job. From here you access every section — rooms, readings, equipment, photos, scope, estimates, screening, review, and report. The header has two action buttons: \"Edit info\" (fix customer details) and \"Duplicate\" (create a new job with the same customer info — useful for returning customers or multi-unit properties).",
    waitForElement: 'a[href$="/rooms"]',
  },
  {
    id: 'wm-rooms-tile',
    title: 'Step 2: Affected rooms',
    text: 'Tap the "Affected rooms" tile to add rooms damaged by the loss. Inside each room you\'ll mark materials, actions, and reasons.',
    attachTo: { element: 'a[href$="/rooms"]', on: 'bottom' },
  },
  {
    id: 'wm-rooms-screen',
    title: 'Rooms list',
    text: 'Tap "+ Add room", pick a name. Inside the room mark materials affected (drywall, carpet, baseboard), actions performed (removed, dried, treated), and reasons (contamination, non-salvageable).',
    waitForElement: 'main',
  },
  {
    id: 'wm-back-to-dashboard-1',
    title: 'Back to dashboard',
    text: 'Once you\'ve added a room or two, navigate back to the Job Dashboard (tap the job number in the breadcrumb). Click Next when you\'re back.',
  },

  // -----------------------------------------------------------------------
  // READINGS
  // -----------------------------------------------------------------------
  {
    id: 'wm-readings-tile',
    title: 'Step 3: Moisture readings',
    text: 'Tap "Moisture readings". This is where every meter reading is logged — initial, daily, and final.',
    attachTo: { element: 'a[href$="/readings"]', on: 'bottom' },
    waitForElement: 'a[href$="/readings"]',
  },
  {
    id: 'wm-readings-screen',
    title: 'Adding readings',
    text: 'Tap "+ Add reading". Pick the room, material, and meter type. Enter the value. The app suggests a drying goal — you can override if needed.',
    waitForElement: 'main',
  },
  {
    id: 'wm-back-to-dashboard-2',
    title: 'Back to dashboard',
    text: 'Add a few readings, then head back to the dashboard.',
  },

  // -----------------------------------------------------------------------
  // EQUIPMENT
  // -----------------------------------------------------------------------
  {
    id: 'wm-equipment-tile',
    title: 'Step 4: Equipment',
    text: 'Tap "Equipment". Log every piece deployed — dehumidifiers, air movers, HEPA filters. Each entry tracks asset tag, room placement, and days on site.',
    attachTo: { element: 'a[href$="/equipment"]', on: 'bottom' },
    waitForElement: 'a[href$="/equipment"]',
  },
  {
    id: 'wm-equipment-screen',
    title: 'Equipment logging',
    text: 'Add each piece with asset tag and location. The dashboard counts days on site and warns at 4+ days — important for insurance billing.',
    waitForElement: 'main',
  },
  {
    id: 'wm-back-to-dashboard-3',
    title: 'Back to dashboard',
    text: 'Once equipment is logged, head back to the dashboard.',
  },

  // -----------------------------------------------------------------------
  // MONITORING (daily)
  // -----------------------------------------------------------------------
  {
    id: 'wm-monitoring-tile',
    title: 'Step 5: Daily monitoring',
    text: 'Each day you return to the property, tap "Daily monitoring" to log ambient conditions and grain depression — proof the drying environment is being maintained.',
    attachTo: { element: 'a[href$="/monitoring"]', on: 'bottom' },
    waitForElement: 'a[href$="/monitoring"]',
  },
  {
    id: 'wm-monitoring-screen',
    title: 'Daily readings',
    text: 'Tap "+ Add reading" each day. Record indoor temp/RH, outdoor temp/RH. The app calculates grain depression automatically.',
    waitForElement: 'main',
  },

  // -----------------------------------------------------------------------
  // PHOTOS
  // -----------------------------------------------------------------------
  {
    id: 'wm-photos-tile',
    title: 'Step 6: Photos',
    text: 'Back at the dashboard, tap "Photos". Categorize every photo — initial condition, equipment, readings, completion. Photos appear in the final report grouped by category. New: if you have uncategorized photos, an "AI categorize" button appears that auto-classifies them in seconds.',
    attachTo: { element: 'a[href$="/photos"]', on: 'bottom' },
    waitForElement: 'a[href$="/photos"]',
  },
  {
    id: 'wm-voice-notes',
    title: '🎙️ Voice notes (any step)',
    text: 'New in Phase 2: any time during the job, tap the Voice Notes tile to record hands-free observations. AI transcribes your audio and pulls out structured details (materials, readings, observations). Great for field techs whose hands are busy.',
    attachTo: { element: 'a[href$="/voice-notes"]', on: 'bottom' },
  },

  // -----------------------------------------------------------------------
  // SCOPE
  // -----------------------------------------------------------------------
  {
    id: 'wm-scope-tile',
    title: 'Step 7: Scope',
    text: '"Scope" is line-by-line documentation of work performed per room and material. Most entries auto-populate based on what you marked on rooms. Review and adjust.',
    attachTo: { element: 'a[href$="/scope"]', on: 'bottom' },
    waitForElement: 'a[href$="/scope"]',
  },

  // -----------------------------------------------------------------------
  // REVIEW / QC
  // -----------------------------------------------------------------------
  {
    id: 'wm-review-tile',
    title: 'Step 8: Review (QC)',
    text: '"Review" runs automated quality checks — missing readings, equipment without rooms, photo gaps. Fix blocking issues before finalizing.',
    attachTo: { element: 'a[href$="/review"]', on: 'bottom' },
    waitForElement: 'a[href$="/review"]',
  },

  // -----------------------------------------------------------------------
  // REPORT
  // -----------------------------------------------------------------------
  {
    id: 'wm-report-tile',
    title: 'Step 9: Generate the report',
    text: 'Once QC is clean, tap "Report" to generate the branded 13-section mitigation report PDF. Includes cover, intake, areas, readings, equipment, monitoring, scope, photos, signatures.',
    attachTo: { element: 'a[href$="/report"]', on: 'bottom' },
    waitForElement: 'a[href$="/report"]',
  },

  // -----------------------------------------------------------------------
  // DONE
  // -----------------------------------------------------------------------
  {
    id: 'wm-done',
    title: "That's a water mit job",
    text: "Nine steps: create job → rooms → readings → equipment → monitoring → photos → scope → review → report. Real jobs span days or weeks — you'll come back to the same dashboard each visit to add new data. Save the report PDF, send to customer or carrier, mark the job paid when the invoice clears.",
    showBack: true,
  },
]
