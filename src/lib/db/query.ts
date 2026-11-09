import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from './pool';
import { TABLES, type ColType, type Table } from './schema';

// 브라우저의 "가게 데이터 요청"을 안전한 SQL로 바꿔 실행한다.
// 보안 규칙: (1) 표·열 이름은 schema.ts 의 목록에 있는 것만 쓴다. (2) 값은 항상 ? 로 넘긴다.
// (3) 모든 요청에 "내 가게 행만" 조건을 서버가 붙인다(브라우저가 보낸 store_id는 믿지 않는다).

export type Filter = { col: string; op: 'eq' | 'in' | 'gte' | 'lte'; val: unknown };
export type Req = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  columns?: string;
  values?: unknown;
  filters?: Filter[];
  order?: { col: string; asc: boolean }[];
  limit?: number;
  returning?: string | null;
  single?: 'single' | 'maybe' | null;
};
export type Ctx = { userId: string; storeId: string | null };
export type Result = { data: unknown; error: { message: string; code?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class Bad extends Error {}
const bad = (m: string): never => { throw new Bad(m); };

const q = (name: string) => '`' + name + '`';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function table(name: unknown): Table {
  const t = typeof name === 'string' && Object.hasOwn(TABLES, name) ? TABLES[name] : undefined;
  return t ?? bad('알 수 없는 표예요.');
}

function colList(t: Table, spec: unknown): string[] {
  if (spec == null || spec === '*' || spec === '') return Object.keys(t.cols);
  if (typeof spec !== 'string') return bad('열 목록이 올바르지 않아요.');
  const cols = spec.split(',').map((c) => c.trim()).filter(Boolean);
  if (!cols.length || cols.length > 40) return bad('열 목록이 올바르지 않아요.');
  for (const c of cols) if (!Object.hasOwn(t.cols, c)) bad('알 수 없는 열이에요.');
  return cols;
}

function checkValue(type: ColType, v: unknown): unknown {
  if (v === null) return null;
  switch (type) {
    case 'num': return typeof v === 'number' && Number.isFinite(v) ? v : bad('숫자가 올바르지 않아요.');
    case 'bool': return typeof v === 'boolean' ? (v ? 1 : 0) : bad('값이 올바르지 않아요.');
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : bad('날짜가 올바르지 않아요.');
    case 'ts': return bad('시각은 직접 넣을 수 없어요.');
    default: return typeof v === 'string' && v.length <= 200 ? v : bad('글자가 올바르지 않아요.');
  }
}

/** 내 가게 행만 보이게 하는 조건 + 브라우저가 보낸 필터. */
function where(t: Table, ctx: Ctx, filters: Filter[] | undefined, params: unknown[]): string {
  const owner = t.scope === 'owner_id' ? ctx.userId : ctx.storeId;
  if (!owner) return bad('가게가 없어요.');
  const parts = [`${q(t.scope)} = ?`];
  params.push(owner);
  for (const f of filters ?? []) {
    if (!isObj(f) || typeof f.col !== 'string' || !Object.hasOwn(t.cols, f.col)) bad('필터가 올바르지 않아요.');
    const type = t.cols[f.col]!;
    if (f.op === 'in') {
      if (!Array.isArray(f.val) || f.val.length > 500) bad('필터가 올바르지 않아요.');
      const arr = f.val as unknown[];
      if (!arr.length) { parts.push('1 = 0'); continue; }
      parts.push(`${q(f.col)} IN (${arr.map(() => '?').join(',')})`);
      for (const x of arr) params.push(checkValue(type === 'ts' ? 'str' : type, x));
    } else if (f.op === 'eq' || f.op === 'gte' || f.op === 'lte') {
      if (f.val === null) bad('필터가 올바르지 않아요.');
      parts.push(`${q(f.col)} ${{ eq: '=', gte: '>=', lte: '<=' }[f.op]} ?`);
      params.push(checkValue(type === 'ts' ? 'str' : type, f.val));
    } else bad('필터가 올바르지 않아요.');
  }
  return parts.join(' AND ');
}

const iso = (s: string) => s.replace(' ', 'T') + 'Z';
function shape(t: Table, rows: RowDataPacket[]) {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) { o[k] = null; continue; }
      const type = t.cols[k];
      o[k] = type === 'bool' ? Boolean(v) : type === 'ts' ? iso(String(v)) : v;
    }
    return o;
  });
}

