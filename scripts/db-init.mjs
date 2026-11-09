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
// 예전에 만든 DB에 새 컬럼 추가(여러 번 실행해도 안전).
const [cols] = await conn.query("select column_name from information_schema.columns where table_schema = database() and table_name = 'stores' and column_name = 'region'");
if (!cols.length) await conn.query("alter table stores add column region varchar(20) null check (region in ('서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'))");

// 예전 버전이 만든 트리거가 남아 있으면 지운다(트리거는 SUPER 권한이 없는 일반 사용자로는 만들 수 없어서 쓰지 않는다).
for (const t of ['invoice_items_same_store_ins', 'invoice_items_same_store_upd']) {
  try { await conn.query(`drop trigger if exists ${t}`); } catch { /* 권한이 없으면 그냥 둔다 */ }
}
await conn.end();
console.log('스키마 준비 완료');
