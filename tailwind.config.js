/** @type {import('tailwindcss').Config} */
//
// Brand colors are sourced from CSS variables (--brand-blue, --brand-yellow,
// etc.) instead of hardcoded hex. The variables are set on :root by the
// BrandingProvider at app startup based on the tenant's branding settings
// in the database. If no overrides exist, the defaults in src/index.css
// (1-800 WATER DAMAGE of North Dakota colors) are used.
//
// This lets the Owner change brand colors from Settings → Branding without
// needing a code change or rebuild.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue:         'var(--brand-blue, #0061AF)',
          'blue-dark':  'var(--brand-blue-dark, #004A85)',
          'blue-light': 'var(--brand-blue-light, #3389C7)',
          yellow:       'var(--brand-yellow, #FFF200)',
          'yellow-dark':'var(--brand-yellow-dark, #E6D900)',
        },
        ink: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9',
          50:  '#F8FAFC',
        },
        success: '#16A34A',
        warning: '#D97706',
        danger:  '#DC2626',
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        condensed: ['"Barlow Condensed"', 'Barlow', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
        'card-hover': '0 4px 12px rgba(15,23,42,0.10)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
  plugins: [],
}
