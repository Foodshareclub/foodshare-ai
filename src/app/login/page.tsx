'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClient()

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
