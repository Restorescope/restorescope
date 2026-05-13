/**
 * BASICS_TOUR — 5-minute orientation for new users.
 *
 * Walks the user around the main areas of the app without requiring any
 * destructive actions. References real DOM elements via data-tour attributes.
 *
 * Keep this tour synced with new features as they're built. Last updated:
 * adds Tutorial link, Settings → Team mention, and Duplicate job button.
 */
export const BASICS_TOUR = [
  {
    id: 'welcome',
    title: 'Welcome to RestoreScope',
    text: "This is the field app for 1-800 WATER DAMAGE of North Dakota. It manages water mitigation jobs and mold screenings end to end. This quick tour shows you the basics — about 5 minutes.",
    showSkip: true,
    navigateBefore: '/jobs',
  },
  {
    id: 'header',
    title: 'The header',
    text: 'Every screen shows the same blue header. Your name and role show on the right with a sign-out button. The header also gives you quick links to Tutorial, Settings (Owner only), and Sign out.',
    attachTo: { element: 'header', on: 'bottom' },
  },
  {
    id: 'jobs-area',
    title: 'Jobs list',
    text: 'This is where every active job lives. Tap a job card to open it. The filter tabs switch between Active, Finalized, Paid, Archived, and All. The search box at the top filters by customer name, address, phone, or job number — useful as your job list grows.',
    attachTo: { element: '[data-tour="jobs-list"]', on: 'top' },
  },
  {
    id: 'new-job-button',
    title: 'Create a new job',
    text: 'This button starts a new job intake form. Every customer interaction starts with a job — water mitigation, mold screening, or both at once.',
    attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
  },
  {
    id: 'job-page-actions',
    title: 'Inside a job: Edit · Duplicate · Archive · Delete',
    text: 'When you open a job, four buttons sit in the dashboard header: "Edit info" fixes customer details. "Duplicate" creates a fresh draft with the same customer pre-filled — great when the same customer calls back or for multi-unit properties. "Archive" hides finished/paid jobs from your active view (reversible, data preserved). "Delete" (Owner only, red button) is for jobs that never should have existed — customer backed out, test jobs, duplicates — and requires typing the job number to confirm.',
  },
  {
    id: 'tutorial-link',
    title: 'Tutorials (you\'re using one now)',
    text: "The \"Tutorial\" link in the header brings you back to this page anytime. Four tutorials cover the main workflows — basics, water mitigation, mold screening, and estimates. Phone users see a static reading version; desktop and tablet see this interactive overlay.",
  },
  {
    id: 'settings-link',
    title: 'Settings (Owner-only)',
    text: 'Owners get a Settings link in the header. Settings hold editable lists used across the app — meters, equipment types, drying goals, screening recommendations, the rate catalog, Spore & Handler profile, and the Team (invite PMs and Technicians).',
    attachTo: { element: '[data-tour="settings-link"]', on: 'bottom' },
  },
  {
    id: 'team-management',
    title: 'Team management (Owner)',
    text: 'Settings → Team is how you invite new PMs and Technicians. The Owner creates an invite link, shares it manually (text or email), and the invitee opens it to create their account. Deactivated users can\'t sign in but their work history stays intact for the audit trail.',
  },
  {
    id: 'sign-out',
    title: 'Sign out',
    text: "When you're done for the day, tap Sign out to lock the app. Your work is automatically saved as you go — no manual save needed.",
    attachTo: { element: '[data-tour="signout-button"]', on: 'bottom' },
  },
  {
    id: 'done',
    title: "You're oriented",
    text: "That's the lay of the land. Try the \"Water mitigation job\" or \"Mold screening job\" tour next to see a real workflow end to end.",
    showBack: true,
  },
]
