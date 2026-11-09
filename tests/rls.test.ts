import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Supabase의 auth 스키마를 흉내 내는 최소 장치. auth.uid()는 세션 설정값에서 읽는다.
const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to authenticated, anon;
`;
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
const as = async (user: string | null) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
};
const storeOf = async (user: string) => {
  await as(user);
  const r = await db.query<{ id: string }>('select id from public.stores');
  return r.rows[0]!.id;
};
const fails = async (sql: string, params: unknown[] = []) => {
  try { await db.query(sql, params); } catch { return true; }
  return false;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0002_functions.sql', 'utf8'));
  await db.exec('reset role');
  await db.exec(`insert into auth.users(id) values ('${A}'), ('${B}')`);
}, 60_000);

describe('가입과 가게 생성', () => {
  it('가입하면 사장님마다 빈 가게가 하나 생긴다', async () => {
    await db.exec('reset role');
    const r = await db.query<{ n: number }>('select count(*)::int n from public.stores');
    expect(r.rows[0]!.n).toBe(2);
  });
});

describe('가게별 데이터 분리', () => {
  let sa: string, sb: string, ingA: string, ingB: string;
  beforeAll(async () => {
    sa = await storeOf(A);
    const i = await db.query<{ id: string }>(
      `insert into public.ingredients(store_id,name,spec_g,price) values ($1,'A의 양파',1000,1000) returning id`, [sa]);
    ingA = i.rows[0]!.id;
    sb = await storeOf(B);
    const j = await db.query<{ id: string }>(
      `insert into public.ingredients(store_id,name,spec_g,price) values ($1,'B의 양파',1000,2000) returning id`, [sb]);
    ingB = j.rows[0]!.id;
  });

  it('내 가게 데이터만 보인다', async () => {
    await as(A);
    const r = await db.query<{ name: string }>('select name from public.ingredients');
    expect(r.rows.map((x) => x.name)).toEqual(['A의 양파']);
    const st = await db.query('select id from public.stores');
    expect(st.rows).toHaveLength(1);
  });
  it('남의 가게 id를 직접 지정해도 조회되지 않는다', async () => {
    await as(A);
    const r = await db.query('select * from public.ingredients where store_id = $1', [sb]);
    expect(r.rows).toHaveLength(0);
  });
  it('남의 가게에 데이터를 넣을 수 없다', async () => {
    await as(A);
    expect(await fails(`insert into public.ingredients(store_id,name,spec_g,price) values ($1,'침입',1,1)`, [sb])).toBe(true);
  });
  it('남의 데이터를 수정·삭제해도 0건 처리된다', async () => {
    await as(A);
    const u = await db.query('update public.ingredients set price = 1 where id = $1 returning id', [ingB]);
    expect(u.rows).toHaveLength(0);
    const d = await db.query('delete from public.ingredients where id = $1 returning id', [ingB]);
    expect(d.rows).toHaveLength(0);
    await as(B);
    const r = await db.query<{ price: number }>('select price from public.ingredients where id = $1', [ingB]);
    expect(r.rows[0]!.price).toBe(2000);
  });
  it('내 가게의 소유자를 남에게 바꿀 수 없다', async () => {
    await as(A);
    expect(await fails('update public.stores set owner_id = $1 where id = $2', [B, sa])).toBe(true);
  });
  it('다른 가게의 재료를 내 메뉴 레시피에 연결할 수 없다', async () => {
    await as(A);
    const m = await db.query<{ id: string }>(`insert into public.menus(store_id,name,price) values ($1,'A메뉴',1000) returning id`, [sa]);
    const menuId = m.rows[0]!.id;
    expect(await fails(`insert into public.menu_rows(store_id,menu_id,ingredient_id,qty_g) values ($1,$2,$3,10)`, [sa, menuId, ingB])).toBe(true);
    const ok = await db.query(`insert into public.menu_rows(store_id,menu_id,ingredient_id,qty_g) values ($1,$2,$3,10) returning id`, [sa, menuId, ingA]);
    expect(ok.rows).toHaveLength(1);
  });
  it('로그인하지 않은 사용자는 아무것도 볼 수 없다', async () => {
    await as(null);
    expect(await fails('select * from public.ingredients')).toBe(true);
    expect(await fails('select * from public.stores')).toBe(true);
  });
});

describe('입력 제약', () => {
  it('음수 금액, 0 이하 규격, 잘못된 월 형식은 거부된다', async () => {
    const s = await storeOf(A);
    expect(await fails(`insert into public.ingredients(store_id,name,spec_g,price) values ($1,'x',0,1)`, [s])).toBe(true);
    expect(await fails(`insert into public.ingredients(store_id,name,spec_g,price) values ($1,'x',1,-1)`, [s])).toBe(true);
    expect(await fails(`insert into public.ingredients(store_id,name,spec_g,price,loss_pct) values ($1,'x',1,1,100)`, [s])).toBe(true);
    expect(await fails(`insert into public.settlements(store_id,ym) values ($1,'2026-13')`, [s])).toBe(true);
    expect(await fails(`insert into public.settlements(store_id,ym,hall_won) values ($1,'2026-10',-5)`, [s])).toBe(true);
    expect((await db.query(`insert into public.settlements(store_id,ym) values ($1,'2026-10') returning id`, [s])).rows).toHaveLength(1);
    expect(await fails(`insert into public.settlements(store_id,ym) values ($1,'2026-10')`, [s])).toBe(true); // 같은 달 중복
  });
  it('메뉴 행은 재료 또는 반제품 중 정확히 하나만 가진다', async () => {
    const s = await storeOf(A);
    const m = await db.query<{ id: string }>(`select id from public.menus limit 1`);
    expect(await fails(`insert into public.menu_rows(store_id,menu_id,qty_g) values ($1,$2,5)`, [s, m.rows[0]!.id])).toBe(true);
  });
  it('재료를 지우면 명세서 품목의 연결만 풀리고 기록은 남는다', async () => {
    const s = await storeOf(A);
    const ing = await db.query<{ id: string }>(`insert into public.ingredients(store_id,name,spec_g,price) values ($1,'임시',1000,500) returning id`, [s]);
    const inv = await db.query<{ id: string }>(`insert into public.invoices(store_id,vendor,issued_on) values ($1,'V','2026-10-28') returning id`, [s]);
    await db.query(`insert into public.invoice_items(store_id,invoice_id,ingredient_id,name,unit_price_won,qty) values ($1,$2,$3,'임시',500,1)`, [s, inv.rows[0]!.id, ing.rows[0]!.id]);
    await db.query('delete from public.ingredients where id = $1', [ing.rows[0]!.id]);
    const r = await db.query<{ ingredient_id: string | null }>(`select ingredient_id from public.invoice_items where invoice_id = $1`, [inv.rows[0]!.id]);
    expect(r.rows).toHaveLength(1); expect(r.rows[0]!.ingredient_id).toBeNull();
  });
});

describe('저장 함수', () => {
  it('명세서를 저장하면 단가·재고가 한 번에 바뀐다', async () => {
    const s = await storeOf(A);
    const ing = await db.query<{ id: string }>(`insert into public.ingredients(store_id,name,spec_g,price,stock,order_qty) values ($1,'식용유',18000,51400,1,2) returning id`, [s]);
    const items = JSON.stringify([{ ingredient_id: ing.rows[0]!.id, name: '식용유 18L', unit_price_won: 53800, qty: 2, taxed: true }]);
    await db.query(`select public.save_invoice($1,'A유통','2026-10-28',$2::jsonb,true)`, [s, items]);
    const r = await db.query<{ price: number; stock: string; order_qty: string }>(`select price, stock, order_qty from public.ingredients where id=$1`, [ing.rows[0]!.id]);
    expect(r.rows[0]!.price).toBe(53800); expect(Number(r.rows[0]!.stock)).toBe(3); expect(Number(r.rows[0]!.order_qty)).toBe(0);
  });
  it('재고 반영을 끄면 재고는 그대로', async () => {
    const s = await storeOf(A);
    const ing = await db.query<{ id: string }>(`insert into public.ingredients(store_id,name,spec_g,price,stock) values ($1,'소금',1000,1000,5) returning id`, [s]);
    const items = JSON.stringify([{ ingredient_id: ing.rows[0]!.id, name: '소금', unit_price_won: 1200, qty: 1, taxed: false }]);
    await db.query(`select public.save_invoice($1,'A','2026-10-28',$2::jsonb,false)`, [s, items]);
    const r = await db.query<{ price: number; stock: string }>(`select price, stock from public.ingredients where id=$1`, [ing.rows[0]!.id]);
    expect(r.rows[0]!.price).toBe(1200); expect(Number(r.rows[0]!.stock)).toBe(5);
  });
  it('남의 가게로는 저장할 수 없다', async () => {
    const sb = await storeOf(B);
    await as(A);
    expect(await fails(`select public.save_invoice($1,'X','2026-10-28','[{"name":"a","unit_price_won":1,"qty":1}]'::jsonb,true)`, [sb])).toBe(true);
  });
  it('남의 재료를 넣으면 전체가 취소되고 명세서도 남지 않는다', async () => {
    const sa = await storeOf(A);
    const other = await db.query<{ id: string }>(`select id from public.ingredients limit 1`);
    await as(B);
    const sb = await storeOf(B);
    const bIng = await db.query<{ id: string }>(`insert into public.ingredients(store_id,name,spec_g,price) values ($1,'B전용',1,1) returning id`, [sb]);
    await as(A);
    const before = (await db.query<{ n: number }>('select count(*)::int n from public.invoices')).rows[0]!.n;
    const items = JSON.stringify([{ name: '정상', unit_price_won: 1, qty: 1 }, { ingredient_id: bIng.rows[0]!.id, name: '침입', unit_price_won: 1, qty: 1 }]);
    expect(await fails(`select public.save_invoice($1,'X','2026-10-28',$2::jsonb,true)`, [sa, items])).toBe(true);
    const after = (await db.query<{ n: number }>('select count(*)::int n from public.invoices')).rows[0]!.n;
    expect(after).toBe(before); expect(other.rows.length).toBeGreaterThanOrEqual(0);
  });
  it('월 정산은 같은 달에 다시 저장하면 덮어쓰고 거래처 목록을 교체한다', async () => {
    const s = await storeOf(A);
    const body = (h: number) => JSON.stringify({ hall_won: h, deliv_won: 1000, days: 31 });
    await db.query(`select public.save_settlement($1,'2026-09',$2::jsonb,'[{"vendor":"A","amount_won":100},{"vendor":"B","amount_won":200}]'::jsonb)`, [s, body(5000)]);
    await db.query(`select public.save_settlement($1,'2026-09',$2::jsonb,'[{"vendor":"C","amount_won":300}]'::jsonb)`, [s, body(7000)]);
    const r = await db.query<{ hall_won: string; n: number }>(`select hall_won, (select count(*)::int from public.settlement_purchases sp where sp.settlement_id = x.id) n from public.settlements x where ym='2026-09'`);
    expect(r.rows).toHaveLength(1); expect(Number(r.rows[0]!.hall_won)).toBe(7000); expect(r.rows[0]!.n).toBe(1);
  });
  it('로그인하지 않으면 저장 함수를 실행할 수 없다', async () => {
    await as(null);
    expect(await fails(`select public.save_settlement('${'33333333-3333-3333-3333-333333333333'}','2026-09','{}'::jsonb,'[]'::jsonb)`)).toBe(true);
  });
});
