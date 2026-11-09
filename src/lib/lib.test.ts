import { describe, expect, it } from 'vitest';
import { costRate, ingredientUnit, menuCost, priceForRate, prepUnit, rateLevel, settle, monthTips, type CostBook } from './calc';
import { buildAlerts, daysUntil, nextOccurrence, settlementYm } from './dates';
import { invoiceTotals, isExtremePrice, menuImpacts, orderText, priceChanges, taxedFor } from './invoice';
import { SAMPLE_INGREDIENTS, SAMPLE_MENUS, SAMPLE_PREPS } from './sample';
import { matchSubsidies, totalMax } from './subsidy';
import type { Ingredient, MenuRow, Prep, PrepRow } from './types';

// 예시 데이터로 원가 장부를 만든다.
function sampleBook() {
  const ingredients = new Map<string, Ingredient>();
  const byKey = new Map<string, Ingredient>();
  SAMPLE_INGREDIENTS.forEach((s, i) => {
    const ing: Ingredient = { id: `i${i}`, store_id: 's', category: s.category, vendor: s.vendor, name: s.name,
      spec_g: s.spec_g, price: s.price, loss_pct: s.loss_pct, stock: s.stock, order_qty: s.order_qty };
    ingredients.set(ing.id, ing); byKey.set(s.key, ing);
  });
  const preps = new Map<string, Prep>(); const prepByKey = new Map<string, Prep>(); const prepRows: PrepRow[] = [];
  SAMPLE_PREPS.forEach((p, i) => {
    const prep: Prep = { id: `p${i}`, store_id: 's', name: p.name, yield_g: p.yield_g };
    preps.set(prep.id, prep); prepByKey.set(p.key, prep);
    p.rows.forEach((r, j) => prepRows.push({ id: `pr${i}-${j}`, prep_id: prep.id, ingredient_id: byKey.get(r.ing)!.id, qty_g: r.qty_g }));
  });
  const book: CostBook = { ingredients, preps, prepRows };
  const menus = SAMPLE_MENUS.map((m, i) => {
    const rows: MenuRow[] = m.rows.map((r, j) => ({ id: `m${i}-${j}`, menu_id: `m${i}`, qty_g: r.qty_g,
      ingredient_id: r.ing ? byKey.get(r.ing)!.id : null, prep_id: r.prep ? prepByKey.get(r.prep)!.id : null }));
    return { id: `m${i}`, name: m.name, price: m.price, rows };
  });
  return { book, byKey, menus };
}

describe('원가', () => {
  it('g당 단가는 버리는 비율을 반영한다', () => {
    expect(ingredientUnit({ spec_g: 20000, price: 24000, loss_pct: 15 })).toBeCloseTo(1.4118, 3);
    expect(ingredientUnit({ spec_g: 18000, price: 51400, loss_pct: 0 })).toBeCloseTo(2.8556, 3);
  });
  it('0 나누기를 하지 않는다', () => {
    expect(ingredientUnit({ spec_g: 1000, price: 100, loss_pct: 100 })).toBe(0);
    expect(costRate(1000, 0)).toBe(0);
  });
  it('반제품 g당 원가 = 재료 합 ÷ 완성량', () => {
    const { book } = sampleBook();
    const sauce = [...book.preps.values()].find((p) => p.name === '짜장소스')!;
    expect(prepUnit(sauce, book)).toBeCloseTo(3.1124, 3);
  });
  it('예시 메뉴 원가율이 프로토타입과 같다', () => {
    const { book, menus } = sampleBook();
    const rate = (n: string) => { const m = menus.find((x) => x.name === n)!; return costRate(menuCost(m.rows, book), m.price); };
    expect(rate('짜장면')).toBeCloseTo(15.7, 1);
    expect(rate('볶음밥')).toBeCloseTo(15.5, 1);
    expect(rate('짬뽕')).toBeCloseTo(31.5, 1);
    expect(rate('탕수육 (소)')).toBeCloseTo(18.5, 1);
  });
  it('원가율 단계와 30% 맞춤 가격', () => {
    expect(rateLevel(30)).toBe('good'); expect(rateLevel(35)).toBe('warn'); expect(rateLevel(39)).toBe('bad');
    expect(priceForRate(3148, 30)).toBe(10500);
  });
});

