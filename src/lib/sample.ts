// "예시 데이터로 체험" 버튼용 가상 데이터. 실제 거래처·가격이 아니다.
export const SAMPLE_INGREDIENTS = [
  { key: 'oil', category: '공산품', vendor: 'A유통', name: '식용유', spec_g: 18000, price: 51400, loss_pct: 0, stock: 1, order_qty: 1 },
  { key: 'jjang', category: '공산품', vendor: 'A유통', name: '춘장', spec_g: 10000, price: 40500, loss_pct: 0, stock: 1, order_qty: 0 },
  { key: 'sugar', category: '공산품', vendor: 'A유통', name: '백설탕', spec_g: 15000, price: 25000, loss_pct: 0, stock: 1, order_qty: 0 },
  { key: 'soy', category: '공산품', vendor: 'A유통', name: '진간장', spec_g: 13000, price: 24000, loss_pct: 0, stock: 2, order_qty: 1 },
  { key: 'noodle', category: '공산품', vendor: 'A유통', name: '생면', spec_g: 5000, price: 9500, loss_pct: 0, stock: 3, order_qty: 2 },
  { key: 'starch', category: '공산품', vendor: 'A유통', name: '감자전분', spec_g: 10000, price: 22000, loss_pct: 0, stock: 1, order_qty: 0 },
  { key: 'chili', category: '공산품', vendor: 'A유통', name: '고춧가루', spec_g: 3000, price: 35000, loss_pct: 0, stock: 1, order_qty: 0 },
  { key: 'rice', category: '공산품', vendor: 'A유통', name: '쌀', spec_g: 20000, price: 62000, loss_pct: 0, stock: 2, order_qty: 0 },
  { key: 'onion', category: '농산물', vendor: 'B식자재', name: '양파', spec_g: 20000, price: 24000, loss_pct: 15, stock: 1, order_qty: 1 },
  { key: 'greenonion', category: '농산물', vendor: 'B식자재', name: '대파', spec_g: 1000, price: 2800, loss_pct: 20, stock: 3, order_qty: 2 },
  { key: 'carrot', category: '농산물', vendor: 'B식자재', name: '당근', spec_g: 10000, price: 15000, loss_pct: 10, stock: 1, order_qty: 0 },
  { key: 'pork', category: '정육', vendor: 'C정육', name: '돼지앞다리', spec_g: 10000, price: 78000, loss_pct: 12, stock: 1, order_qty: 0 },
  { key: 'shrimp', category: '해산물', vendor: 'D수산', name: '생새우', spec_g: 4500, price: 105000, loss_pct: 25, stock: 0, order_qty: 1 },
  { key: 'egg', category: '계란', vendor: 'E계란', name: '계란', spec_g: 1800, price: 5400, loss_pct: 0, stock: 4, order_qty: 0 },
] as const;

export const SAMPLE_PREPS = [
  { key: 'cooked', name: '조리밥', yield_g: 2300, rows: [{ ing: 'rice', qty_g: 1000 }] },
  { key: 'sauce', name: '짜장소스', yield_g: 4200, rows: [
    { ing: 'oil', qty_g: 300 }, { ing: 'jjang', qty_g: 500 }, { ing: 'onion', qty_g: 3000 },
    { ing: 'pork', qty_g: 600 }, { ing: 'sugar', qty_g: 160 }, { ing: 'soy', qty_g: 200 },
  ] },
] as const;

type SampleRow = { ing?: string; prep?: string; qty_g: number };
export const SAMPLE_MENUS: { category: '식사류' | '요리류'; name: string; price: number; rows: SampleRow[] }[] = [
  { category: '식사류', name: '짜장면', price: 8000, rows: [{ ing: 'noodle', qty_g: 230 }, { prep: 'sauce', qty_g: 250 }, { ing: 'onion', qty_g: 30 }] },
  { category: '식사류', name: '볶음밥', price: 9000, rows: [
    { prep: 'cooked', qty_g: 230 }, { ing: 'egg', qty_g: 90 }, { ing: 'oil', qty_g: 12 }, { ing: 'greenonion', qty_g: 10 },
    { ing: 'carrot', qty_g: 10 }, { prep: 'sauce', qty_g: 120 }, { ing: 'pork', qty_g: 40 },
  ] },
  { category: '식사류', name: '짬뽕', price: 10000, rows: [
    { ing: 'noodle', qty_g: 230 }, { ing: 'onion', qty_g: 80 }, { ing: 'greenonion', qty_g: 20 }, { ing: 'shrimp', qty_g: 60 },
    { ing: 'pork', qty_g: 50 }, { ing: 'oil', qty_g: 15 }, { ing: 'chili', qty_g: 15 },
  ] },
  { category: '요리류', name: '탕수육 (소)', price: 18000, rows: [
    { ing: 'pork', qty_g: 260 }, { ing: 'starch', qty_g: 130 }, { ing: 'oil', qty_g: 150 }, { ing: 'onion', qty_g: 30 },
    { ing: 'carrot', qty_g: 20 }, { ing: 'sugar', qty_g: 50 }, { ing: 'soy', qty_g: 20 }, { ing: 'egg', qty_g: 40 },
  ] },
];
