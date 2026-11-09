import type { NextRequest } from 'next/server';
import { clearFails, createSession, findUserForLogin, noteFail, normEmail, throttled, validEmail, verifyPassword } from '@/lib/db/auth';
import { isConfigured } from '@/lib/db/env';
import { json, sameSiteJson } from '@/lib/db/http';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!isConfigured()) return json({ error: '서비스 설정이 아직 끝나지 않았어요.' }, 503);
  if (!sameSiteJson(req)) return json({ error: '잘못된 요청이에요.' }, 403);
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = normEmail(b.email);
  const password = typeof b.password === 'string' && b.password.length <= 200 ? b.password : '';
  const wrong = () => json({ error: '이메일 또는 비밀번호가 맞지 않아요.' }, 401);
  if (!validEmail(email) || !password) return wrong();

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const key = `${ip}|${email}`;
  if (throttled(key)) return json({ error: '시도가 너무 많아요. 15분 뒤에 다시 해 주세요.' }, 429);

  const user = await findUserForLogin(email);
  // 없는 이메일이어도 같은 시간만큼 비밀번호 검사를 해서, 응답 속도로 가입 여부를 알아내지 못하게 한다.
  const ok = await verifyPassword(password, user?.hash ?? null);
  if (!user || !ok) { noteFail(key); return wrong(); }
  clearFails(key);
  await createSession(user.id);
  return json({ ok: true });
}
