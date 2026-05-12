import { useEffect, useState } from 'react'
import { useSetting } from '../../lib/settings'
import { useAuth } from '../../lib/auth.jsx'
import {
  Header, Section, Button, Card, CardHeader, CardBody, CardTitle,
  Input, Textarea, Badge,
} from '../../ui'

/**
 * SettingsSporeHandlerProfile — edit the dog (Spore) and handler/inspector
 * profile data shown on screening reports.
 *
 * Stored as two separate settings:
 *   - spore_profile   — name, breed, age, cert info, photo path, bio, tagline
 *   - handler_profile — handler name, title, certs list, years exp, bio
 *
 * Photo: this version only stores a path. For a real photo upload, you'd
 * drop the file into the `public/brand/` folder of the app — that's a
 * developer-facing setup, not a self-service upload. (Future polish.)
 */
export default function SettingsSporeHandlerProfile() {
  const { profile: userProfile } = useAuth()
  const spore = useSetting('spore_profile')
  const handler = useSetting('handler_profile')

  const [sporeForm, setSporeForm] = useState(null)
  const [handlerForm, setHandlerForm] = useState(null)
  const [savingSpore, setSavingSpore] = useState(false)
  const [savingHandler, setSavingHandler] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Initialize form state when settings load
  useEffect(() => {
    if (spore.data && !sporeForm) {
      setSporeForm({ ...spore.data })
    }
  }, [spore.data, sporeForm])

  useEffect(() => {
    if (handler.data && !handlerForm) {
      // Auto-populate handler full name from current user if blank
      const seedName = handler.data.full_name || userProfile?.full_name || ''
      setHandlerForm({
        ...handler.data,
        full_name: seedName,
        credentials: handler.data.credentials || [],
      })
    }
  }, [handler.data, handlerForm, userProfile])

  async function saveSpore() {
    setSavingSpore(true); setError(null); setSuccess(null)
    const ok = await spore.save(sporeForm)
    setSavingSpore(false)
    if (ok) {
      setSuccess('Spore profile saved.')
      setTimeout(() => setSuccess(null), 2000)
    } else {
      setError(spore.error || 'Save failed')
    }
  }

  async function saveHandler() {
    setSavingHandler(true); setError(null); setSuccess(null)
    const ok = await handler.save(handlerForm)
    setSavingHandler(false)
    if (ok) {
      setSuccess('Handler profile saved.')
      setTimeout(() => setSuccess(null), 2000)
    } else {
      setError(handler.error || 'Save failed')
    }
  }

  function setSporeField(k, v) {
    setSporeForm((f) => ({ ...f, [k]: v }))
  }
  function setHandlerField(k, v) {
    setHandlerForm((f) => ({ ...f, [k]: v }))
  }

  function addCredential() {
    setHandlerForm((f) => ({
      ...f,
      credentials: [...(f.credentials || []), { label: '', number: '' }],
    }))
  }
  function updateCredential(idx, key, value) {
    setHandlerForm((f) => ({
      ...f,
      credentials: f.credentials.map((c, i) => i === idx ? { ...c, [key]: value } : c),
    }))
  }
  function removeCredential(idx) {
    setHandlerForm((f) => ({
      ...f,
      credentials: f.credentials.filter((_, i) => i !== idx),
    }))
  }

  if (!sporeForm || !handlerForm) {
    return (
      <div className="min-h-screen bg-ink-50">
        <Header breadcrumb={[
          { label: 'Settings', to: '/settings' },
          { label: 'Spore & Handler Profile' },
        ]} />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 text-ink-500">Loading…</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <Header breadcrumb={[
        { label: 'Settings', to: '/settings' },
        { label: 'Spore & Handler Profile' },
      ]} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-danger rounded p-3 text-sm">{error}</div>
        )}
        {success && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">{success}</div>
        )}

        <p className="text-sm text-ink-600">
          These profiles appear on the credential pages of every mold screening report.
          Update them as certifications are issued or details change.
        </p>

        {/* Spore profile */}
        <Card>
          <CardHeader>
            <CardTitle>🐕 Spore — Mold Detection Canine</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              The dog's information. Photo is loaded from <code className="bg-ink-100 px-1 rounded text-xs">public/brand/spore.png</code> —
              replace that file when you have a high-resolution photo.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Name" value={sporeForm.name} onChange={(e) => setSporeField('name', e.target.value)} />
              <Input label="Tagline" placeholder="Certified Mold Detection Canine" value={sporeForm.tagline} onChange={(e) => setSporeField('tagline', e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Breed (optional)" value={sporeForm.breed} onChange={(e) => setSporeField('breed', e.target.value)} />
              <Input label="Age (years, optional)" value={sporeForm.age_years} onChange={(e) => setSporeField('age_years', e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Certifying body" value={sporeForm.certifying_body} onChange={(e) => setSporeField('certifying_body', e.target.value)} />
              <Input label="Certification #" placeholder="When issued" value={sporeForm.certification_no} onChange={(e) => setSporeField('certification_no', e.target.value)} />
            </div>
            <Input label="Certified date" type="date" value={sporeForm.certified_date} onChange={(e) => setSporeField('certified_date', e.target.value)} />
            <Textarea
              label="Bio"
              rows={5}
              value={sporeForm.bio}
              onChange={(e) => setSporeField('bio', e.target.value)}
              hint="Shown on the Spore credential page in the report."
            />
            <Input
              label="Photo path"
              value={sporeForm.photo_path}
              onChange={(e) => setSporeField('photo_path', e.target.value)}
              hint="Default: /brand/spore.png — place your photo in public/brand/spore.png."
            />
            <div className="flex justify-end">
              <Button onClick={saveSpore} loading={savingSpore}>Save Spore profile</Button>
            </div>
          </CardBody>
        </Card>

        {/* Handler profile */}
        <Card>
          <CardHeader>
            <CardTitle>👤 Handler / Inspector profile</CardTitle>
            <p className="text-sm text-ink-600 mt-1">
              Your professional credentials shown on the handler credential page.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Full name" value={handlerForm.full_name} onChange={(e) => setHandlerField('full_name', e.target.value)} />
              <Input label="Title" placeholder="Certified Mold Detection Canine Handler" value={handlerForm.title} onChange={(e) => setHandlerField('title', e.target.value)} />
            </div>

            <div className="bg-ink-50 border border-ink-200 rounded p-3 space-y-2">
              <p className="text-sm font-semibold text-ink-700">Handler training</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input label="Training body" value={handlerForm.handler_cert_body} onChange={(e) => setHandlerField('handler_cert_body', e.target.value)} />
                <Input label="Handler cert #" placeholder="When issued" value={handlerForm.handler_cert_no} onChange={(e) => setHandlerField('handler_cert_no', e.target.value)} />
              </div>
              <Input label="Handler cert date" type="date" value={handlerForm.handler_cert_date} onChange={(e) => setHandlerField('handler_cert_date', e.target.value)} />
            </div>

            <Input label="Years experience" type="number" value={handlerForm.years_experience} onChange={(e) => setHandlerField('years_experience', e.target.value)} />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-700">Industry credentials</p>
                <Button size="sm" variant="secondary" onClick={addCredential}>+ Add credential</Button>
              </div>
              <p className="text-xs text-ink-600">
                e.g. AHERA Building Inspector, IICRC AMRT (Applied Microbial Remediation Technician), IICRC WRT (Water Restoration), IICRC ASD (Applied Structural Drying).
              </p>
              {(handlerForm.credentials || []).length === 0 ? (
                <p className="text-xs text-ink-500 italic">No credentials added yet. Click "Add credential" to add your professional certifications.</p>
              ) : (
                <ul className="space-y-2">
                  {handlerForm.credentials.map((c, idx) => (
                    <li key={idx} className="flex gap-2 items-end">
                      <Input
                        label="Credential"
                        placeholder="e.g. IICRC AMRT"
                        value={c.label}
                        onChange={(e) => updateCredential(idx, 'label', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        label="Cert / License #"
                        placeholder="Optional"
                        value={c.number}
                        onChange={(e) => updateCredential(idx, 'number', e.target.value)}
                        className="flex-1"
                      />
                      <Button size="sm" variant="ghost" onClick={() => removeCredential(idx)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Textarea
              label="Professional bio"
              rows={5}
              value={handlerForm.bio}
              onChange={(e) => setHandlerField('bio', e.target.value)}
              hint="Shown on the handler credential page in the report."
            />

            <div className="flex justify-end">
              <Button onClick={saveHandler} loading={savingHandler}>Save handler profile</Button>
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}
