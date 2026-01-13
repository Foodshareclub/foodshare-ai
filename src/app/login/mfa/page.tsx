'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MFAPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [needsEnroll, setNeedsEnroll] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const supabase = createClient()

  useEffect(() => {
    checkMFA()
  }, [])

  const checkMFA = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.[0]

    if (totp?.status === 'verified') {
      setFactorId(totp.id)
    } else {
      setNeedsEnroll(true)
      enrollTOTP()
    }
  }

  const enrollTOTP = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) {
      setMessage(error.message)
      return
    }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    setLoading(true)
    setMessage('')

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) {
      setMessage(challengeError.message)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    })

    if (error) {
      setMessage(error.message)
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            {needsEnroll ? 'Setup MFA' : 'Verify MFA'}
          </h1>
          <p className="text-zinc-400 mt-2">
            {needsEnroll ? 'Scan QR code with your authenticator app' : 'Enter code from authenticator'}
          </p>
        </div>

        {qrCode && (
          <div className="flex justify-center">
            <img src={qrCode} alt="MFA QR Code" className="rounded-lg" />
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center text-2xl tracking-widest placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            maxLength={6}
            required
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3 px-4 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        {message && <p className="text-sm text-center text-red-400">{message}</p>}
      </div>
    </div>
  )
}
