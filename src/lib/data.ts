import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostBook } from './calc';
import type { Ingredient, Menu, MenuRow, Prep, PrepRow } from './types';

export type CostData = { ingredients: Ingredient[]; preps: Prep[]; prepRows: PrepRow[]; menus: Menu[]; menuRows: MenuRow[] };

export async function loadCost(sb: SupabaseClient): Promise<CostData> {
  const [i, p, pr, m, mr] = await Promise.all([
    sb.from('ingredients').select('*').order('created_at'),
    sb.from('preps').select('*').order('name'),
    sb.from('prep_rows').select('id,prep_id,ingredient_id,qty_g'),
    sb.from('menus').select('*').order('created_at'),
    sb.from('menu_rows').select('id,menu_id,ingredient_id,prep_id,qty_g'),
  ]);
  const bad = [i, p, pr, m, mr].find((r) => r.error);
  if (bad?.error) throw new Error(bad.error.message);
  const num = <T extends Record<string, unknown>>(rows: T[] | null, keys: string[]) =>
    (rows ?? []).map((r) => { const o: Record<string, unknown> = { ...r }; for (const k of keys) o[k] = Number(o[k]); return o as T; });
  return {
    ingredients: num(i.data as Ingredient[], ['spec_g', 'loss_pct', 'stock', 'order_qty']),
    preps: num(p.data as Prep[], ['yield_g']),
    prepRows: num(pr.data as PrepRow[], ['qty_g']),
    menus: (m.data ?? []) as Menu[],
    menuRows: num(mr.data as MenuRow[], ['qty_g']),
  };
}

export function bookOf(d: CostData): CostBook {
  return {
    ingredients: new Map(d.ingredients.map((x) => [x.id, x])),
    preps: new Map(d.preps.map((x) => [x.id, x])),
    prepRows: d.prepRows,
  };
}

export const rowsByMenu = (rows: MenuRow[]) => {
  const m = new Map<string, MenuRow[]>();
  for (const r of rows) m.set(r.menu_id, [...(m.get(r.menu_id) ?? []), r]);
  return m;
};
