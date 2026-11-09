export type Ingredient = {
  id: string; store_id: string; category: string; vendor: string; name: string;
  spec_g: number; price: number; loss_pct: number; stock: number; order_qty: number;
};
export type Prep = { id: string; store_id: string; name: string; yield_g: number };
export type PrepRow = { id: string; prep_id: string; ingredient_id: string; qty_g: number };
export type Menu = { id: string; store_id: string; category: string; name: string; price: number };
export type MenuRow = { id: string; menu_id: string; ingredient_id: string | null; prep_id: string | null; qty_g: number };

export type StoreProfile = {
  id: string; name: string;
  biz_type: 'cafe' | 'food' | 'pub' | null;
  status: 'run' | 'think' | 'closed';
  opened_before_2025: boolean | null;
  annual_sales_man: number | null;
  sales_dropped: boolean | null;
  is_rent: boolean | null;
  income_tier: 'low' | 'mid' | 'high' | 'unk' | null;
  profile_done: boolean;
};

export type Settlement = {
  id?: string; ym: string;
  hall_won: number; deliv_won: number; receipts: number; days: number;
  open_stock_won: number; close_stock_won: number; theory_won: number;
  labor_won: number; ins_won: number; rent_won: number; util_won: number; waste_won: number; etc_won: number; tax_won: number;
};
export type Purchase = { vendor: string; amount_won: number };

export type InvoiceItemInput = { name: string; ingredient_id: string | null; unit_price_won: number; qty: number };
export type Invoice = { id: string; vendor: string; issued_on: string };
export type InvoiceItem = InvoiceItemInput & { id: string; invoice_id: string; taxed: boolean };
