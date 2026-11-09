import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { withCtx } from '@/lib/db/http';
import { pool } from '@/lib/db/pool';
import { rankPrograms, todayKst, type ProgramRow, type ProfileForPrograms } from '@/lib/programs';

export const dynamic = 'force-dynamic';

// 로그인한 사장님의 가게 정보(업종·상황·지역)로 공고를 추려서 돌려준다. programs 표는 서버만 읽는다.
export const POST = (req: NextRequest) => withCtx(req, async (ctx) => {
  if (!ctx.storeId) return { data: { items: [], total: 0, syncedAt: null }, error: null };
  const [[s]] = await pool().query<RowDataPacket[]>('SELECT status, biz_type, region FROM stores WHERE id = ?', [ctx.storeId]);
  const profile: ProfileForPrograms = { status: s?.status ?? 'run', biz_type: s?.biz_type ?? null, region: s?.region ?? null };
  const today = todayKst();
  const [rows] = await pool().query<RowDataPacket[]>(
    `SELECT id, name, summary, org, target, category, hashtags, apply_start, apply_end, apply_text, url
       FROM programs WHERE apply_end IS NULL OR apply_end >= ? ORDER BY id DESC LIMIT 5000`, [today]);
  const [[meta]] = await pool().query<RowDataPacket[]>('SELECT COUNT(*) n, MAX(synced_at) at FROM programs');
  const items = rankPrograms(rows as unknown as ProgramRow[], profile, today);
  return { data: { items, total: Number(meta?.n ?? 0), syncedAt: meta?.at ? String(meta.at).replace(' ', 'T') + 'Z' : null }, error: null };
});
