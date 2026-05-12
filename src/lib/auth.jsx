import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { supabase } from './supabase'
import {
  DEFAULT_ROOMS, DEFAULT_MATERIALS, DEFAULT_ACTIONS, DEFAULT_REASONS,
  DEFAULT_FINAL_STATUS, DEFAULT_METERS, DEFAULT_EQUIPMENT,
  DEFAULT_WORK_ITEM_TYPES, DEFAULT_LOSS_SOURCES, DEFAULT_OCCUPANCY,
  DEFAULT_DRYING_GOALS, DEFAULT_SCOPE_LIBRARY, DEFAULT_QC_RULES,
} from './defaults'

// ----------------------------------------------------------------------------
// Auth context
// ----------------------------------------------------------------------------

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)   // { id, tenant_id, role, full_name, email, ... }
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    const { data, error } = await supabase
      .from('users')
      .select('id, tenant_id, email, role, full_name, is_active')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Profile load error', error)
      setProfile(null)
    } else if (data && data.is_active === false) {
      // Deactivated users get signed out immediately
      setProfile(null)
      await supabase.auth.signOut()
      // eslint-disable-next-line no-alert
      alert('This account has been deactivated. Please contact your administrator.')
    } else {
      setProfile(data)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return
      setSession(s)
      if (s?.user) loadProfile(s.user.id).finally(() => !cancelled && setLoading(false))
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    role: profile?.role ?? null,
    tenantId: profile?.tenant_id ?? null,
    refreshProfile: () => session?.user && loadProfile(session.user.id),
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ----------------------------------------------------------------------------
// Signup / bootstrap
// ----------------------------------------------------------------------------

export async function signUpAndBootstrap({ email, password, companyName, fullName }) {
  // 1. Create the auth user
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email, password,
  })
  if (signUpErr) throw signUpErr
  if (!signUpData.session) {
    // Email confirmation required by default Supabase config — ask user to confirm
    return { needsEmailConfirmation: true }
  }

  // 2. Create the tenant + owner row via RPC (atomic, server-side)
  const { error: rpcErr } = await supabase.rpc('bootstrap_tenant', {
    p_company_name: companyName,
    p_full_name: fullName,
  })
  if (rpcErr) throw rpcErr

  // 3. Seed the default settings payloads (client-side because they're large)
  await seedDefaultSettings()

  return { needsEmailConfirmation: false }
}

export async function seedDefaultSettings() {
  // Each call is a settings row UPDATE keyed by tenant_id+setting_type (already inserted by RPC).
  const seeds = [
    ['rooms',                 { items: DEFAULT_ROOMS.map((r) => ({ key: r.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_'), label: r })) }],
    ['materials',             { items: DEFAULT_MATERIALS }],
    ['actions',               { items: DEFAULT_ACTIONS }],
    ['reasons',               { items: DEFAULT_REASONS }],
    ['final_statuses',        { items: DEFAULT_FINAL_STATUS }],
    ['meters',                { items: DEFAULT_METERS }],
    ['equipment',             { items: DEFAULT_EQUIPMENT }],
    ['work_item_types',       { items: DEFAULT_WORK_ITEM_TYPES }],
    ['loss_sources',          { items: DEFAULT_LOSS_SOURCES.map((s) => ({ key: s.toLowerCase().replace(/[^a-z0-9]+/g,'_'), label: s })) }],
    ['occupancy',             { items: DEFAULT_OCCUPANCY }],
    ['material_drying_goals', { items: DEFAULT_DRYING_GOALS }],
    ['scope_library',         { items: DEFAULT_SCOPE_LIBRARY }],
    ['qc_rules',              { rules: DEFAULT_QC_RULES }],
  ]
  for (const [type, data] of seeds) {
    // Upsert: insert if missing (some settings types may not be pre-created), update if exists
    const { error } = await supabase
      .from('settings')
      .upsert({ setting_type: type, data }, { onConflict: 'tenant_id,setting_type' })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Seed settings error', type, error)
    }
  }
}

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
