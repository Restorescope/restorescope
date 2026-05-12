import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signUpAndBootstrap } from '../../lib/auth.jsx'
import { Button, Input, Logo } from '../../ui'

export default function Signup() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('1-800 WATER DAMAGE of North Dakota')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const { needsEmailConfirmation } = await signUpAndBootstrap({
        email, password, companyName, fullName,
      })
      if (needsEmailConfirmation) setConfirmEmail(true)
      else navigate('/jobs')
    } catch (err) {
      setError(err.message || 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  if (confirmEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-100 px-4">
        <div className="bg-white rounded-lg shadow-card border border-ink-200 p-6 max-w-sm text-center">
          <h2 className="font-semibold text-lg text-ink-900 mb-2">Check your email</h2>
          <p className="text-sm text-ink-700">
            We sent a confirmation link to <strong>{email}</strong>. Click it, then sign in to finish setting up your company.
          </p>
          <Link to="/login" className="block mt-4 text-brand-blue font-semibold">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-100 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex bg-brand-blue p-3 rounded-lg shadow-card mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="font-condensed font-bold text-3xl text-brand-blue tracking-wide">
            RESTORESCOPE
          </h1>
          <p className="text-sm text-ink-600 mt-1">
            1-800 WATER DAMAGE of North Dakota
          </p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-lg shadow-card border border-ink-200 p-6 space-y-4">
          <h2 className="font-semibold text-lg text-ink-900">Create your company account</h2>
          <p className="text-xs text-ink-600">You'll be the Owner. Add PMs and Technicians later from Settings → Team.</p>

          <Input label="Company name" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="Your name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="8+ characters" />

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Create account
          </Button>
          <p className="text-sm text-center text-ink-600">
            Already have one?{' '}
            <Link to="/login" className="text-brand-blue font-semibold">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