function rowsToWrite(t: Table, ctx: Ctx, values: unknown, forInsert: boolean): Record<string, unknown>[] {
  const list = Array.isArray(values) ? values : [values];
  if (!list.length || list.length > 500) bad('저장할 값이 올바르지 않아요.');
  return list.map((raw) => {
    if (!isObj(raw)) return bad('저장할 값이 올바르지 않아요.');
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!Object.hasOwn(t.cols, k)) bad('알 수 없는 열이에요.');
      // 서버가 정하는 열(id, store_id, owner_id …)은 브라우저 값을 무시한다. store_id는 아래에서 덮어쓴다.
      if (t.locked.includes(k)) {
        if (forInsert && (k === 'store_id' || k === 'owner_id')) continue;
        // 화면이 서로 연결된 행(재료↔메뉴 줄)을 한 번에 넣으려고 id를 미리 만들어 보낸다. 새 행을 넣을 때만 UUID 형식이면 받는다.
        // (이미 있는 id면 기본키 중복으로 실패할 뿐, 남의 행을 덮어쓰지 못한다.)
        if (forInsert && k === 'id' && t.hasId && typeof v === 'string' && UUID.test(v)) { out.id = v; continue; }
        bad('이 값은 바꿀 수 없어요.');
      }
      out[k] = checkValue(t.cols[k]!, v);
    }
    if (forInsert) {
      if (t.hasId && !out.id) out.id = randomUUID();
      if (t.scope === 'owner_id') out.owner_id = ctx.userId;
      else out.store_id = ctx.storeId ?? bad('가게가 없어요.');
    }
    return out;
  });
}

async function selectRows(conn: PoolConnection | ReturnType<typeof pool>, t: Table, cols: string[], whereSql: string,
  params: unknown[], order?: Req['order'], limit?: number) {
  let sql = `SELECT ${cols.map(q).join(', ')} FROM ${q(tableName(t))} WHERE ${whereSql}`;
  if (order?.length) {
    sql += ' ORDER BY ' + order.map((o) => {
      if (typeof o.col !== 'string' || !Object.hasOwn(t.cols, o.col)) bad('정렬이 올바르지 않아요.');
      return `${q(o.col)} ${o.asc === false ? 'DESC' : 'ASC'}`;
    }).join(', ');
  }
  sql += ' LIMIT ?';
  params.push(Number.isInteger(limit) && limit! > 0 ? Math.min(limit!, 10000) : 10000);
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return shape(t, rows);
}

const tableName = (t: Table) => Object.keys(TABLES).find((k) => TABLES[k] === t)!;

function finish(rows: Record<string, unknown>[], single: Req['single']): Result {
  if (single === 'single') {
    return rows.length === 1 ? { data: rows[0], error: null }
      : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
  }
  if (single === 'maybe') {
    return rows.length <= 1 ? { data: rows[0] ?? null, error: null }
      : { data: null, error: { message: 'multiple rows returned', code: 'PGRST116' } };
  }
  return { data: rows, error: null };
}

function mapDbError(e: unknown): Result {
  const code = (e as { code?: string }).code ?? '';
  const known: Record<string, string> = {
    ER_CHECK_CONSTRAINT_VIOLATED: '입력한 값이 허용 범위를 벗어났어요.',
    ER_CONSTRAINT_FAILED: '입력한 값이 허용 범위를 벗어났어요.',
    ER_DUP_ENTRY: '이미 있는 값이에요.',
    ER_NO_REFERENCED_ROW_2: '연결된 항목을 찾을 수 없어요.',
    ER_NO_REFERENCED_ROW: '연결된 항목을 찾을 수 없어요.',
    ER_SIGNAL_EXCEPTION: '다른 가게의 항목은 연결할 수 없어요.',
    ER_DATA_TOO_LONG: '글자가 너무 길어요.',
    ER_WARN_DATA_OUT_OF_RANGE: '숫자가 너무 커요.',
    ER_TRUNCATED_WRONG_VALUE: '값이 올바르지 않아요.',
  };
  if (!known[code]) console.error('[db]', e);
  return { data: null, error: { message: known[code] ?? '저장하지 못했어요.', code } };
}

