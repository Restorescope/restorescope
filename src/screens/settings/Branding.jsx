import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth.jsx'
import { useBranding, DEFAULT_BRANDING, getLogoUrl } from '../../lib/branding.jsx'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle, Input,
} from '../../ui'

/**
 * Settings → Branding (Owner only)
 *
 * Edits the per-tenant branding row in the settings table:
 *   - Company name, phone, email, address, tagline (text fields)
 *   - Logo upload to storage bucket 'branding-assets'
 *   - Color palette (5 colors: primary, primary-dark, primary-light,
 *     accent, accent-dark) via manual color pickers
 *
 * On save, BrandingProvider context is refreshed which re-applies CSS
 * variables to :root — the entire app re-themes immediately.
 *
 * "Restore defaults" reverts to original 1-800 WATER DAMAGE of North Dakota
 * branding.
 */
export default function Branding() {
  const { profile } = useAuth()
  const { branding, refresh } = useBranding()

  const [form, setForm] = useState(() => structuredClone(branding))
  const [logoUrl, setLogoUrl] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Keep form in sync when branding context loads
  useEffect(() => { setForm(structuredClone(branding)) }, [branding])

  // Resolve current saved logo to a signed URL for preview
  useEffect(() => {
    let cancelled = false
    async function load() {
      const url = await getLogoUrl(branding.logo_path)
      if (!cancelled) setLogoUrl(url)
    }
    load()
    return () => { cancelled = true }
  }, [branding.logo_path])

  // When a new file is picked, build a preview URL
  useEffect(() => {
    if (!logoFile) { setLogoPreviewUrl(null); return }
    const url = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  function updateColor(key, value) {
    setForm((f) => ({ ...f, colors: { ...f.colors, [key]: value } }))
  }
  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function uploadLogoIfNeeded() {
    if (!logoFile) return form.logo_path
    const ext = logoFile.name.split('.').pop().toLowerCase() || 'png'
    const path = `${profile.tenant_id}/logo.${ext}`
    const { error: upErr } = await supabase
      .storage
      .from('branding-assets')
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type })
    if (upErr) throw upErr
    return path
  }

  async function save() {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const logo_path = await uploadLogoIfNeeded()
      const payload = { ...form, logo_path }
      const { error: err } = await supabase
        .from('settings')
        .upsert(
          { tenant_id: profile.tenant_id, setting_type: 'branding', data: payload },
          { onConflict: 'tenant_id,setting_type' },
        )
      if (err) throw err
      setLogoFile(null)
      await refresh()
      setSuccess('Branding saved. Changes are live.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function restoreDefaults() {
    if (!confirm('Restore all branding to the original 1-800 WATER DAMAGE of North Dakota defaults? This will not delete your uploaded logo, but will reset all text and colors.')) return
    setForm({ ...structuredClone(DEFAULT_BRANDING), logo_path: form.logo_path })
  }

  const currentLogoSrc = logoPreviewUrl || logoUrl

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Branding' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-4">

        <Section
          title="Branding"
          description="Customize how your business appears throughout the app — name, contact info, logo, and color palette. Changes apply immediately to every screen the moment you save."
        />

        {/* Company info */}
        <Card>
          <CardHeader><CardTitle>Company info</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Input
              label="Company name"
              value={form.company_name || ''}
              onChange={(e) => updateField('company_name', e.target.value)}
            />
            <Input
              label="Phone"
              value={form.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={form.email || ''}
              onChange={(e) => updateField('email', e.target.value)}
            />
            <Input
              label="Address"
              value={form.address || ''}
              onChange={(e) => updateField('address', e.target.value)}
            />
            <Input
              label="Tagline"
              value={form.tagline || ''}
              onChange={(e) => updateField('tagline', e.target.value)}
            />
          </CardBody>
        </Card>

        {/* Logo */}
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <p className="text-xs text-ink-500 mt-1">PNG, JPG, or SVG. Recommended square or wide aspect ratio.</p>
          </CardHeader>
          <CardBody className="space-y-3">
            {currentLogoSrc && (
              <div className="flex items-center gap-3 p-3 bg-ink-100 rounded">
                <img
                  src={currentLogoSrc}
                  alt="Current logo"
                  className="h-16 max-w-[160px] object-contain"
                />
                <p className="text-xs text-ink-600">
                  {logoFile ? `New (unsaved): ${logoFile.name}` : 'Current logo'}
                </p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              className="block text-sm text-ink-700"
            />
          </CardBody>
        </Card>

        {/* Color palette */}
        <Card>
          <CardHeader>
            <CardTitle>Color palette</CardTitle>
            <p className="text-xs text-ink-500 mt-1">Click any swatch to change.</p>
          </CardHeader>
          <CardBody className="space-y-3">
            <ColorRow
              label="Primary"
              hint="Buttons, headers, main accents"
              value={form.colors?.primary}
              onChange={(v) => updateColor('primary', v)}
            />
            <ColorRow
              label="Primary (dark)"
              hint="Button hover, deeper shade"
              value={form.colors?.primary_dark}
              onChange={(v) => updateColor('primary_dark', v)}
            />
            <ColorRow
              label="Primary (light)"
              hint="Subtle backgrounds, hover states"
              value={form.colors?.primary_light}
              onChange={(v) => updateColor('primary_light', v)}
            />
            <ColorRow
              label="Accent"
              hint="Highlights, key calls to action"
              value={form.colors?.accent}
              onChange={(v) => updateColor('accent', v)}
            />
            <ColorRow
              label="Accent (dark)"
              hint="Accent hover and borders"
              value={form.colors?.accent_dark}
              onChange={(v) => updateColor('accent_dark', v)}
            />
            <BrandPreview colors={form.colors} />
          </CardBody>
        </Card>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
            ✓ {success}
          </div>
        )}

        {/* Actions */}
        <div className="sticky bottom-0 bg-ink-50 py-3 -mx-4 sm:mx-0 px-4 sm:px-0 border-t sm:border-0 border-ink-200 flex gap-2 justify-end">
          <Button variant="ghost" onClick={restoreDefaults}>Restore defaults</Button>
          <Button onClick={save} loading={saving} size="lg">Save branding</Button>
        </div>
      </main>
    </div>
  )
}

function ColorRow({ label, hint, value, onChange }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-16 rounded border border-ink-300 cursor-pointer"
      />
      <div className="flex-1 min-w-[180px]">
        <label className="block text-sm font-semibold text-ink-900">{label}</label>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm px-2 py-1 border border-ink-300 rounded w-24"
        placeholder="#000000"
      />
    </div>
  )
}

function BrandPreview({ colors }) {
  const c = colors || {}
  return (
    <div className="border-2 border-dashed border-ink-300 rounded p-4 space-y-3 mt-2">
      <p className="text-xs uppercase tracking-wider text-ink-500 font-semibold">Live preview (not yet saved)</p>
      <div
        className="px-4 py-3 rounded text-white font-bold"
        style={{ backgroundColor: c.primary, borderBottom: `3px solid ${c.accent}` }}
      >
        Header — Primary background, accent stripe
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="px-4 py-2 rounded font-semibold text-white"
          style={{ backgroundColor: c.primary }}
        >
          Primary button
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded font-semibold"
          style={{ backgroundColor: c.accent, color: c.primary_dark }}
        >
          Accent button
        </button>
        <span
          className="px-3 py-1 rounded text-xs font-semibold inline-flex items-center"
          style={{ backgroundColor: c.primary_light, color: 'white' }}
        >
          Badge
        </span>
      </div>
    </div>
  )
}
