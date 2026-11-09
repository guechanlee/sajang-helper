import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

// 실제 MySQL(또는 MariaDB)에 붙어서 검증한다. 빈 테스트용 DB의 주소를 TEST_DATABASE_URL 로 준다.
//   예) TEST_DATABASE_URL=mysql://sajang:pw@localhost/sajang_test npm test
// 주의: 이 DB의 표를 모두 비우고 시작한다. 개발용 DB 주소를 넣지 말 것.
const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

type Mods = {
  run: typeof import('../src/lib/db/query').run;
  saveInvoice: typeof import('../src/lib/db/rpc').saveInvoice;
  saveSettlement: typeof import('../src/lib/db/rpc').saveSettlement;
  signUp: typeof import('../src/lib/db/auth').signUp;
  pool: typeof import('../src/lib/db/pool').pool;
};
let m: Mods;
type Ctx = { userId: string; storeId: string | null };
let A: Ctx, B: Ctx;

const ok = async (p: Promise<{ data: unknown; error: { message: string } | null }>) => {
  const r = await p;
  expect(r.error, r.error?.message).toBeNull();
  return r.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const fails = async (p: Promise<{ error: unknown }>) => (await p).error !== null;

beforeAll(async () => {
  process.env.DATABASE_URL = URL;
  execFileSync('node', ['scripts/db-init.mjs'], { env: { ...process.env, DATABASE_URL: URL } });
  const [q, r, a, p] = await Promise.all([import('../src/lib/db/query'), import('../src/lib/db/rpc'), import('../src/lib/db/auth'), import('../src/lib/db/pool')]);
  m = { run: q.run, saveInvoice: r.saveInvoice, saveSettlement: r.saveSettlement, signUp: a.signUp, pool: p.pool };
  await m.pool().query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['reviews', 'invoice_items', 'invoices', 'settlement_purchases', 'settlements', 'menu_rows', 'menus', 'prep_rows', 'preps', 'ingredients', 'checklist_checks', 'stores', 'sessions', 'users'])
    await m.pool().query(`DELETE FROM ${t}`);
  await m.pool().query('SET FOREIGN_KEY_CHECKS = 1');
  const mk = async (email: string): Promise<Ctx> => {
    const u = await m.signUp(email, 'password123');
    if (u === 'exists') throw new Error('exists');
    const [rows] = await m.pool().query<any[]>('SELECT id FROM stores WHERE owner_id = ?', [u.id]); // eslint-disable-line @typescript-eslint/no-explicit-any
    return { userId: u.id, storeId: rows[0].id };
  };
  A = await mk('a@example.com');
  B = await mk('b@example.com');
}, 60_000);

