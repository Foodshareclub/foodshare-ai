'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [passkeyAvailable, setPasskeyAvailable] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Check if WebAuthn is available
    setPasskeyAvailable(
      typeof window !== 'undefined' && 
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    )
  }, [])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (email !== 'tamerlanium@gmail.com') {
      setMessage('Unauthorized email')
      return
    }
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for the login link')
    }
    setLoading(false)
  }

  const handlePasskeyLogin = async () => {
    if (!email) {
      setMessage('Enter your email first')
      return
    }
    setLoading(true)
    setMessage('')
    
    try {
      // Get auth options
      const optionsRes = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth-options', email }),
      })
      const options = await optionsRes.json()
      
      if (options.error) {
        setMessage(options.error)
        setLoading(false)
        return
      }

      // Start WebAuthn authentication
      const credential = await startAuthentication(options)

      // Verify
      const verifyRes = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth-verify', credential, email, challengeId: options.challengeId }),
      })
      const result = await verifyRes.json()

      if (result.success) {
        setMessage(result.message || 'Check your email for login link')
      } else {
        setMessage(result.error || 'Authentication failed')
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setMessage('Passkey authentication was cancelled')
      } else {
        setMessage(err.message || 'Passkey authentication failed')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">FoodShare AI</h1>
          <p className="text-zinc-400 mt-2">Sign in to continue</p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            required
          />
          
          {passkeyAvailable && (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
              {loading ? 'Authenticating...' : 'Sign in with Fingerprint'}
            </button>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-zinc-950 text-zinc-500">or</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        {message && (
          <p className={`text-sm text-center ${message.includes('Check') ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
