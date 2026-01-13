import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ALLOWED_EMAIL = 'tamerlanium@gmail.com'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Public paths
  if (path === '/login' || path.startsWith('/api/') || path.startsWith('/auth/')) {
    return response
  }

  // Not logged in -> login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Wrong user -> logout
  if (user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
  }

  // Check MFA for dashboard
  if (path.startsWith('/dashboard')) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/login/mfa', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