export async function run(ctx: Ctx, req: Req): Promise<Result> {
  try {
    if (!isObj(req)) bad('요청이 올바르지 않아요.');
    const t = table(req.table);
    const name = req.table;
    const filters = Array.isArray(req.filters) ? req.filters : undefined;
    if (req.filters !== undefined && !filters) bad('필터가 올바르지 않아요.');

    if (req.op === 'select') {
      if (!(t.scope === 'owner_id' ? ctx.userId : ctx.storeId)) return finish([], req.single ?? null); // 가게가 아직 없음
      const params: unknown[] = [];
      const w = where(t, ctx, filters, params);
      return finish(await selectRows(pool(), t, colList(t, req.columns), w, params, req.order, req.limit), req.single ?? null);
    }

    if (req.op === 'update' || req.op === 'delete') {
      if (!filters?.length) bad('조건 없이는 바꾸거나 지울 수 없어요.');
      const params: unknown[] = [];
      let sql: string;
      if (req.op === 'update') {
        const [vals] = rowsToWrite(t, ctx, req.values, false);
        if (!vals || !Object.keys(vals).length) bad('바꿀 값이 없어요.');
        const keys = Object.keys(vals!);
        params.push(...keys.map((k) => vals![k]));
        sql = `UPDATE ${q(name)} SET ${keys.map((k) => `${q(k)} = ?`).join(', ')} WHERE `;
      } else sql = `DELETE FROM ${q(name)} WHERE `;
      sql += where(t, ctx, filters, params);
      await pool().query(sql, params);
      // 반환이 필요하면 바뀐 뒤의 행을 같은 조건으로 다시 읽는다(update만 의미 있음).
      if (req.returning && req.op === 'update') {
        const p2: unknown[] = [];
        return finish(await selectRows(pool(), t, colList(t, req.returning), where(t, ctx, filters, p2), p2), req.single ?? null);
      }
      return { data: null, error: null };
    }

    if (req.op === 'insert' || req.op === 'upsert') {
      if (req.op === 'upsert' && name !== 'checklist_checks') bad('이 표는 upsert를 쓸 수 없어요.');
      const rows = rowsToWrite(t, ctx, req.values, true);
      const conn = await pool().getConnection();
      try {
        await conn.beginTransaction();
        for (const r of rows) {
          const keys = Object.keys(r);
          let sql = `INSERT INTO ${q(name)} (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
          if (req.op === 'upsert') {
            const upd = keys.filter((k) => !['store_id', 'ym', 'idx'].includes(k));
            sql += ` ON DUPLICATE KEY UPDATE ${upd.map((k) => `${q(k)} = VALUES(${q(k)})`).join(', ')}`;
          }
          await conn.query(sql, keys.map((k) => r[k]));
        }
        let data: Record<string, unknown>[] | null = null;
        if (req.returning && t.hasId) {
          const params: unknown[] = [];
          const ids = rows.map((r) => r.id as string);
          const w = where(t, ctx, [{ col: 'id', op: 'in', val: ids }], params);
          data = await selectRows(conn, t, colList(t, req.returning), w, params);
        }
        await conn.commit();
        return data ? finish(data, req.single ?? null) : { data: null, error: null };
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
    return bad('지원하지 않는 요청이에요.');
  } catch (e) {
    if (e instanceof Bad) return { data: null, error: { message: e.message, code: 'BAD_REQUEST' } };
    return mapDbError(e);
  }
}
