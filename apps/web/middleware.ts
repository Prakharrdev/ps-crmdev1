import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. PERFORMANCE OPTIMIZATION: Skip middleware for public routes and API calls.
  // This prevents unnecessary network calls to Supabase Sydney for initial page loads and 
  // background API requests which already perform their own authentication.
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/quotation' ||
    pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')

  if (isPublicRoute || isApiRoute) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // 2. RESILIENCY OPTIMIZATION: Wrap the auth call in a timeout.
  // If the Sydney Supabase instance is slow, we'd rather the page load slowly than fail with a 504.
  // We use a 4s timeout. If it exceeds this, we proceed without session refresh.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase Auth Timeout')), 4000)
      )
    ])
  } catch (error) {
    console.warn('Middleware auth check timed out or failed:', error)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (skip API routes to reduce latency)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Media files (svg, png, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
