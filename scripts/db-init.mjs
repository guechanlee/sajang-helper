// 스키마를 만든다. 여러 번 실행해도 안전하다(create if not exists).
// 사용: npm run db:init   (DATABASE_URL 은 환경변수 또는 .env.local 에서 읽는다)
import { readFileSync, existsSync } from 'node:fs';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
  }
}
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 없어요. .env.local 에 넣어 주세요.'); process.exit(1); }

const conn = await mysql.createConnection(url);
const strip = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
for (const stmt of strip(readFileSync('mysql/schema.sql', 'utf8')).split(';')) {
  if (stmt.trim()) await conn.query(stmt);
}
for (const stmt of strip(readFileSync('mysql/triggers.sql', 'utf8')).split(/^\/\/\s*$/m)) {
  if (stmt.trim()) await conn.query(stmt);
}
await conn.end();
console.log('스키마 준비 완료');
