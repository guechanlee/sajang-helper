import { NextResponse, type NextRequest } from 'next/server';

// 미들웨어는 DB에 못 붙는 환경(Edge)에서 돌아서 "세션 쿠키가 있는지"만 본다.
// 쿠키가 진짜 유효한지는 (app)/layout.tsx 와 /api 가 DB에서 다시 확인한다.
const PUBLIC = ['/', '/login', '/auth', '/privacy', '/api'];
const isPublic = (path: string) => PUBLIC.some((p) => path === p || (p !== '/' && path.startsWith(p + '/')));

export function middleware(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next(); // 설정 전에는 각 화면이 안내 문구를 보여준다.
  if (!req.cookies.has('sh_session') && !isPublic(req.nextUrl.pathname)) {
    const to = req.nextUrl.clone(); to.pathname = '/login'; to.search = '';
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
