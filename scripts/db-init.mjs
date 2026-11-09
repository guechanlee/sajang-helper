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
// 이미 만들어진 DB에 새로 생긴 열을 더한다(MySQL은 add column if not exists 가 없어서 직접 확인한다).
const dbName = (await conn.query('select database() d'))[0][0].d;
async function addColumn(table, col, ddl) {
  const [r] = await conn.query('select 1 from information_schema.columns where table_schema = ? and table_name = ? and column_name = ?', [dbName, table, col]);
  if (!r.length) await conn.query(`alter table ${table} add column ${col} ${ddl}`);
}
await addColumn('stores', 'address', "varchar(120) not null default ''");
await addColumn('stores', 'phone', "varchar(30) not null default ''");
await addColumn('stores', 'biz_no', "varchar(12) not null default ''");
await addColumn('stores', 'place_url', "varchar(300) not null default ''");
await addColumn('stores', 'place_id', "varchar(20) not null default ''");
// 예전 버전이 만든 트리거가 남아 있으면 지운다(트리거는 SUPER 권한이 없는 일반 사용자로는 만들 수 없어서 쓰지 않는다).
for (const t of ['invoice_items_same_store_ins', 'invoice_items_same_store_upd']) {
  try { await conn.query(`drop trigger if exists ${t}`); } catch { /* 권한이 없으면 그냥 둔다 */ }
}
await conn.end();
console.log('스키마 준비 완료');
