/**
 * WATER_MIT_TOUR — interactive walkthrough of the water mit workflow.
 *
 * Rewrite goal: the tour MUST survive forms. Earlier version tried to
 * highlight every field one-by-one, then assumed the user had created the
 * job between two tooltips. That left the tour stuck waiting for the
 * dashboard before the user had actually clicked "Create job".
 *
 * New strategy:
 *   - One tooltip per LOGICAL screen, not per field
 *   - waitForElement is generous — accepts anything on the current screen
 *   - "Click [the actual button] when ready" — the tour waits for the next
 *     real element to appear, not for the user to click Next
 *
 * This means: the user fills out forms on their own, clicks the real
 * buttons, and the tour catches up when the next screen mounts.
 */
export const WATER_MIT_TOUR = [
  // -----------------------------------------------------------------------
  // INTRO
  // -----------------------------------------------------------------------
  {
    id: 'wm-intro',
    title: 'Water mitigation workflow',
    text: "This tour walks through a complete water mitigation job from start to finish. You'll create a real job, add rooms, take readings, set up equipment, and finalize the report. About 15 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'wm-new-job',
    title: 'Step 1: Create the job',
    text: 'Tap the "+ New job" button to begin. The tour will pause and wait for you to land on the new job screen.',
    attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
  },

  // -----------------------------------------------------------------------
  // NEW JOB FORM — single overview tooltip
  // -----------------------------------------------------------------------
  {
    id: 'wm-new-job-form',
    title: 'Fill out the new job form',
    text: 'Take your time and fill out every section: (1) Job number, (2) Customer name and address, (3) Job type — pick "Water mitigation only" for this tour, (4) Loss info (claim, carrier, date of loss, category, class — these are REQUIRED for water mit jobs). When everything is filled, tap "Create job" at the bottom. The tour will catch up on the next screen.',
    attachTo: { element: '[data-tour="job-number"]', on: 'bottom' },
    waitForElement: '[data-tour="job-number"]',
  },

  // -----------------------------------------------------------------------
  // JOB DASHBOARD — wait patiently for it to appear
  // -----------------------------------------------------------------------
  {
    id: 'wm-dashboard',
    title: 'Job Dashboard',
    text: "Great — you're on the Job Dashboard. From here you access every section: rooms, readings, equipment, photos, scope, estimates, screening, review, and report. Edit info / Duplicate / Archive / Delete buttons live in the header. Voice notes have their own tile.",
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
    text: 'Tap "+ Add room", pick a name. Inside the room mark materials affected (drywall, carpet, baseboard), actions performed (removed, dried, treated), and reasons (contamination, non-salvageable). When done, tap your job number in the breadcrumb to return to the dashboard.',
    waitForElement: 'main',
  },

  // -----------------------------------------------------------------------
  // READINGS
  // -----------------------------------------------------------------------
  {
    id: 'wm-readings-tile',
    title: 'Step 3: Moisture readings',
    text: 'Back on the dashboard, tap "Moisture readings". This is where every meter reading is logged — initial, daily, and final.',
    attachTo: { element: 'a[href$="/readings"]', on: 'bottom' },
    waitForElement: 'a[href$="/readings"]',
  },
  {
    id: 'wm-readings-screen',
    title: 'Adding readings',
    text: 'Tap "+ Add reading". Pick the room, material, and meter type. Enter the value. The app suggests a drying goal — you can override if needed. When done, return to the dashboard via the breadcrumb.',
    waitForElement: 'main',
  },

  // -----------------------------------------------------------------------
  // EQUIPMENT
  // -----------------------------------------------------------------------
  {
    id: 'wm-equipment-tile',
    title: 'Step 4: Equipment',
    text: 'On the dashboard, tap "Equipment". Log every piece deployed — dehumidifiers, air movers, HEPA filters. Each entry tracks asset tag, room placement, and days on site.',
    attachTo: { element: 'a[href$="/equipment"]', on: 'bottom' },
    waitForElement: 'a[href$="/equipment"]',
  },
  {
    id: 'wm-equipment-screen',
    title: 'Equipment logging',
    text: 'Add each piece with asset tag and location. The dashboard counts days on site and warns at 4+ days — important for insurance billing.',
    waitForElement: 'main',
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

  // -----------------------------------------------------------------------
  // PHOTOS
  // -----------------------------------------------------------------------
  {
    id: 'wm-photos-tile',
    title: 'Step 6: Photos',
    text: 'Back at the dashboard, tap "Photos". Categorize every photo — initial condition, equipment, readings, completion. Photos appear in the final report grouped by category. AI can auto-categorize uncategorized photos when needed.',
    attachTo: { element: 'a[href$="/photos"]', on: 'bottom' },
    waitForElement: 'a[href$="/photos"]',
  },
  {
    id: 'wm-voice-notes',
    title: '🎙️ Voice notes (any step)',
    text: 'Any time during the job, tap the Voice Notes tile to record hands-free observations. AI transcribes audio and pulls out structured details (materials, readings, observations). Great for field techs whose hands are busy.',
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
