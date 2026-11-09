// 브라우저에서 쓰는 데이터 클라이언트. 예전 Supabase 클라이언트와 같은 모양
// (from().select().eq() …, rpc())으로 만들어서 화면 코드를 거의 바꾸지 않았다.
// 실제 저장·조회는 서버(/api/db, /api/rpc)가 로그인 확인과 "내 가게만" 조건을 붙여서 한다.
import type { Filter, Req } from './query';

export type DbError = { message: string; code?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type DbResult<T = Row[]> = { data: T | null; error: DbError | null };

async function send<T>(path: string, body: unknown): Promise<DbResult<T>> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401) { window.location.href = '/login'; return { data: null, error: { message: '로그인이 필요해요.', code: 'UNAUTH' } }; }
    return (await res.json()) as DbResult<T>;
  } catch {
    return { data: null, error: { message: '서버에 연결하지 못했어요.', code: 'NETWORK' } };
  }
}

class Query<T = Row[]> implements PromiseLike<DbResult<T>> {
  private req: Req;
  constructor(table: string) { this.req = { table, op: 'select' }; }
  private started = false;

  select(columns = '*') {
    if (this.started) this.req.returning = columns; // insert/update 뒤의 select = "결과도 돌려줘"
    else { this.req.op = 'select'; this.req.columns = columns; this.started = true; }
    return this;
  }
  insert(values: unknown) { this.req.op = 'insert'; this.req.values = values; this.started = true; return this; }
  update(values: unknown) { this.req.op = 'update'; this.req.values = values; this.started = true; return this; }
  upsert(values: unknown) { this.req.op = 'upsert'; this.req.values = values; this.started = true; return this; }
  delete() { this.req.op = 'delete'; this.started = true; return this; }

  private f(op: Filter['op'], col: string, val: unknown) { (this.req.filters ??= []).push({ col, op, val }); return this; }
  eq(col: string, val: unknown) { return this.f('eq', col, val); }
  in(col: string, val: unknown[]) { return this.f('in', col, val); }
  gte(col: string, val: unknown) { return this.f('gte', col, val); }
  lte(col: string, val: unknown) { return this.f('lte', col, val); }
  order(col: string, opts?: { ascending?: boolean }) { (this.req.order ??= []).push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.req.limit = n; return this; }
  single() { this.req.single = 'single'; return this as unknown as Query<Row>; }
  maybeSingle() { this.req.single = 'maybe'; return this as unknown as Query<Row>; }

  then<A = DbResult<T>, B = never>(ok?: ((v: DbResult<T>) => A | PromiseLike<A>) | null, no?: ((r: unknown) => B | PromiseLike<B>) | null) {
    return send<T>('/api/db', this.req).then(ok, no);
  }
}

export type DbClient = {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
};

let client: DbClient | null = null;
export function dbClient(): DbClient {
  if (!client) client = {
    from: (t) => new Query(t),
    rpc: (fn, args) => ({ then: (ok, no) => send<unknown>('/api/rpc', { fn, args }).then(ok, no) }),
  };
  return client;
}
