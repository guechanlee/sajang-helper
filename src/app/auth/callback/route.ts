import { NextResponse, type NextRequest } from 'next/server';
import { sbServer } from '@/lib/supabase/server';

// 로그인 메일의 링크가 돌아오는 곳. 한 번만 쓸 수 있는 코드를 세션으로 바꾼다.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  // 열린 리다이렉트 방지: 같은 사이트의 상대 경로만 허용한다.
  const next = searchParams.get('next');
  const safeNext = next && /^\/[A-Za-z0-9/_-]*$/.test(next) && !next.startsWith('//') ? next : '/subsidy';
  if (code) {
    const { error } = await (await sbServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
