import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/login', '/auth', '/privacy'];
const isPublic = (path: string) => PUBLIC.some((p) => path === p || (p !== '/' && path.startsWith(p + '/')));

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next(); // 설정 전에는 각 화면이 안내 문구를 보여준다.

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser(); // 서버에서 토큰을 검증한다(쿠키 값만 믿지 않는다).
  const path = req.nextUrl.pathname;

  if (!user && !isPublic(path)) {
    const to = req.nextUrl.clone(); to.pathname = '/login'; to.search = '';
    return NextResponse.redirect(to);
  }
  if (user && path === '/login') {
    const to = req.nextUrl.clone(); to.pathname = '/subsidy'; to.search = '';
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
