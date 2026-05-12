import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signIn } from '../../lib/auth.jsx'
import { Button, Input, Logo } from '../../ui'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await signIn({ email, password })
      navigate('/jobs')
    } catch (err) {
      setError(err.message || 'Sign in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-100 px-4">
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
          <p className="text-xs text-ink-500 italic mt-1">Restoring What Matters Most™</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-lg shadow-card border border-ink-200 p-6 space-y-4">
          <h2 className="font-semibold text-lg text-ink-900">Sign in</h2>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Sign in
          </Button>
          <p className="text-sm text-center text-ink-600">
            New here?{' '}
            <Link to="/signup" className="text-brand-blue font-semibold">Create an account</Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          701-670-2022 · 1800waterdamage.com/north-dakota
        </p>
      </div>
    </div>
  )
}
