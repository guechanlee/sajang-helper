import type { NextRequest } from 'next/server';
import { createSession, normEmail, signUp, validEmail, validPassword } from '@/lib/db/auth';
import { isConfigured } from '@/lib/db/env';
import { json, sameSiteJson } from '@/lib/db/http';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!isConfigured()) return json({ error: '서비스 설정이 아직 끝나지 않았어요.' }, 503);
  if (!sameSiteJson(req)) return json({ error: '잘못된 요청이에요.' }, 403);
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = normEmail(b.email);
  if (!validEmail(email)) return json({ error: '이메일 주소를 확인해 주세요.' }, 400);
  if (!validPassword(b.password)) return json({ error: '비밀번호는 8자 이상으로 해 주세요.' }, 400);
  const r = await signUp(email, b.password);
  if (r === 'exists') return json({ error: '이미 가입된 이메일이에요. 로그인해 주세요.' }, 409);
  await createSession(r.id);
  return json({ ok: true });
}