describe('월 정산', () => {
  const base = { ym: '2026-10', hall_won: 10_000_000, deliv_won: 15_000_000, receipts: 0, days: 30, open_stock_won: 0, close_stock_won: 0,
    theory_won: 0, labor_won: 4_000_000, ins_won: 600_000, rent_won: 3_000_000, util_won: 500_000, waste_won: 100_000, etc_won: 400_000, tax_won: 0 };
  const purchases = [{ vendor: 'A', amount_won: 5_000_000 }, { vendor: 'B', amount_won: 2_000_000 }];
  it('남은 돈을 계산한다 (기대 940만 원)', () => {
    const r = settle(base, purchases);
    expect(r.sales).toBe(25_000_000); expect(r.cost).toBe(7_000_000); expect(r.labor).toBe(4_600_000);
    expect(r.admin).toBe(1_000_000); expect(r.profit).toBe(9_400_000);
    expect(r.share(r.profit)).toBeCloseTo(37.6, 1);
  });
  it('재고 차이를 재료비에 반영하고 로스율을 낸다', () => {
    const r = settle({ ...base, open_stock_won: 2_000_000, close_stock_won: 1_000_000, theory_won: 7_000_000 }, purchases);
    expect(r.cost).toBe(8_000_000); expect(r.loss).toBeCloseTo(14.29, 1);
    expect(settle(base, purchases).loss).toBeNull();
  });
  it('매출 0이어도 NaN이 없다', () => {
    const r = settle({ ...base, hall_won: 0, deliv_won: 0 }, []);
    expect(Number.isFinite(r.share(r.cost))).toBe(true); expect(r.day).toBe(0); expect(monthTips(r)).toEqual([]);
  });
  it('높은 비율을 알려준다', () => {
    const r = settle({ ...base, rent_won: 6_000_000 }, [{ vendor: 'A', amount_won: 12_000_000 }]);
    const tips = monthTips(r).join(' ');
    expect(tips).toMatch(/재료비/); expect(tips).toMatch(/월세/);
  });
});

describe('지원금 매칭', () => {
  const ids = (m: { id: string }[]) => m.map((x) => x.id);
  const base = { opened_before_2025: true, annual_sales_man: 8500, sales_dropped: false, is_rent: false, income_tier: 'mid' as const };

  it('운영 중 + 연매출 8,500만 + 매출 감소 + 월세', () => {
    const m = matchSubsidies({ ...base, status: 'run', sales_dropped: true, is_rent: true });
    expect(ids(m)).toEqual(expect.arrayContaining(['voucher', 'improve', 'yellow', 'loan-general', 'loan-refi', 'smartshop', 'vat-simple', 'lease', 'newstart']));
    expect(ids(m)).not.toContain('demo');
    expect(ids(m)).not.toContain('loan-growth');
    expect(m.find((x) => x.id === 'yellow')!.max).toBe(1_056_000);
  });
  it('합계에는 받는 돈·세금만 들어가고 대출은 빠진다', () => {
    const m = matchSubsidies({ ...base, status: 'run', sales_dropped: true });
    // 바우처 25만 + 경영개선 2천만 + 스마트상점 500만 + 노란우산 105.6만
    expect(totalMax(m)).toBe(250_000 + 20_000_000 + 5_000_000 + 1_056_000);
  });
  it('연매출 1.2억이면 바우처 없음, 성장기반자금 있음', () => {
    const m = matchSubsidies({ ...base, status: 'run', opened_before_2025: false, annual_sales_man: 12000, income_tier: 'high' });
    expect(ids(m)).not.toContain('voucher');
    expect(ids(m)).toContain('loan-growth');
    expect(ids(m)).toContain('newbiz');
    expect(ids(m)).not.toContain('vat-simple');
  });
  it('연매출 4,800만 미만이면 부가세 면제 안내', () => {
    const m = matchSubsidies({ ...base, status: 'run', annual_sales_man: 3000 });
    expect(ids(m)).toContain('vat-free');
    expect(ids(m)).not.toContain('vat-simple');
  });
  it('소득 하위면 근로장려금·신용취약 자금 안내', () => {
    const m = matchSubsidies({ ...base, status: 'run', income_tier: 'low' });
    expect(ids(m)).toEqual(expect.arrayContaining(['eitc', 'loan-weak']));
  });
  it('폐업 + 월세 → 철거비·재창업·폐업 지원, 바우처·노란우산 가입 안내 없음', () => {
    const m = matchSubsidies({ ...base, status: 'think', annual_sales_man: 20000, sales_dropped: true, is_rent: true });
    expect(ids(m)).toEqual(expect.arrayContaining(['demo', 'restart', 'close-consult', 'job', 'unemp', 'yellow-close', 'retry-loan', 'newstart']));
    expect(ids(m)).not.toEqual(expect.arrayContaining(['voucher']));
    expect(ids(m)).not.toContain('yellow');
  });
  it('폐업 + 자가 → 철거비 없음', () => {
    const m = matchSubsidies({ status: 'closed', opened_before_2025: null, annual_sales_man: 3000, sales_dropped: null, is_rent: false, income_tier: null });
    expect(ids(m)).toContain('restart');
    expect(ids(m)).not.toContain('demo');
  });
  it('제도 id는 겹치지 않고, 전체 제도는 25개 이상이다', () => {
    const all = new Set<string>();
    for (const status of ['run', 'think', 'closed'] as const)
      for (const sales of [3000, 8500, 20000])
        for (const tier of ['low', 'mid', 'high', null] as const)
          for (const dropped of [true, false])
            for (const rent of [true, false])
              for (const before of [true, false]) {
                const m = matchSubsidies({ status, opened_before_2025: before, annual_sales_man: sales, sales_dropped: dropped, is_rent: rent, income_tier: tier });
                expect(new Set(ids(m)).size).toBe(m.length);
                m.forEach((x) => { all.add(x.id); expect(x.todo.length).toBeGreaterThan(0); });
              }
    expect(all.size).toBeGreaterThanOrEqual(25);
  });
});

