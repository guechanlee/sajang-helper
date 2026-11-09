import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser, storeIdOf } from './auth';
import { isConfigured } from './env';
import type { Ctx, Result } from './query';

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** 다른 사이트에서 몰래 보낸 요청(CSRF)을 막는다: JSON만 받고, Origin이 있으면 우리 주소와 같아야 한다. */
export function sameSiteJson(req: NextRequest): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}

/** API 공통 처리: 설정·출처·로그인 확인 후 ctx 로 핸들러를 실행한다. */
export async function withCtx(req: NextRequest, fn: (ctx: Ctx, body: unknown) => Promise<Result>) {
  if (!isConfigured()) return json({ data: null, error: { message: '서비스 설정이 아직 끝나지 않았어요.' } }, 503);
  if (!sameSiteJson(req)) return json({ data: null, error: { message: '잘못된 요청이에요.' } }, 403);
  const user = await getSessionUser();
  if (!user) return json({ data: null, error: { message: '로그인이 필요해요.', code: 'UNAUTH' } }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ data: null, error: { message: '요청이 올바르지 않아요.' } }, 400); }
  const res = await fn({ userId: user.id, storeId: await storeIdOf(user.id) }, body);
  return json(res, 200);
}
