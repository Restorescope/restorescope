/**
 * WATER_MIT_TOUR — interactive walkthrough of the water mit workflow.
 *
 * Strategy:
 *   - One tooltip per LOGICAL screen, not per field
 *   - waitForElement is generous — accepts anything on the current screen
 *   - "Click [the actual button] when ready" — the tour waits for the next
 *     real element to appear, not for the user to click Next
 *
 * Updated to cover: property history, voice notes, photo requirements (job + per
 * room), bulk reassign, daily monitoring with comparison readings + auto-GPP,
 * pre-submission AI analysis, and the drying log section of the report.
 */
export const WATER_MIT_TOUR = [
  // ---------------------------------------------------------------------------
  // INTRO
  // ---------------------------------------------------------------------------
  {
    id: 'wm-intro',
    title: 'Water mitigation workflow',
    text: "This tour walks through a complete water mitigation job from start to finish — create the job, set up rooms, capture readings, deploy equipment, document photos with built-in compliance checks, run AI compliance analysis, and generate the report. About 20 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'wm-new-job',
    title: 'Step 1: Create the job',
    text: 'Tap the "+ New job" button to begin. The tour will pause and wait for you to land on the new job screen.',
    attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
  },
  {
    id: 'wm-new-job-form',
    title: 'Fill out the new job form',
    text: 'Take your time and fill out every section: (1) Job number, (2) Customer name and address, (3) Job type — pick "Water mitigation only" for this tour, (4) Loss info (claim, carrier, date of loss, category, class — these are REQUIRED for water mit jobs). When everything is filled, tap "Create job" at the bottom. The tour will catch up on the next screen.',
    attachTo: { element: '[data-tour="job-number"]', on: 'bottom' },
    waitForElement: '[data-tour="job-number"]',
  },

  // ---------------------------------------------------------------------------
  // DASHBOARD ORIENTATION
  // ---------------------------------------------------------------------------
  {
    id: 'wm-dashboard',
    title: 'Job Dashboard',
    text: "Great — you're on the Job Dashboard. From here you access every section: rooms, readings, equipment, monitoring, photos, scope, estimates, review, and report. The Quality Control card shows automated checks, the Photo Documentation card shows your live photo compliance score, and the Voice Notes tile lets you record hands-free observations any time.",
    waitForElement: 'a[href$="/rooms"]',
  },

  // ---------------------------------------------------------------------------
  // PROPERTY HISTORY (optional)
  // ---------------------------------------------------------------------------
  {
    id: 'wm-property-history',
    title: 'Property history (optional but recommended)',
    text: 'On every job, look for the "Property history" tile or section. Document anything pre-existing: prior damage, prior repairs, age of materials, etc. This protects you from adjusters trying to attribute pre-existing damage to your loss. The AI uses this context when generating reports.',
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // ROOMS
  // ---------------------------------------------------------------------------
  {
    id: 'wm-rooms-tile',
    title: 'Step 2: Affected rooms',
    text: 'Tap the "Affected rooms" tile to add rooms damaged by the loss. Inside each room you\'ll mark materials, actions, and reasons. THIS DRIVES MANY THINGS — the scope, the per-room photo requirements, and the room-level drying chambers.',
    attachTo: { element: 'a[href$="/rooms"]', on: 'bottom' },
  },
  {
    id: 'wm-rooms-screen',
    title: 'Rooms list',
    text: 'Tap "+ Add room", pick a name. Inside the room mark materials affected (drywall, carpet, baseboard, cabinet, etc.), actions performed (removed, dried, treated), and reasons (contamination, non-salvageable). Marking a material with "removed" will automatically trigger the right per-room photo requirements (e.g., before-removal and exposed-after photos). When done, return to the dashboard via breadcrumb.',
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // READINGS
  // ---------------------------------------------------------------------------
  {
    id: 'wm-readings-tile',
    title: 'Step 3: Moisture readings',
    text: 'Back on the dashboard, tap "Moisture readings". This is where every meter reading is logged — initial, daily, and final dry. These prove the materials were wet and that drying happened.',
    attachTo: { element: 'a[href$="/readings"]', on: 'bottom' },
    waitForElement: 'a[href$="/readings"]',
  },
  {
    id: 'wm-readings-screen',
    title: 'Adding readings',
    text: 'Tap "+ Add reading". Pick the room, material, and meter type. Enter the value. The app suggests a drying goal — override if needed. Tag each reading with a status (wet / drying / dry). Final readings showing "dry" prove drying standards were met. When done, return to the dashboard via the breadcrumb.',
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // EQUIPMENT
  // ---------------------------------------------------------------------------
  {
    id: 'wm-equipment-tile',
    title: 'Step 4: Equipment',
    text: 'On the dashboard, tap "Equipment". Log every piece deployed — dehumidifiers, air movers, HEPA filters, spider boxes. Each entry tracks asset tag, room placement, placement time, and days on site.',
    attachTo: { element: 'a[href$="/equipment"]', on: 'bottom' },
    waitForElement: 'a[href$="/equipment"]',
  },
  {
    id: 'wm-equipment-screen',
    title: 'Equipment logging',
    text: 'Add each piece with asset tag and location. The dashboard counts days on site and warns at 4+ days — important for insurance billing. Mark "removed" when you pull a piece off site.',
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // DAILY MONITORING — major update
  // ---------------------------------------------------------------------------
  {
    id: 'wm-monitoring-tile',
    title: 'Step 5: Daily monitoring',
    text: "Each visit, tap \"Daily monitoring\" to log readings that prove the drying environment is working. The form now captures four zones per visit: chamber (affected area), outside, unaffected area, AND each dehumidifier's exhaust OUT readings.",
    attachTo: { element: 'a[href$="/monitoring"]', on: 'bottom' },
    waitForElement: 'a[href$="/monitoring"]',
  },
  {
    id: 'wm-monitoring-screen',
    title: 'Auto-calculated GPP',
    text: "Tap \"+ Log visit\". Type temperature + RH for any zone and the GPP (grains per pound) auto-calculates instantly — no manual math. Fill in chamber, outside (with weather conditions), unaffected, and each dehu's exhaust readings. Adjusters use the GPP differential between zones to verify drying is happening.",
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // PHOTOS — major addition: requirements + per-room
  // ---------------------------------------------------------------------------
  {
    id: 'wm-photos-tile',
    title: 'Step 6: Photos',
    text: 'Back at the dashboard, tap "Photos". The new Photo Requirements system shows you a live checklist of every photo this job needs based on its category, class, and the work performed in each room.',
    attachTo: { element: 'a[href$="/photos"]', on: 'bottom' },
    waitForElement: 'a[href$="/photos"]',
  },
  {
    id: 'wm-photo-requirements',
    title: 'Photo requirements checklist',
    text: 'At the top of the Photos screen is a Photo Requirements card with a score (0-100). Job-level requirements (front of property, source area) are taken once. Per-room requirements (affected overview, final dry, drywall removal photos, etc.) are required for EACH affected room. Tap "Show details" to expand the full list.',
    waitForElement: 'main',
  },
  {
    id: 'wm-take-photo-button',
    title: '📷 Take photo from the checklist',
    text: 'Each missing requirement has a yellow "📷 Take photo" button. Tap it → camera opens on mobile → snap → preview → save. The photo gets the right category and (for per-room ones) the right room automatically. Score updates instantly.',
    waitForElement: 'main',
  },
  {
    id: 'wm-bulk-reassign',
    title: 'Bulk reassign photos to rooms',
    text: 'For existing photos without a room set, tap "☑ Select photos" in the gallery filter row. Tap photo tiles to select. Tap "Reassign room" → pick a room → Apply. Useful for backfilling older jobs to fix per-room scoring.',
    waitForElement: 'main',
  },
  {
    id: 'wm-voice-notes',
    title: '🎙️ Voice notes (any step)',
    text: 'Any time during the job, tap the Voice Notes tile to record hands-free observations. AI transcribes audio and pulls out structured details (materials, readings, observations). Great for field techs whose hands are busy.',
    attachTo: { element: 'a[href$="/voice-notes"]', on: 'bottom' },
  },

  // ---------------------------------------------------------------------------
  // SCOPE
  // ---------------------------------------------------------------------------
  {
    id: 'wm-scope-tile',
    title: 'Step 7: Scope',
    text: '"Scope" is line-by-line documentation of work performed per room and material. Most entries auto-populate based on what you marked on rooms. Review and adjust as needed — the scope drives both your report justification and your estimate.',
    attachTo: { element: 'a[href$="/scope"]', on: 'bottom' },
    waitForElement: 'a[href$="/scope"]',
  },

  // ---------------------------------------------------------------------------
  // REVIEW / QC — major addition: pre-submission AI analysis
  // ---------------------------------------------------------------------------
  {
    id: 'wm-review-tile',
    title: 'Step 8: Review (QC + AI)',
    text: 'Tap "Review" — runs automated quality checks (missing readings, photo gaps, etc.) AND now includes the pre-submission AI analysis card. Fix blocking issues before finalizing.',
    attachTo: { element: 'a[href$="/review"]', on: 'bottom' },
    waitForElement: 'a[href$="/review"]',
  },
  {
    id: 'wm-ai-analysis',
    title: '🤖 Pre-Submission AI Analysis',
    text: 'The new AI Analysis card runs IICRC S500 compliance checks and predicts adjuster pushback BEFORE you submit. Tap "Run analysis" — 10-30 seconds later you get critical issues, warnings, and passed checks grouped by section (rooms, readings, equipment, scope, photos). AI findings are internal QA only — they never appear on the customer/insurance report.',
    waitForElement: 'main',
  },

  // ---------------------------------------------------------------------------
  // REPORT — updated with drying log section
  // ---------------------------------------------------------------------------
  {
    id: 'wm-report-tile',
    title: 'Step 9: Generate the report',
    text: 'Once QC is clean and AI findings reviewed, tap "Report" to generate the branded mitigation report PDF. It includes cover, intake, loss info, affected areas room-by-room, scope justification, drying summary, equipment summary, daily ambient + moisture readings logs, photos organized by job phase, and limitations/completion.',
    attachTo: { element: 'a[href$="/report"]', on: 'bottom' },
    waitForElement: 'a[href$="/report"]',
  },

  // ---------------------------------------------------------------------------
  // DONE
  // ---------------------------------------------------------------------------
  {
    id: 'wm-done',
    title: "That's a water mit job",
    text: "Nine steps with all the new tools: create job → rooms → readings → equipment → monitoring (with auto-GPP and comparison readings) → photos (with live requirements checklist) → scope → review (with AI compliance check) → report (with drying logs). Real jobs span days or weeks — you'll return to the same dashboard each visit to add new data. Save the PDF, send to customer or carrier, mark the job paid when the invoice clears.",
    showBack: true,
  },
]
