import { NextResponse, type NextRequest } from 'next/server';
import { destroySession } from '@/lib/db/auth';

// 로그아웃은 POST로만. 링크 하나로 로그아웃되는 것을 막는다.
export async function POST(req: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}