d('가입', () => {
  it('가입하면 사장님마다 빈 가게가 하나 생긴다', async () => {
    const [r] = await m.pool().query<any[]>('SELECT COUNT(*) n FROM stores'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(r[0].n).toBe(2);
  });
  it('같은 이메일로 다시 가입할 수 없다', async () => {
    expect(await m.signUp('a@example.com', 'password123')).toBe('exists');
  });
  it('가게는 사장님 1명당 1개다', async () => {
    expect(await fails(m.run(A, { table: 'stores', op: 'insert', values: {} }))).toBe(true);
  });
});

d('가게별 데이터 분리', () => {
  let ingA: string, ingB: string;
  beforeAll(async () => {
    ingA = (await ok(m.run(A, { table: 'ingredients', op: 'insert', values: { name: 'A의 양파', spec_g: 1000, price: 1000 }, returning: 'id' })))[0].id;
    ingB = (await ok(m.run(B, { table: 'ingredients', op: 'insert', values: { name: 'B의 양파', spec_g: 1000, price: 2000 }, returning: 'id' })))[0].id;
  });

  it('내 재료만 보인다', async () => {
    const a = await ok(m.run(A, { table: 'ingredients', op: 'select' }));
    expect(a.map((r: { name: string }) => r.name)).toEqual(['A의 양파']);
  });
  it('남의 행은 id를 알아도 읽을 수 없다', async () => {
    const r = await ok(m.run(A, { table: 'ingredients', op: 'select', filters: [{ col: 'id', op: 'eq', val: ingB }] }));
    expect(r).toEqual([]);
  });
  it('남의 행은 바꾸거나 지울 수 없다', async () => {
    await ok(m.run(A, { table: 'ingredients', op: 'update', values: { price: 1 }, filters: [{ col: 'id', op: 'eq', val: ingB }] }));
    await ok(m.run(A, { table: 'ingredients', op: 'delete', filters: [{ col: 'id', op: 'eq', val: ingB }] }));
    const r = await ok(m.run(B, { table: 'ingredients', op: 'select', columns: 'price', filters: [{ col: 'id', op: 'eq', val: ingB }] }));
    expect(r).toEqual([{ price: 2000 }]);
  });
  it('브라우저가 보낸 store_id는 무시하고 내 가게로 저장한다', async () => {
    const r = await ok(m.run(A, { table: 'ingredients', op: 'insert', values: { store_id: B.storeId, name: '위조', spec_g: 1, price: 1 }, returning: 'store_id' }));
    expect(r[0].store_id).toBe(A.storeId);
    const b = await ok(m.run(B, { table: 'ingredients', op: 'select' }));
    expect(b).toHaveLength(1);
  });
  it('새 행을 넣을 때 UUID 형식의 id는 받지만, 남의 행 id로는 덮어쓰지 못한다', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const r = await ok(m.run(A, { table: 'preps', op: 'insert', values: { id, name: '육수', yield_g: 1000 }, returning: 'id' }));
    expect(r[0].id).toBe(id);
    expect((await m.run(B, { table: 'preps', op: 'insert', values: { id, name: '탈취', yield_g: 1 } })).error).not.toBeNull();
    const still = await ok(m.run(A, { table: 'preps', op: 'select', columns: 'name', filters: [{ col: 'id', op: 'eq', val: id }] }));
    expect(still).toEqual([{ name: '육수' }]);
    expect((await m.run(A, { table: 'preps', op: 'insert', values: { id: "x'; --", name: 'n', yield_g: 1 } })).error).not.toBeNull();
    expect((await m.run(A, { table: 'preps', op: 'update', values: { id: '44444444-4444-4444-8444-444444444444' }, filters: [{ col: 'id', op: 'eq', val: id }] })).error).not.toBeNull();
  });
  it('store_id를 다른 가게로 바꾸는 수정은 거절한다', async () => {
    expect(await fails(m.run(A, { table: 'ingredients', op: 'update', values: { store_id: B.storeId }, filters: [{ col: 'id', op: 'eq', val: ingA }] }))).toBe(true);
  });
  it('남의 재료를 메뉴에 연결할 수 없다 (복합 외래키)', async () => {
    const menu = (await ok(m.run(A, { table: 'menus', op: 'insert', values: { name: '메뉴' }, returning: 'id' })))[0].id;
    expect(await fails(m.run(A, { table: 'menu_rows', op: 'insert', values: { menu_id: menu, ingredient_id: ingB, qty_g: 10 } }))).toBe(true);
    expect(await fails(m.run(A, { table: 'menu_rows', op: 'insert', values: { menu_id: menu, ingredient_id: ingA, qty_g: 10 } }))).toBe(false);
  });
  it('남의 재료를 명세서 줄에 연결할 수 없다', async () => {
    const before = await ok(m.run(A, { table: 'invoices', op: 'select' }));
    await expect(m.saveInvoice(A, { p_vendor: '거래처', p_date: '2026-01-05', p_items: [{ name: 'x', ingredient_id: ingB, unit_price_won: 100, qty: 1 }] })).rejects.toThrow(/다른 가게/);
    expect(await ok(m.run(A, { table: 'invoices', op: 'select' }))).toHaveLength(before.length); // 명세서도 함께 취소
  });
  it('명세서 줄을 직접 넣거나 바꿀 때도 남의 재료는 연결할 수 없다', async () => {
    const inv = (await ok(m.run(A, { table: 'invoices', op: 'insert', values: { vendor: 'v', issued_on: '2026-01-06' }, returning: 'id' })))[0].id;
    expect((await m.run(A, { table: 'invoice_items', op: 'insert', values: { invoice_id: inv, ingredient_id: ingB, name: 'x', unit_price_won: 1, qty: 1 } })).error?.message).toMatch(/다른 가게/);
    const item = (await ok(m.run(A, { table: 'invoice_items', op: 'insert', values: { invoice_id: inv, ingredient_id: ingA, name: 'ok', unit_price_won: 1, qty: 1 }, returning: 'id' })))[0].id;
    expect((await m.run(A, { table: 'invoice_items', op: 'update', values: { ingredient_id: ingB }, filters: [{ col: 'id', op: 'eq', val: item }] })).error?.message).toMatch(/다른 가게/);
  });
});

