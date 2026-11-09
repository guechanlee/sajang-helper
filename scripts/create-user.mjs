// 계정을 만든다. 이미 있는 이메일이면 비밀번호만 바꾼다(비밀번호 재설정 기능이 없어서 이걸 쓴다).
// 사용: node scripts/create-user.mjs 이메일 비밀번호
//   Docker:  docker compose exec app node scripts/create-user.mjs 이메일 비밀번호
import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const [email, password] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]];
if (!email || !password) { console.error('사용법: node scripts/create-user.mjs 이메일 비밀번호'); process.exit(1); }
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { console.error('이메일 형식이 올바르지 않아요.'); process.exit(1); }
if (password.length < 8 || password.length > 200) { console.error('비밀번호는 8자 이상 200자 이하여야 해요.'); process.exit(1); }

if (!process.env.DATABASE_URL && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
  }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL 이 없어요.'); process.exit(1); }

// src/lib/db/auth.ts 의 hashPassword 와 같은 방식(scrypt, 64바이트, 16바이트 솔트)이어야 로그인된다.
const salt = randomBytes(16);
const key = await new Promise((res, rej) => scrypt(password, salt, 64, (e, k) => (e ? rej(e) : res(k))));
const hash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id]);
    await conn.query('DELETE FROM sessions WHERE user_id = ?', [rows[0].id]); // 예전 로그인은 모두 끊는다
    console.log(`비밀번호를 바꿨어요: ${email}`);
  } else {
    const id = randomUUID();
    await conn.beginTransaction();
    await conn.query('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [id, email, hash]);
    await conn.query('INSERT INTO stores (id, owner_id) VALUES (?, ?)', [randomUUID(), id]);
    await conn.commit();
    console.log(`계정을 만들었어요: ${email}`);
  }
} finally {
  await conn.end();
}