describe('명세서', () => {
  const { byKey, book } = sampleBook();
  it('A유통 명세서 합계 (공급가 197,600 / 세액 19,760 / 합계 217,360)', () => {
    const items = [['oil', 53800, 2], ['jjang', 41000, 1], ['sugar', 25000, 1], ['soy', 24000, 1]].map(([k, p, q]) => ({
      name: String(k), ingredient_id: byKey.get(String(k))!.id, unit_price_won: Number(p), qty: Number(q), taxed: taxedFor(byKey.get(String(k))) }));
    expect(invoiceTotals(items)).toEqual({ supply: 197_600, tax: 19_760, total: 217_360 });
  });
  it('채소는 면세, 연결 안 된 품목도 면세', () => {
    expect(taxedFor(byKey.get('onion'))).toBe(false); expect(taxedFor(undefined)).toBe(false);
  });
  it('가격 변동과 메뉴 영향', () => {
    const items = [{ name: '양파', ingredient_id: byKey.get('onion')!.id, unit_price_won: 26500, qty: 2, taxed: false }];
    const ch = priceChanges(items, book.ingredients);
    expect(ch).toHaveLength(1); expect(ch[0]!.from).toBe(24000); expect(ch[0]!.to).toBe(26500);
    const { menus } = sampleBook();
    const before = new Map(menus.map((m) => [m.id, costRate(menuCost(m.rows, book), m.price)]));
    const after2 = sampleBook(); after2.byKey.get('onion')!.price = 26500;
    const after = new Map(after2.menus.map((m) => [m.id, costRate(menuCost(m.rows, after2.book), m.price)]));
    const imp = menuImpacts(menus, before, after);
    expect(imp.length).toBeGreaterThan(0); expect(imp.every((x) => x.after > x.before)).toBe(true);
  });
  it('단가가 2배 이상 또는 절반 이하면 이상 값', () => {
    expect(isExtremePrice(5000, 51400)).toBe(true); expect(isExtremePrice(53800, 51400)).toBe(false);
    expect(isExtremePrice(100000, 51400)).toBe(false); expect(isExtremePrice(110000, 51400)).toBe(true);
    expect(isExtremePrice(0, 51400)).toBe(false);
  });
  it('발주서는 거래처별로 묶인다', () => {
    const t = orderText([...book.ingredients.values()]);
    expect(t).toContain('[A유통]'); expect(t).toContain('- 식용유 18kg × 1'); expect(t).toContain('[B식자재]');
    expect(orderText([])).toMatch(/없어요/);
  });
});

describe('날짜·알림', () => {
  it('정산 월은 지난달, 1월이면 작년 12월', () => {
    expect(settlementYm(new Date(2026, 10, 9))).toBe('2026-10');
    expect(settlementYm(new Date(2027, 0, 5))).toBe('2026-12');
  });
  it('다음 기한 계산', () => {
    const now = new Date(2026, 10, 9);
    expect(daysUntil(nextOccurrence(12, 31, now), now)).toBe(52);
    expect(daysUntil(nextOccurrence(1, 25, now), now)).toBe(77);
    expect(nextOccurrence(11, 9, now).getFullYear()).toBe(2026); // 오늘이면 오늘
  });
  it('폐업 사장님에게는 노란우산 알림이 없고, 지난 날짜는 나오지 않는다', () => {
    const now = new Date(2026, 10, 9);
    const a = buildAlerts({ status: 'closed', is_rent: true, profile_done: true }, now, 2);
    expect(a.find((x) => x.key === 'yellow')).toBeUndefined();
    expect(a.find((x) => x.key === 'demo')).toBeDefined();
    expect(a.every((x) => x.dday === null || x.dday >= 0)).toBe(true);
    expect(buildAlerts(null, now, 0).find((x) => x.key === 'yellow')).toBeDefined();
  });
});
