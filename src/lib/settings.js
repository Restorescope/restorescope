import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth.jsx'
import {
  DEFAULT_ROOMS, DEFAULT_MATERIALS, DEFAULT_ACTIONS, DEFAULT_REASONS,
  DEFAULT_FINAL_STATUS, DEFAULT_METERS, DEFAULT_EQUIPMENT,
  DEFAULT_WORK_ITEM_TYPES, DEFAULT_LOSS_SOURCES, DEFAULT_OCCUPANCY,
  DEFAULT_DRYING_GOALS, DEFAULT_SCOPE_LIBRARY, DEFAULT_QC_RULES,
  DEFAULT_SCREENING_RECOMMENDATIONS,
  DEFAULT_SPORE_PROFILE, DEFAULT_HANDLER_PROFILE,
} from './defaults'

const FACTORIES = {
  rooms:                 () => ({ items: DEFAULT_ROOMS.map((r) => ({ key: slug(r), label: r })) }),
  materials:             () => ({ items: DEFAULT_MATERIALS }),
  actions:               () => ({ items: DEFAULT_ACTIONS }),
  reasons:               () => ({ items: DEFAULT_REASONS }),
  final_statuses:        () => ({ items: DEFAULT_FINAL_STATUS }),
  meters:                () => ({ items: DEFAULT_METERS }),
  equipment:             () => ({ items: DEFAULT_EQUIPMENT }),
  work_item_types:       () => ({ items: DEFAULT_WORK_ITEM_TYPES }),
  loss_sources:          () => ({ items: DEFAULT_LOSS_SOURCES.map((s) => ({ key: slug(s), label: s })) }),
  occupancy:             () => ({ items: DEFAULT_OCCUPANCY }),
  material_drying_goals: () => ({ items: DEFAULT_DRYING_GOALS }),
  scope_library:         () => ({ items: DEFAULT_SCOPE_LIBRARY }),
  qc_rules:              () => ({ rules: DEFAULT_QC_RULES }),
  screening_recommendations: () => ({ items: DEFAULT_SCREENING_RECOMMENDATIONS }),
  spore_profile:         () => DEFAULT_SPORE_PROFILE,
  handler_profile:       () => DEFAULT_HANDLER_PROFILE,
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/**
 * useSetting — load a single setting type for the current tenant.
 *
 * IMPORTANT: every write must include tenant_id explicitly so the RLS
 * `with check` policy passes. We grab tenant_id from the auth context.
 *
 * If the row exists but is empty (`{items:[]}` or `{rules:[]}`), this hook
 * automatically seeds it with defaults.
 *
 * Returns: { data, loading, error, refresh, save }
 */
export function useSetting(settingType) {
  const { tenantId } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!tenantId) {
      // Auth not ready yet — wait
      setLoading(true)
      return
    }
    setLoading(true); setError(null)
    const { data: row, error: err } = await supabase
      .from('settings')
      .select('data')
      .eq('setting_type', settingType)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (err) {
      setError(err.message); setLoading(false); return
    }

    const payload = row?.data
    const isEmpty = !payload
      || (Array.isArray(payload.items) && payload.items.length === 0)
      || (Array.isArray(payload.rules) && payload.rules.length === 0)

    if (isEmpty && FACTORIES[settingType]) {
      const seeded = FACTORIES[settingType]()
      const { error: upErr } = await supabase
        .from('settings')
        .upsert(
          { tenant_id: tenantId, setting_type: settingType, data: seeded },
          { onConflict: 'tenant_id,setting_type' }
        )
      if (upErr) {
        // Fall back to in-memory defaults if write fails
        // eslint-disable-next-line no-console
        console.warn('Setting seed failed, using defaults in memory:', settingType, upErr)
        setData(seeded)
      } else {
        setData(seeded)
      }
    } else {
      setData(payload)
    }
    setLoading(false)
  }, [settingType, tenantId])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (newData) => {
    if (!tenantId) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('settings')
      .upsert(
        { tenant_id: tenantId, setting_type: settingType, data: newData },
        { onConflict: 'tenant_id,setting_type' }
      )
    if (err) throw err
    setData(newData)
  }, [settingType, tenantId])

  return { data, loading, error, refresh: load, save }
}
