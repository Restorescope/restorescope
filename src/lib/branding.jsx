import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth.jsx'

/**
 * Branding system.
 *
 * On app mount (after the user signs in), BrandingProvider loads the
 * tenant's branding settings from the database and writes the color palette
 * to the document root as CSS variables.
 *
 * Tailwind's `brand-*` color tokens reference these variables, so the entire
 * app re-themes when the variables change. No page reload needed.
 *
 * Exposes:
 *   useBranding() → { branding, refresh }
 *     - branding.company_name, .phone, .email, .address, .tagline
 *     - branding.logo_path  (storage path; resolve to a URL with getLogoUrl)
 *     - branding.colors { primary, primary_dark, primary_light, accent, accent_dark }
 *   refresh()  → reloads from DB (call after saving changes in Settings)
 *
 * Falls back to default brand colors if the user isn't signed in yet or no
 * branding row exists for the tenant.
 */

export const DEFAULT_BRANDING = {
  company_name: '1-800 WATER DAMAGE of North Dakota',
  phone:        '701-840-3336',
  email:        'jason.phillips@1800waterdamage.com',
  address:      '929 6th Ave NE, Valley City, ND 58072',
  tagline:      'Restoring What Matters Most!',
  logo_path:    null,
  colors: {
    primary:       '#0061AF',
    primary_dark:  '#004A85',
    primary_light: '#3389C7',
    accent:        '#FFF200',
    accent_dark:   '#E6D900',
  },
}

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  refresh: async () => {},
})

export function BrandingProvider({ children }) {
  const { profile } = useAuth()
  const [branding, setBranding] = useState(DEFAULT_BRANDING)

  const refresh = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data, error } = await supabase
      .from('settings')
      .select('data')
      .eq('tenant_id', profile.tenant_id)
      .eq('setting_type', 'branding')
      .maybeSingle()
    if (error) {
      console.warn('[branding] failed to load:', error.message)
      return
    }
    if (data?.data) {
      setBranding({ ...DEFAULT_BRANDING, ...data.data,
        colors: { ...DEFAULT_BRANDING.colors, ...(data.data.colors || {}) },
      })
    }
  }, [profile?.tenant_id])

  // Load whenever the signed-in tenant changes
  useEffect(() => {
    if (profile?.tenant_id) refresh()
  }, [profile?.tenant_id, refresh])

  // Apply colors as CSS variables on :root
  useEffect(() => {
    const root = document.documentElement
    const c = branding.colors || {}
    if (c.primary)       root.style.setProperty('--brand-blue',         c.primary)
    if (c.primary_dark)  root.style.setProperty('--brand-blue-dark',    c.primary_dark)
    if (c.primary_light) root.style.setProperty('--brand-blue-light',   c.primary_light)
    if (c.accent)        root.style.setProperty('--brand-yellow',       c.accent)
    if (c.accent_dark)   root.style.setProperty('--brand-yellow-dark',  c.accent_dark)
  }, [branding])

  return (
    <BrandingContext.Provider value={{ branding, refresh }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}

/**
 * Resolve a logo storage path to a signed URL the browser can render.
 * Returns null if no logo set.
 */
export async function getLogoUrl(logoPath) {
  if (!logoPath) return null
  const { data, error } = await supabase
    .storage
    .from('branding-assets')
    .createSignedUrl(logoPath, 60 * 60) // 1 hour
  if (error) {
    console.warn('[branding] couldn\'t sign logo url:', error.message)
    return null
  }
  return data.signedUrl
}
