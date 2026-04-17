import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import type { Database } from '@/src/types/database.types';
import { gamificationService, GAMIFICATION_CONFIG } from '@/src/lib/gamification';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // `cookies()` from next/headers gives us the mutable cookie store for this
  // request.  Any `cookieStore.set()` calls are automatically merged into the
  // response headers (including redirects) by Next.js — no manual copy needed.
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In some Server Component contexts setAll is not available; safe to ignore.
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('[auth/callback] exchange error:', error?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = data.session.user;

  // Auto-create a profiles row for first-time Google OAuth users.
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();



  if (!existing) {
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        role: 'citizen',
      },
      { onConflict: 'id' },
    );

    // Login bonus for first-time citizens
    await gamificationService.awardPoints(user.id, GAMIFICATION_CONFIG.POINTS_LOGIN_BONUS, 'login_bonus');
  }

  return NextResponse.redirect(`${origin}/citizen`);
}

