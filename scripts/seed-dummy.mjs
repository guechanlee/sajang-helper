// 더미 데이터를 넣는다: dummy@test.local / dummypass1234 계정에 재료 60개, 메뉴 28개, 명세서 45건, 월 정산 4개월, 리뷰 70개.
// 이미 있으면 그 계정의 데이터를 지우고 다시 넣는다. 다른 계정은 건드리지 않는다.
// 사용(Docker): docker compose exec app node scripts/seed-dummy.mjs [이메일]
//   이메일을 주면 그 계정(이미 있어야 해요)에 넣는다. 예: ... seed-dummy.mjs admin@sajang.local  (그 계정의 기존 데이터는 지워진다)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
  }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL 이 없어요.'); process.exit(1); }
const EMAIL = (process.argv[2] ?? 'dummy@test.local').trim().toLowerCase();
if (EMAIL === 'dummy@test.local') execFileSync('node', ['scripts/create-user.mjs', EMAIL, 'dummypass1234'], { stdio: 'inherit', env: process.env });
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [[u]] = await c.query('select id from users where email = ?', [EMAIL]);
if (!u) { console.error(`${EMAIL} 계정이 없어요. 먼저 create-user.mjs 로 만들어 주세요.`); process.exit(1); }
let [[s]] = await c.query('select id from stores where owner_id=?', [u.id]);
if (!s) { const sid = id(); await c.query('insert into stores (id, owner_id) values (?,?)', [sid, u.id]); s = { id: sid }; }
const S = s.id;
for (const t of ['reviews','invoice_items','invoices','settlement_purchases','settlements','menu_rows','menus','prep_rows','preps','ingredients','checklist_checks']) await c.query(`delete from ${t} where store_id=?`, [S]);
await c.query("update stores set name='행복분식 마포점', biz_type='food', status='run', opened_before_2025=1, annual_sales_man=9500, sales_dropped=0, is_rent=1, income_tier='mid', profile_done=1, address='서울 마포구 월드컵로 12길 3', phone='02-123-4567', biz_no='220-81-62517', place_url='https://map.naver.com/p/entry/place/1234567890', place_id='1234567890' where id=?", [S]);
const cats = ['공산품','농산물','정육','해산물','계란','기타'], vendors = ['A유통','B식자재','C정육','D수산','E계란','F마트'];
const ings = [];
for (let i = 0; i < 60; i++) { const x = { id: id(), name: `재료${i + 1}${i % 7 === 0 ? ' (아주 긴 이름의 재료 규격 테스트용 이름입니다)' : ''}`, cat: cats[i % 6], v: vendors[i % 6], spec: [500, 1000, 5000, 10000, 20000][i % 5], price: 3000 + (i * 1370) % 90000, loss: (i % 4) * 5, stock: i % 5, ord: i % 9 === 0 ? 2 : 0 };
  ings.push(x); await c.query('insert into ingredients (id,store_id,category,vendor,name,spec_g,price,loss_pct,stock,order_qty) values (?,?,?,?,?,?,?,?,?,?)', [x.id, S, x.cat, x.v, x.name, x.spec, x.price, x.loss, x.stock, x.ord]); }
const preps = [];
for (let i = 0; i < 3; i++) { const p = { id: id() }; preps.push(p); await c.query('insert into preps (id,store_id,name,yield_g) values (?,?,?,?)', [p.id, S, `반제품${i + 1}`, 2000]);
  for (let j = 0; j < 3; j++) await c.query('insert into prep_rows (id,store_id,prep_id,ingredient_id,qty_g) values (?,?,?,?,?)', [id(), S, p.id, ings[i * 3 + j].id, 300 + j * 50]); }
const mcats = ['식사류','요리류','사이드·음료'];
for (let i = 0; i < 28; i++) { const m = id(); await c.query('insert into menus (id,store_id,category,name,price) values (?,?,?,?,?)', [m, S, mcats[i % 3], i === 5 ? '아주아주 긴 이름의 시그니처 세트 메뉴 (2~3인용) 특대' : `메뉴${i + 1}`, 5000 + (i % 8) * 1500]);
  if (i % 9 !== 8) for (let j = 0; j < 4; j++) await c.query('insert into menu_rows (id,store_id,menu_id,ingredient_id,prep_id,qty_g) values (?,?,?,?,?,?)', [id(), S, m, j === 3 ? null : ings[(i * 2 + j) % 60].id, j === 3 ? preps[i % 3].id : null, 40 + j * 30]); }
const day = (back) => { const d = new Date(Date.now() - back * 86400000); return d.toISOString().slice(0, 10); };
for (let i = 0; i < 45; i++) { const inv = id(); await c.query('insert into invoices (id,store_id,vendor,issued_on) values (?,?,?,?)', [inv, S, vendors[i % 6], day(i * 3)]);
  for (let j = 0; j < 3; j++) { const g = ings[(i * 3 + j) % 60]; await c.query('insert into invoice_items (id,store_id,invoice_id,ingredient_id,name,unit_price_won,qty,taxed) values (?,?,?,?,?,?,?,?)', [id(), S, inv, g.id, g.name, g.price, 1 + j, g.cat === '공산품']); } }
const now = new Date();
for (let k = 1; k <= 4; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const sid = id();
  await c.query('insert into settlements (id,store_id,ym,hall_won,deliv_won,receipts,days,open_stock_won,close_stock_won,theory_won,labor_won,ins_won,rent_won,util_won,waste_won,etc_won,tax_won) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [sid, S, ym, 32000000 + k * 900000, 14000000, 1500 + k * 20, 28, 1800000, 1500000 + k * 50000, 8000000, 11000000, 1200000, 3000000, 700000, 350000, 200000, 1800000]);
  for (const [vi, v] of vendors.slice(0, 4).entries()) await c.query('insert into settlement_purchases (id,store_id,settlement_id,vendor,amount_won) values (?,?,?,?,?)', [id(), S, sid, v, 3000000 + vi * 700000]); }
const bodies = ['맛있어요! 또 올게요 😊', '음식이 너무 늦게 나왔어요. 불친절했습니다.', '<script>alert(1)</script> 특수문자 & "따옴표" \'작은따옴표\' 테스트', '그냥 그래요', 'x'.repeat(1000), '양이 많고 가격이 착해요\n줄바꿈도 있어요\n세 번째 줄', '', '위생이 걱정돼요. 머리카락이 나왔어요.'];
for (let i = 0; i < 70; i++) await c.query('insert into reviews (id,store_id,source,author,rating,body,reviewed_on,reply,replied) values (?,?,?,?,?,?,?,?,?)', [id(), S, ['naver','kakao','google','baemin','coupang','etc'][i % 6], i % 4 === 0 ? '' : `손님${i}`, 1 + (i * 7) % 5, bodies[i % bodies.length], day(i), i % 3 === 0 ? '감사합니다 :)' : '', i % 3 === 0]);
const [[n]] = await c.query('select (select count(*) from ingredients where store_id=?) ing, (select count(*) from menus where store_id=?) menus, (select count(*) from invoices where store_id=?) inv, (select count(*) from reviews where store_id=?) rv', [S, S, S, S]);
console.log(n); await c.end();
console.log(EMAIL === 'dummy@test.local' ? '끝났어요. 아이디 dummy@test.local / 비밀번호 dummypass1234 로 로그인하세요.' : `끝났어요. ${EMAIL} 로 로그인하면 더미 데이터가 보여요.`);
