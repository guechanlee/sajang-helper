import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { pool } from './pool';
import type { RowDataPacket } from 'mysql2';

export const COOKIE = 'sh_session';
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string };

export const normEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// scrypt는 일부러 느려서, 아주 긴 비밀번호로 서버를 붙잡지 못하게 길이를 제한한다.
export const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 8 && p.length <= 200;

const kdf = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await kdf(pw, salt)).toString('hex')}`;
}

const DUMMY = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export async function verifyPassword(pw: string, stored: string | null) {
  const [alg, saltHex, hashHex] = (stored ?? DUMMY).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, 'hex');
  const got = await kdf(pw, Buffer.from(saltHex, 'hex'));
  return want.length === got.length && timingSafeEqual(want, got) && stored !== null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await pool().query('DELETE FROM sessions WHERE expires_at < NOW(3)');
  await pool().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL ? DAY))',
    [sha(token), userId, SESSION_DAYS],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await pool().query('DELETE FROM sessions WHERE token_hash = ?', [sha(token)]);
  jar.delete(COOKIE);
}

/** 쿠키의 세션이 DB에 있고 아직 안 끝났을 때만 사용자를 돌려준다. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [rows] = await pool().query<RowDataPacket[]>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW(3)`, [sha(token)]);
  return rows[0] ? { id: rows[0].id as string, email: rows[0].email as string } : null;
}

export async function signUp(email: string, password: string): Promise<{ id: string } | 'exists'> {
  const id = randomUUID();
  const hash = await hashPassword(password);
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [id, email, hash]);
    await conn.query('INSERT INTO stores (id, owner_id) VALUES (?, ?)', [randomUUID(), id]); // 가입하면 빈 가게 하나
    await conn.commit();
    return { id };
  } catch (e) {
    await conn.rollback();
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return 'exists';
    throw e;
  } finally {
    conn.release();
  }
}

export async function findUserForLogin(email: string) {
  const [rows] = await pool().query<RowDataPacket[]>('SELECT id, password_hash FROM users WHERE email = ?', [email]);
  return rows[0] ? { id: rows[0].id as string, hash: rows[0].password_hash as string } : null;
}

export async function storeIdOf(userId: string): Promise<string | null> {
  const [rows] = await pool().query<RowDataPacket[]>('SELECT id FROM stores WHERE owner_id = ?', [userId]);
  return rows[0] ? (rows[0].id as string) : null;
}

// 로그인 실패 횟수 제한(프로세스 메모리 기준). 서버를 여러 대 두면 DB나 Redis로 옮겨야 한다.
const fails = new Map<string, { n: number; last: number }>();
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
export function throttled(key: string) {
  const f = fails.get(key);
  return !!f && f.n >= MAX_FAILS && Date.now() - f.last < LOCK_MS;
}
export function noteFail(key: string) {
  const now = Date.now();
  const f = fails.get(key);
  fails.set(key, { n: f && now - f.last < LOCK_MS ? f.n + 1 : 1, last: now });
  if (fails.size > 5000) for (const [k, v] of fails) if (now - v.last >= LOCK_MS) fails.delete(k);
}
export const clearFails = (key: string) => void fails.delete(key);
