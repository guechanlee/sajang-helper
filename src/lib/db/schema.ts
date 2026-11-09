// 브라우저가 보낸 표·열 이름은 여기 적힌 것만 SQL에 들어간다(그 밖의 이름은 모두 거절).
export type ColType = 'str' | 'num' | 'bool' | 'date' | 'ts';
export type Table = {
  cols: Record<string, ColType>;
  hasId: boolean;
  /** 이 열이 로그인한 사장님의 값과 같은 행만 보인다. stores는 owner_id, 나머지는 store_id. */
  scope: 'owner_id' | 'store_id';
  /** 브라우저가 직접 넣거나 바꿀 수 없는 열(서버가 채운다). */
  locked: string[];
};

const S = 'str', N = 'num', B = 'bool', D = 'date', T = 'ts';
const child = (cols: Record<string, ColType>, hasId = true, locked: string[] = []): Table => ({
  cols: { ...(hasId ? { id: S as ColType } : {}), store_id: S, ...cols }, hasId, scope: 'store_id',
  locked: ['id', 'store_id', ...locked],
});

export const TABLES: Record<string, Table> = {
  stores: {
    cols: { id: S, owner_id: S, name: S, biz_type: S, status: S, opened_before_2025: B, annual_sales_man: N,
      sales_dropped: B, is_rent: B, income_tier: S, profile_done: B, address: S, phone: S, biz_no: S, place_url: S, place_id: S, created_at: T },
    hasId: true, scope: 'owner_id', locked: ['id', 'owner_id', 'created_at'],
  },
  ingredients: child({ category: S, vendor: S, name: S, spec_g: N, price: N, loss_pct: N, stock: N, order_qty: N, created_at: T }, true, ['created_at']),
  preps: child({ name: S, yield_g: N }),
  prep_rows: child({ prep_id: S, ingredient_id: S, qty_g: N }),
  menus: child({ category: S, name: S, price: N, created_at: T }, true, ['created_at']),
  menu_rows: child({ menu_id: S, ingredient_id: S, prep_id: S, qty_g: N }),
  settlements: child({ ym: S, hall_won: N, deliv_won: N, receipts: N, days: N, open_stock_won: N, close_stock_won: N,
    theory_won: N, labor_won: N, ins_won: N, rent_won: N, util_won: N, waste_won: N, etc_won: N, tax_won: N, saved_at: T }, true, ['saved_at']),
  settlement_purchases: child({ settlement_id: S, vendor: S, amount_won: N }),
  invoices: child({ vendor: S, issued_on: D, created_at: T }, true, ['created_at']),
  invoice_items: child({ invoice_id: S, ingredient_id: S, name: S, unit_price_won: N, qty: N, taxed: B }),
  reviews: child({ source: S, author: S, rating: N, body: S, reviewed_on: D, reply: S, replied: B, created_at: T }, true, ['created_at']),
  checklist_checks: child({ ym: S, idx: N, checked: B }, false),
};
