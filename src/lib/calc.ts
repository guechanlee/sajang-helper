import type { Ingredient, Menu, MenuRow, Prep, PrepRow, Purchase, Settlement } from './types';

/** g당 단가 = 한 포장 가격 ÷ (한 포장 무게 × (1 − 버리는 비율)) */
export function ingredientUnit(i: Pick<Ingredient, 'spec_g' | 'price' | 'loss_pct'>): number {
  const usable = i.spec_g * (1 - (i.loss_pct || 0) / 100);
  return usable > 0 ? i.price / usable : 0;
}

export type CostBook = {
  ingredients: Map<string, Ingredient>;
  preps: Map<string, Prep>;
  prepRows: PrepRow[];
};

export function prepUnit(prep: Prep, book: CostBook): number {
  const total = book.prepRows
    .filter((r) => r.prep_id === prep.id)
    .reduce((a, r) => {
      const ing = book.ingredients.get(r.ingredient_id);
      return a + (ing ? r.qty_g * ingredientUnit(ing) : 0);
    }, 0);
  return prep.yield_g > 0 ? total / prep.yield_g : 0;
}

export function rowUnit(row: Pick<MenuRow, 'ingredient_id' | 'prep_id'>, book: CostBook): number {
  if (row.ingredient_id) {
    const ing = book.ingredients.get(row.ingredient_id);
    return ing ? ingredientUnit(ing) : 0;
  }
  if (row.prep_id) {
    const p = book.preps.get(row.prep_id);
    return p ? prepUnit(p, book) : 0;
  }
  return 0;
}

export function menuCost(rows: MenuRow[], book: CostBook): number {
  return rows.reduce((a, r) => a + r.qty_g * rowUnit(r, book), 0);
}

export function costRate(cost: number, price: number): number {
  return price > 0 ? (cost / price) * 100 : 0;
}

export type RateLevel = 'good' | 'warn' | 'bad';
export const rateLevel = (r: number): RateLevel => (r <= 30 ? 'good' : r <= 38 ? 'warn' : 'bad');

/** 원가율 30%로 맞추는 판매가 (100원 단위 올림) */
export const priceForRate = (cost: number, target = 30) => Math.ceil(cost / (target / 100) / 100) * 100;

export function menuRates(menus: Menu[], rowsByMenu: Map<string, MenuRow[]>, book: CostBook): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of menus) out.set(m.id, costRate(menuCost(rowsByMenu.get(m.id) ?? [], book), m.price));
  return out;
}

// ---------- 월 정산 ----------
export type MonthResult = {
  sales: number; purchases: number; cost: number; labor: number; admin: number; rent: number; tax: number;
  spend: number; profit: number; day: number; ticket: number; loss: number | null;
  share: (v: number) => number;
};

export function settle(s: Settlement, purchases: Purchase[]): MonthResult {
  const sales = s.hall_won + s.deliv_won;
  const purch = purchases.reduce((a, p) => a + p.amount_won, 0);
  const cost = purch + s.open_stock_won - s.close_stock_won; // 재고 반영 재료비
  const labor = s.labor_won + s.ins_won;
  const admin = s.util_won + s.waste_won + s.etc_won;
  const spend = cost + labor + admin + s.rent_won + s.tax_won;
  return {
    sales, purchases: purch, cost, labor, admin, rent: s.rent_won, tax: s.tax_won,
    spend, profit: sales - spend,
    day: s.days > 0 ? sales / s.days : 0,
    ticket: s.receipts > 0 ? sales / s.receipts : 0,
    loss: s.theory_won > 0 ? ((cost - s.theory_won) / s.theory_won) * 100 : null,
    share: (v) => (sales > 0 ? (v / sales) * 100 : 0),
  };
}

/** 월 정산 결과에서 "살펴볼 것" 문구를 만든다. 기준은 참고용 예시 값이다. */
export function monthTips(r: MonthResult): string[] {
  const tips: string[] = [];
  if (r.sales <= 0) return tips;
  if (r.profit < 0) tips.push('이번 달은 적자예요. 재료비와 월세 비율부터 확인해 봐요.');
  if (r.share(r.cost) > 38) tips.push(`재료비가 매출의 ${r.share(r.cost).toFixed(0)}%예요. 원가율이 높은 메뉴의 가격이나 레시피를 원가 탭에서 확인해 봐요.`);
  if (r.share(r.labor) > 35) tips.push(`직원 월급이 매출의 ${r.share(r.labor).toFixed(0)}%예요. 한가한 시간대 근무를 줄일 수 있는지 봐요.`);
  if (r.share(r.rent) > 15) tips.push(`월세가 매출의 ${r.share(r.rent).toFixed(0)}%예요. 매출을 올리거나 지원금으로 부담을 줄이는 방법을 봐요.`);
  if (!tips.length) tips.push('눈에 띄는 문제는 없어요. 이대로 이어가요.');
  return tips;
}
