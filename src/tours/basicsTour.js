/**
 * BASICS_TOUR — 5-minute orientation for new users.
 *
 * Walks the user around the main areas of the app without requiring any
 * destructive actions. References real DOM elements via data-tour attributes.
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
    text: 'Every screen shows the same blue header. Your name and role show on the right with a sign-out button.',
    attachTo: { element: 'header', on: 'bottom' },
  },
  {
    id: 'jobs-area',
    title: 'Jobs list',
    text: 'This is where every active job lives. Tap a job card to open it. The filter tabs let you switch between active, finalized, and paid jobs.',
    attachTo: { element: '[data-tour="jobs-list"]', on: 'top' },
  },
  {
    id: 'new-job-button',
    title: 'Create a new job',
    text: 'This button starts a new job intake form. Every customer interaction starts with a job — water mitigation, mold screening, or both at once.',
    attachTo: { element: '[data-tour="new-job-button"]', on: 'bottom' },
  },
  {
    id: 'settings-link',
    title: 'Settings (Owner-only)',
    text: 'Owners get a Settings link in the header. Settings hold editable lists used across the app — meters, equipment types, drying goals, screening recommendations, your team profile, rate catalog, etc.',
    attachTo: { element: '[data-tour="settings-link"]', on: 'bottom' },
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
