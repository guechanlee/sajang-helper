// 기업마당의 정부 지원사업 공고를 내려받아 programs 표에 저장한다(이미 있는 공고는 갱신).
// 사용: npm run programs:sync        (BIZINFO_API_KEY 는 환경변수 또는 .env.local 에 둔다)
//   Docker:  docker compose exec app node scripts/sync-programs.mjs
// 하루 한 번쯤 돌리면 충분하다(cron 등). 키가 없으면 아무것도 하지 않고 안내만 한다.
import { existsSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { normalize } from './lib/bizinfo.mjs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { DATABASE_URL, BIZINFO_API_KEY } = process.env;
const API = process.env.BIZINFO_API_URL || 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';
const COUNT = Math.min(Math.max(Number(process.env.BIZINFO_COUNT) || 500, 1), 2000);

if (!DATABASE_URL) { console.error('DATABASE_URL 이 없어요.'); process.exit(1); }
if (!BIZINFO_API_KEY) {
  console.error('BIZINFO_API_KEY 가 없어요. 기업마당(bizinfo.go.kr)에서 정책정보 개방 사용 신청을 하고 받은 키를 .env.local 에 넣어 주세요.');
  process.exit(1);
}

const url = `${API}?${new URLSearchParams({ crtfcKey: BIZINFO_API_KEY, dataType: 'json', searchCnt: String(COUNT) })}`;
let body;
try {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  body = await res.json();
} catch (e) {
  // 키가 주소에 들어 있으니 오류 메시지에 주소를 그대로 찍지 않는다.
  console.error('기업마당 API 호출에 실패했어요:', e instanceof Error ? e.message : e);
  process.exit(1);
}
if (body?.reqErr) { console.error('기업마당이 오류를 돌려줬어요:', body.reqErr); process.exit(1); }
if (!Array.isArray(body?.jsonArray)) {
  console.error('응답 모양이 예상과 달라요(jsonArray 없음). API 문서가 바뀌었는지 확인해 주세요.');
  process.exit(1);
}

const rows = [];
let skipped = 0;
for (const item of body.jsonArray) {
  const r = normalize(item);
  if (r) rows.push(r); else skipped++;
}
if (!rows.length) { console.error('저장할 공고가 없어요. 기존 데이터는 그대로 둡니다.'); process.exit(1); }

const COLS = ['source', 'ext_id', 'name', 'summary', 'org', 'target', 'category', 'hashtags', 'apply_start', 'apply_end', 'apply_text', 'url'];
const conn = await mysql.createConnection(DATABASE_URL);
try {
  await conn.beginTransaction();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await conn.query(
      `INSERT INTO programs (${COLS.join(', ')}, synced_at) VALUES ${chunk.map(() => `(${COLS.map(() => '?').join(', ')}, NOW(3))`).join(', ')}
       ON DUPLICATE KEY UPDATE ${COLS.slice(2).map((c) => `${c} = VALUES(${c})`).join(', ')}, synced_at = NOW(3)`,
      chunk.flatMap((r) => COLS.map((c) => r[c])));
  }
  // 마감한 지 두 달이 지난 공고는 정리한다.
  const [del] = await conn.query('DELETE FROM programs WHERE apply_end IS NOT NULL AND apply_end < DATE_SUB(CURDATE(), INTERVAL 60 DAY)');
  await conn.commit();
  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM programs');
  console.log(`공고 ${rows.length}건 저장(건너뜀 ${skipped}건, 오래된 공고 ${del.affectedRows}건 정리). 지금 표에는 ${n}건이 있어요.`);
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  await conn.end();
}
