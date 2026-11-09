import { randomUUID } from 'node:crypto';
import type { Ctx, Result } from './query';
import { pool } from './pool';

// 여러 표를 한 번에 바꾸는 저장은 트랜잭션 하나로 처리한다(중간에 끊겨도 반쪽만 저장되지 않는다).
// 예전 Postgres 함수(save_invoice, save_settlement)를 서버 코드로 옮긴 것이다.

class Bad extends Error {}
const bad = (m: string): never => { throw new Bad(m); };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length >= 1 && v.length <= max ? v : bad('글자가 올바르지 않아요.'));
const int = (v: unknown, dflt: number) => {
  const n = v == null ? dflt : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : bad('숫자가 올바르지 않아요.');
};

export async function saveInvoice(ctx: Ctx, a: Record<string, unknown>): Promise<Result> {
  const store = ctx.storeId ?? bad('가게가 없어요.');
  const vendor = str(a.p_vendor, 60);
  const date = typeof a.p_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.p_date) ? a.p_date : bad('날짜가 올바르지 않아요.');
  const items = Array.isArray(a.p_items) && a.p_items.length >= 1 && a.p_items.length <= 200 ? a.p_items : bad('품목이 올바르지 않아요.');
  const stockIn = a.p_stock_in !== false;

  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const id = randomUUID();
    await conn.query('INSERT INTO invoices (id, store_id, vendor, issued_on) VALUES (?, ?, ?, ?)', [id, store, vendor, date]);
    for (const it of items as unknown[]) {
      if (!isObj(it)) bad('품목이 올바르지 않아요.');
      const o = it as Record<string, unknown>;
      const ing = typeof o.ingredient_id === 'string' && o.ingredient_id ? o.ingredient_id : null;
      const price = int(o.unit_price_won, 0);
      const qty = typeof o.qty === 'number' && Number.isFinite(o.qty) ? o.qty : bad('수량이 올바르지 않아요.');
      if (ing) {
        const [own] = await conn.query<import('mysql2').RowDataPacket[]>('SELECT 1 FROM ingredients WHERE id = ? AND store_id = ?', [ing, store]);
        if (!own.length) bad('다른 가게의 항목은 연결할 수 없어요.');
      }
      await conn.query(
        'INSERT INTO invoice_items (id, store_id, invoice_id, ingredient_id, name, unit_price_won, qty, taxed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), store, id, ing, str(o.name, 80), price, qty, o.taxed === true ? 1 : 0]);
      if (ing) {
        if (price > 0) await conn.query('UPDATE ingredients SET price = ? WHERE id = ? AND store_id = ?', [price, ing, store]);
        if (stockIn) await conn.query('UPDATE ingredients SET stock = stock + ?, order_qty = 0 WHERE id = ? AND store_id = ?', [qty, ing, store]);
      }
    }
    await conn.commit();
    return { data: id, error: null };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

const SETTLE_COLS = ['hall_won', 'deliv_won', 'receipts', 'days', 'open_stock_won', 'close_stock_won', 'theory_won',
  'labor_won', 'ins_won', 'rent_won', 'util_won', 'waste_won', 'etc_won', 'tax_won'] as const;

export async function saveSettlement(ctx: Ctx, a: Record<string, unknown>): Promise<Result> {
  const store = ctx.storeId ?? bad('가게가 없어요.');
  const ym = typeof a.p_ym === 'string' && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(a.p_ym) ? a.p_ym : bad('월이 올바르지 않아요.');
  const s = isObj(a.p_s) ? a.p_s : bad('정산 값이 올바르지 않아요.');
  const purchases = Array.isArray(a.p_purchases) && a.p_purchases.length <= 100 ? a.p_purchases : bad('매입 목록이 올바르지 않아요.');
  const vals = SETTLE_COLS.map((c) => int(s[c], c === 'days' ? 30 : 0));

  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const cols = ['id', 'store_id', 'ym', ...SETTLE_COLS, 'saved_at'];
    const upd = SETTLE_COLS.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
    await conn.query(
      `INSERT INTO settlements (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (?, ?, ?, ${SETTLE_COLS.map(() => '?').join(', ')}, NOW(3))
       ON DUPLICATE KEY UPDATE ${upd}, saved_at = NOW(3)`,
      [randomUUID(), store, ym, ...vals]);
    const [rows] = await conn.query<import('mysql2').RowDataPacket[]>('SELECT id FROM settlements WHERE store_id = ? AND ym = ?', [store, ym]);
    const id = rows[0]!.id as string;
    await conn.query('DELETE FROM settlement_purchases WHERE settlement_id = ? AND store_id = ?', [id, store]);
    for (const p of purchases as unknown[]) {
      if (!isObj(p)) bad('매입 목록이 올바르지 않아요.');
      const o = p as Record<string, unknown>;
      await conn.query('INSERT INTO settlement_purchases (id, store_id, settlement_id, vendor, amount_won) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), store, id, str(o.vendor, 60), int(o.amount_won, 0)]);
    }
    await conn.commit();
    return { data: id, error: null };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export { Bad as RpcBad };