d('요청 검증 (SQL 주입 방지)', () => {
  it('목록에 없는 표·열 이름은 거절한다', async () => {
    expect((await m.run(A, { table: 'users', op: 'select' })).error).not.toBeNull();
    expect((await m.run(A, { table: 'sessions', op: 'select' })).error).not.toBeNull();
    expect((await m.run(A, { table: 'ingredients', op: 'select', columns: 'name; DROP TABLE users' })).error).not.toBeNull();
    expect((await m.run(A, { table: 'ingredients', op: 'select', filters: [{ col: '1=1 --', op: 'eq', val: 'x' }] })).error).not.toBeNull();
    expect((await m.run(A, { table: 'ingredients', op: 'select', order: [{ col: 'name; --', asc: true }] })).error).not.toBeNull();
    expect((await m.run(A, { table: 'constructor' as string, op: 'select' })).error).not.toBeNull();
  });
  it('값에 SQL이 들어 있어도 그냥 글자로 저장된다', async () => {
    const evil = "x'); DROP TABLE users; --";
    const r = await ok(m.run(A, { table: 'ingredients', op: 'insert', values: { name: evil, spec_g: 1, price: 1 }, returning: 'name' }));
    expect(r[0].name).toBe(evil);
    const [u] = await m.pool().query<any[]>('SELECT COUNT(*) n FROM users'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(u[0].n).toBe(2);
  });
  it('조건 없는 수정·삭제는 거절한다', async () => {
    expect((await m.run(A, { table: 'ingredients', op: 'delete' })).error).not.toBeNull();
    expect((await m.run(A, { table: 'ingredients', op: 'update', values: { price: 0 } })).error).not.toBeNull();
  });
  it('타입이 틀린 값은 거절한다', async () => {
    expect((await m.run(A, { table: 'ingredients', op: 'insert', values: { name: 'x', spec_g: '1000', price: 1 } })).error).not.toBeNull();
    expect((await m.run(A, { table: 'stores', op: 'update', values: { profile_done: 'yes' }, filters: [{ col: 'id', op: 'eq', val: A.storeId }] })).error).not.toBeNull();
  });
});

d('DB 제약', () => {
  it('음수 가격·0 규격은 거절한다', async () => {
    expect(await fails(m.run(A, { table: 'ingredients', op: 'insert', values: { name: 'x', spec_g: 1000, price: -1 } }))).toBe(true);
    expect(await fails(m.run(A, { table: 'ingredients', op: 'insert', values: { name: 'x', spec_g: 0, price: 1 } }))).toBe(true);
  });
  it('정산 월 형식이 틀리면 거절한다', async () => {
    expect(await fails(m.run(A, { table: 'settlements', op: 'insert', values: { ym: '2026-13' } }))).toBe(true);
    expect(await fails(m.run(A, { table: 'settlements', op: 'insert', values: { ym: '2026-1' } }))).toBe(true);
  });
  it('메뉴 줄은 재료 또는 반제품 중 정확히 하나만 가진다', async () => {
    const menu = (await ok(m.run(A, { table: 'menus', op: 'insert', values: { name: 'm2' }, returning: 'id' })))[0].id;
    expect(await fails(m.run(A, { table: 'menu_rows', op: 'insert', values: { menu_id: menu, qty_g: 1 } }))).toBe(true);
  });
  it('업종·상태 값이 목록 밖이면 거절한다', async () => {
    expect(await fails(m.run(A, { table: 'stores', op: 'update', values: { biz_type: 'zoo' }, filters: [{ col: 'id', op: 'eq', val: A.storeId }] }))).toBe(true);
  });
  it('boolean·소수는 JS 값으로 돌아온다', async () => {
    await ok(m.run(A, { table: 'stores', op: 'update', values: { profile_done: true, is_rent: false, annual_sales_man: 5000 }, filters: [{ col: 'id', op: 'eq', val: A.storeId }] }));
    const s = await ok(m.run(A, { table: 'stores', op: 'select', single: 'single' }));
    expect(s).toMatchObject({ profile_done: true, is_rent: false, annual_sales_man: 5000 });
    const i = await ok(m.run(A, { table: 'ingredients', op: 'select', filters: [{ col: 'name', op: 'eq', val: 'A의 양파' }], single: 'single' }));
    expect(typeof i.spec_g).toBe('number');
  });
});

d('저장 함수', () => {
  let ing: string;
  beforeAll(async () => {
    ing = (await ok(m.run(A, { table: 'ingredients', op: 'insert', values: { name: '대파', spec_g: 1000, price: 3000, stock: 2, order_qty: 5 }, returning: 'id' })))[0].id;
  });
  it('명세서를 저장하면 단가가 바뀌고 재고가 늘며 발주 수량이 0이 된다', async () => {
    const r = await ok(m.saveInvoice(A, { p_vendor: '농협', p_date: '2026-02-03', p_stock_in: true, p_items: [{ name: '대파', ingredient_id: ing, unit_price_won: 3500, qty: 3 }] }));
    expect(r).toMatch(/^[0-9a-f-]{36}$/);
    const i = await ok(m.run(A, { table: 'ingredients', op: 'select', filters: [{ col: 'id', op: 'eq', val: ing }], single: 'single' }));
    expect(i).toMatchObject({ price: 3500, stock: 5, order_qty: 0 });
  });
  it('재고 반영을 끄면 단가만 바뀐다', async () => {
    await ok(m.saveInvoice(A, { p_vendor: '농협', p_date: '2026-02-04', p_stock_in: false, p_items: [{ name: '대파', ingredient_id: ing, unit_price_won: 4000, qty: 10 }] }));
    const i = await ok(m.run(A, { table: 'ingredients', op: 'select', filters: [{ col: 'id', op: 'eq', val: ing }], single: 'single' }));
    expect(i).toMatchObject({ price: 4000, stock: 5 });
  });
  it('중간에 하나라도 잘못되면 명세서 전체가 저장되지 않는다', async () => {
    const before = await ok(m.run(A, { table: 'invoices', op: 'select' }));
    await expect(m.saveInvoice(A, { p_vendor: '실패', p_date: '2026-02-05', p_items: [
      { name: '정상', ingredient_id: null, unit_price_won: 100, qty: 1 },
      { name: '', ingredient_id: null, unit_price_won: 100, qty: 1 },
    ] })).rejects.toThrow();
    expect(await ok(m.run(A, { table: 'invoices', op: 'select' }))).toHaveLength(before.length);
  });
  it('품목이 없거나 200개를 넘으면 거절한다', async () => {
    await expect(m.saveInvoice(A, { p_vendor: 'x', p_date: '2026-02-05', p_items: [] })).rejects.toThrow();
    await expect(m.saveInvoice(A, { p_vendor: 'x', p_date: '2026-02-05', p_items: Array.from({ length: 201 }, () => ({ name: 'a', unit_price_won: 1, qty: 1 })) })).rejects.toThrow();
  });
  it('가게가 없으면 저장하지 않는다', async () => {
    await expect(m.saveInvoice({ userId: A.userId, storeId: null }, { p_vendor: 'x', p_date: '2026-02-05', p_items: [{ name: 'a', unit_price_won: 1, qty: 1 }] })).rejects.toThrow();
  });
  it('정산은 같은 달에 다시 저장하면 덮어쓰고 매입 목록도 교체한다', async () => {
    const s = { hall_won: 1000, deliv_won: 500, receipts: 10, days: 28 };
    const id1 = await ok(m.saveSettlement(A, { p_ym: '2026-03', p_s: s, p_purchases: [{ vendor: 'a', amount_won: 1 }, { vendor: 'b', amount_won: 2 }] }));
    const id2 = await ok(m.saveSettlement(A, { p_ym: '2026-03', p_s: { ...s, hall_won: 2000 }, p_purchases: [{ vendor: 'c', amount_won: 3 }] }));
    expect(id2).toBe(id1);
    const row = await ok(m.run(A, { table: 'settlements', op: 'select', filters: [{ col: 'ym', op: 'eq', val: '2026-03' }], single: 'single' }));
    expect(row).toMatchObject({ hall_won: 2000, days: 28, labor_won: 0 });
    expect(row.saved_at).toMatch(/Z$/);
    const ps = await ok(m.run(A, { table: 'settlement_purchases', op: 'select', columns: 'vendor' }));
    expect(ps).toEqual([{ vendor: 'c' }]);
  });
  it('정산 월 형식이 틀리면 거절한다', async () => {
    await expect(m.saveSettlement(A, { p_ym: '2026-00', p_s: {}, p_purchases: [] })).rejects.toThrow();
  });
  it('남의 정산은 보이지 않는다', async () => {
    expect(await ok(m.run(B, { table: 'settlements', op: 'select' }))).toEqual([]);
  });
});

d('체크리스트·삭제', () => {
  it('체크리스트는 upsert로 켜고 끈다', async () => {
    await ok(m.run(A, { table: 'checklist_checks', op: 'upsert', values: { ym: '2026-03', idx: 2, checked: true } }));
    await ok(m.run(A, { table: 'checklist_checks', op: 'upsert', values: { ym: '2026-03', idx: 2, checked: false } }));
    const r = await ok(m.run(A, { table: 'checklist_checks', op: 'select', columns: 'idx,checked', filters: [{ col: 'ym', op: 'eq', val: '2026-03' }] }));
    expect(r).toEqual([{ idx: 2, checked: false }]);
    expect((await m.run(A, { table: 'checklist_checks', op: 'upsert', values: { ym: '2026-03', idx: 99, checked: true } })).error).not.toBeNull();
    expect((await m.run(A, { table: 'ingredients', op: 'upsert', values: { name: 'x', spec_g: 1, price: 1 } })).error).not.toBeNull();
  });
  it('재료를 지워도 명세서 줄은 남고 연결만 끊긴다', async () => {
    const i = (await ok(m.run(A, { table: 'ingredients', op: 'insert', values: { name: '지울 재료', spec_g: 1, price: 1 }, returning: 'id' })))[0].id;
    await ok(m.saveInvoice(A, { p_vendor: 'z', p_date: '2026-04-01', p_items: [{ name: '지울 재료', ingredient_id: i, unit_price_won: 1, qty: 1 }] }));
    await ok(m.run(A, { table: 'ingredients', op: 'delete', filters: [{ col: 'id', op: 'eq', val: i }] }));
    const it = await ok(m.run(A, { table: 'invoice_items', op: 'select', filters: [{ col: 'name', op: 'eq', val: '지울 재료' }], single: 'single' }));
    expect(it.ingredient_id).toBeNull();
  });
  it('가게를 지우면 하위 데이터가 모두 지워지고, 다시 만들 수 있다', async () => {
    await ok(m.run(A, { table: 'stores', op: 'delete', filters: [{ col: 'id', op: 'eq', val: A.storeId }] }));
    const [r] = await m.pool().query<any[]>('SELECT COUNT(*) n FROM ingredients WHERE store_id = ?', [A.storeId]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(r[0].n).toBe(0);
    const again = await ok(m.run({ userId: A.userId, storeId: null }, { table: 'stores', op: 'insert', values: {}, returning: 'id' }));
    expect(again[0].id).toBeTruthy();
    expect(await ok(m.run(B, { table: 'ingredients', op: 'select' }))).not.toHaveLength(0); // B는 그대로
  });
});

d('리뷰·가게 정보', () => {
  // 앞 시험에서 A의 가게를 지웠을 수 있어서, 새 사장님 둘로 확인한다.
  let A: Ctx, B: Ctx;
  beforeAll(async () => {
    const mk = async (email: string): Promise<Ctx> => {
      const u = await m.signUp(email, 'password123');
      if (u === 'exists') throw new Error('exists');
      const [rows] = await m.pool().query<any[]>('SELECT id FROM stores WHERE owner_id = ?', [u.id]); // eslint-disable-line @typescript-eslint/no-explicit-any
      return { userId: u.id, storeId: rows[0].id };
    };
    A = await mk('rv-a@example.com'); B = await mk('rv-b@example.com');
  });
  it('가게 정보(주소·전화·플레이스 주소)를 저장하고 남의 가게는 바꿀 수 없다', async () => {
    await ok(m.run(A, { table: 'stores', op: 'update', values: { name: '행복분식', address: '서울 마포구', phone: '02-000-0000', biz_no: '220-81-62517', place_url: 'https://naver.me/abc', place_id: '' }, filters: [{ col: 'id', op: 'eq', val: A.storeId }] }));
    const a = await ok(m.run(A, { table: 'stores', op: 'select', columns: 'name,address,place_url' }));
    expect(a).toEqual([{ name: '행복분식', address: '서울 마포구', place_url: 'https://naver.me/abc' }]);
    await ok(m.run(A, { table: 'stores', op: 'update', values: { name: '탈취' }, filters: [{ col: 'id', op: 'eq', val: B.storeId }] }));
    const b = await ok(m.run(B, { table: 'stores', op: 'select', columns: 'name' }));
    expect(b[0].name).not.toBe('탈취');
  });
  it('리뷰는 내 가게 것만 보이고, 별점·출처가 이상하면 거절한다', async () => {
    const id = (await ok(m.run(A, { table: 'reviews', op: 'insert', values: { source: 'naver', rating: 2, author: '손님', body: '별로예요', reviewed_on: '2026-11-01' }, returning: 'id' })))[0].id;
    expect(await ok(m.run(B, { table: 'reviews', op: 'select' }))).toEqual([]);
    expect(await fails(m.run(A, { table: 'reviews', op: 'insert', values: { source: 'naver', rating: 6, reviewed_on: '2026-11-01' } }))).toBe(true);
    expect(await fails(m.run(A, { table: 'reviews', op: 'insert', values: { source: 'evil', rating: 3, reviewed_on: '2026-11-01' } }))).toBe(true);
    expect(await fails(m.run(A, { table: 'reviews', op: 'insert', values: { source: 'naver', rating: 3, reviewed_on: '내일' } }))).toBe(true);
    await ok(m.run(A, { table: 'reviews', op: 'update', values: { reply: '죄송합니다', replied: true }, filters: [{ col: 'id', op: 'eq', val: id }] }));
    await ok(m.run(B, { table: 'reviews', op: 'delete', filters: [{ col: 'id', op: 'eq', val: id }] }));
    const left = await ok(m.run(A, { table: 'reviews', op: 'select', columns: 'replied,reply' }));
    expect(left).toEqual([{ replied: true, reply: '죄송합니다' }]);
  });
});
