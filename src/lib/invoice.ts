import { ingredientUnit } from './calc';
import { kg } from './format';
import type { Ingredient } from './types';

export const TAX_RATE = 0.1;

export type DraftItem = { name: string; ingredient_id: string | null; unit_price_won: number; qty: number; taxed: boolean };

/** 공산품만 과세로 본다(채소·정육·계란 등은 면세가 많다). 연결 안 된 품목은 면세로 둔다. */
export const taxedFor = (ing: Pick<Ingredient, 'category'> | undefined | null) => ing?.category === '공산품';

export function invoiceTotals(items: Pick<DraftItem, 'unit_price_won' | 'qty' | 'taxed'>[]) {
  let supply = 0, tax = 0;
  for (const it of items) {
    const a = it.unit_price_won * it.qty;
    supply += a;
    if (it.taxed) tax += Math.round(a * TAX_RATE);
  }
  return { supply, tax, total: supply + tax };
}

/** 단가가 지난 단가의 2배 이상이거나 절반 이하면 한 포장 기준이 틀렸을 가능성이 크다. */
export function isExtremePrice(price: number, current: number): boolean {
  return current > 0 && price > 0 && (price / current >= 2 || price / current <= 0.5);
}

export type PriceChange = { ingredient_id: string; name: string; from: number; to: number };

export function priceChanges(items: DraftItem[], ings: Map<string, Ingredient>): PriceChange[] {
  const out: PriceChange[] = [];
  for (const it of items) {
    if (!it.ingredient_id || it.unit_price_won <= 0) continue;
    const g = ings.get(it.ingredient_id);
    if (g && g.price !== it.unit_price_won) out.push({ ingredient_id: g.id, name: g.name, from: g.price, to: it.unit_price_won });
  }
  return out;
}

export type MenuImpact = { menu_id: string; name: string; before: number; after: number };

export function menuImpacts(
  menus: { id: string; name: string }[], before: Map<string, number>, after: Map<string, number>, minDiff = 0.1,
): MenuImpact[] {
  const out: MenuImpact[] = [];
  for (const m of menus) {
    const a = before.get(m.id) ?? 0, b = after.get(m.id) ?? 0;
    if (Math.abs(b - a) >= minDiff) out.push({ menu_id: m.id, name: m.name, before: a, after: b });
  }
  return out;
}

/** 거래처별 발주서 문자 */
export function orderText(ings: Ingredient[]): string {
  const vendors = [...new Set(ings.filter((i) => i.order_qty > 0).map((i) => i.vendor || '거래처 미지정'))];
  const lines: string[] = [];
  for (const v of vendors) {
    lines.push(`[${v}]`);
    for (const i of ings.filter((x) => x.order_qty > 0 && (x.vendor || '거래처 미지정') === v)) {
      lines.push(`- ${i.name} ${kg(i.spec_g)} × ${i.order_qty}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() || '발주 수량이 있는 품목이 없어요.';
}

export const stockValue = (ings: Pick<Ingredient, 'stock' | 'price'>[]) => ings.reduce((a, i) => a + i.stock * i.price, 0);

export { ingredientUnit };
