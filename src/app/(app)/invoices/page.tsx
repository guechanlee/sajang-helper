'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { menuRates } from '@/lib/calc';
import { bookOf, loadCost, rowsByMenu, type CostData } from '@/lib/data';
import { won } from '@/lib/format';
import { invoiceTotals, isExtremePrice, menuImpacts, priceChanges, taxedFor, type DraftItem } from '@/lib/invoice';
import type { Invoice } from '@/lib/types';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
type Line = DraftItem & { key: number; priceStr: string; qtyStr: string; cat: string; register: boolean; kgStr: string };
const ING_CATS = ['공산품', '농산물', '정육', '해산물', '계란', '기타'];
type Saved = Invoice & { total: number };

export default function InvoicesPage() {
  const { sb, store } = useStore();
  const [d, setD] = useState<CostData | null>(null);
  const [list, setList] = useState<Saved[]>([]);
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([]);
  const [stockIn, setStockIn] = useState(true);
  const [confirmExtreme, setConfirmExtreme] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(1);
  const [limit, setLimit] = useState(30);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { name: string; qty: number; price: number }[]>>({});

  const reload = useCallback(async () => {
    try {
      const cost = await loadCost(sb);
      const inv = await sb.from('invoices').select('id,vendor,issued_on').order('issued_on', { ascending: false }).limit(limit);
      if (inv.error) throw new Error('x');
      const ids = (inv.data ?? []).map((i) => i.id as string);
      const its = ids.length ? await sb.from('invoice_items').select('invoice_id,unit_price_won,qty,taxed').in('invoice_id', ids) : { data: [], error: null };
      if (its.error) throw new Error('x');
      setD(cost);
      setList((inv.data ?? []).map((i) => ({
        id: i.id as string, vendor: i.vendor as string, issued_on: i.issued_on as string,
        total: invoiceTotals((its.data ?? []).filter((x) => x.invoice_id === i.id).map((x) => ({ unit_price_won: Number(x.unit_price_won), qty: Number(x.qty), taxed: Boolean(x.taxed) }))).total,
      })));
      setErr('');
    } catch { setErr('불러오지 못했어요. 새로고침해 주세요.'); }
  }, [sb, limit]);
  useEffect(() => { void reload(); }, [reload]);

  const book = useMemo(() => (d ? bookOf(d) : null), [d]);
  const draft: DraftItem[] = useMemo(() => lines.map((l) => ({ name: l.name, ingredient_id: l.ingredient_id, unit_price_won: Math.max(0, Math.round(Number(l.priceStr) || 0)), qty: Number(l.qtyStr) || 0, taxed: l.taxed })), [lines]);
  const valid = draft.filter((x) => x.name.trim() && x.qty > 0);

  if (!d || !book) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;

  const totals = invoiceTotals(valid);
  const changes = priceChanges(valid, book.ingredients);
  const extremes = changes.filter((c) => isExtremePrice(c.to, c.from));
  const byMenu = rowsByMenu(d.menuRows);
  const before = menuRates(d.menus, byMenu, book);
  const nextIngs = new Map(book.ingredients);
  for (const c of changes) { const g = nextIngs.get(c.ingredient_id); if (g) nextIngs.set(c.ingredient_id, { ...g, price: c.to }); }
  const after = menuRates(d.menus, byMenu, { ...book, ingredients: nextIngs });
  const impacts = menuImpacts(d.menus, before, after);

  const addLine = () => { setLines([...lines, { key: seq, name: '', ingredient_id: null, unit_price_won: 0, qty: 1, taxed: false, priceStr: '', qtyStr: '1', cat: '기타', register: false, kgStr: '' }]); setSeq(seq + 1); };
  const patch = (key: number, p: Partial<Line>) => { setConfirmExtreme(false); setLines(lines.map((l) => (l.key === key ? { ...l, ...p } : l))); };
  const pick = (key: number, id: string) => {
    const g = book.ingredients.get(id);
    if (!g) { patch(key, { ingredient_id: null, taxed: false, register: false }); return; }
    patch(key, { ingredient_id: id, name: g.name, priceStr: String(g.price), taxed: taxedFor(g), register: false });
  };
  const reset = () => { setOpen(false); setVendor(''); setDate(today()); setLines([]); setStockIn(true); setConfirmExtreme(false); };

  async function save() {
    if (!vendor.trim()) { setErr('거래처 이름을 적어 주세요.'); return; }
    if (!valid.length) { setErr('품목을 하나 이상 적어 주세요.'); return; }
    for (const l of lines) {
      if (l.register && !l.ingredient_id && l.name.trim() && !(Number(l.kgStr) > 0)) { setErr(`"${l.name.trim()}"을(를) 재료로 등록하려면 한 포장 무게(kg)를 적어 주세요.`); return; }
    }
    if (extremes.length && !confirmExtreme) { setConfirmExtreme(true); return; }
    setBusy(true); setErr('');
    // 직접 입력한 품목 중 "재료로 등록"을 고른 것은 먼저 재료로 만든다.
    const items: DraftItem[] = [];
    let registered = 0;
    for (const l of lines) {
      const it: DraftItem = { name: l.name.trim().slice(0, 80), ingredient_id: l.ingredient_id, unit_price_won: Math.max(0, Math.round(Number(l.priceStr) || 0)), qty: Number(l.qtyStr) || 0, taxed: l.taxed };
      if (!it.name || it.qty <= 0) continue;
      if (l.register && !l.ingredient_id) {
        const { data, error: e1 } = await sb.from('ingredients').insert({ store_id: store.id, name: it.name, vendor: vendor.trim().slice(0, 60), category: l.cat, spec_g: Math.round(Number(l.kgStr) * 1000), price: it.unit_price_won }).select('id').single();
        if (e1 || !data) { setBusy(false); setErr('재료로 등록하지 못했어요. 입력값을 확인해 주세요.'); return; }
        it.ingredient_id = data.id as string; registered++;
      }
      items.push(it);
    }
    const { error } = await sb.rpc('save_invoice', { p_store: store.id, p_vendor: vendor.trim().slice(0, 60), p_date: date, p_items: items, p_stock_in: stockIn });
    setBusy(false);
    if (error) { setErr('저장하지 못했어요. 입력값을 확인해 주세요.'); return; }
    const high = impacts.filter((m) => m.after > 38).map((m) => m.name);
    setMsg(['저장했어요.',
      changes.length ? `재료 단가 ${changes.length}개가 바뀌었어요.` : '',
      registered ? `새 재료 ${registered}개를 등록했어요.` : '',
      high.length ? `원가율이 38%를 넘은 메뉴: ${high.join(', ')}. 원가 탭에서 가격이나 레시피를 확인해 보세요.` : ''].filter(Boolean).join(' '));
    reset(); await reload();
  }

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (detail[id]) return;
    const { data, error } = await sb.from('invoice_items').select('name,qty,unit_price_won').eq('invoice_id', id);
    if (error) { setErr('품목을 불러오지 못했어요.'); return; }
    setDetail((o) => ({ ...o, [id]: (data ?? []).map((x) => ({ name: String(x.name), qty: Number(x.qty), price: Number(x.unit_price_won) })) }));
  }

  async function remove(id: string) {
    if (armed !== id) { setArmed(id); return; }
    setArmed(null);
    const { error } = await sb.from('invoices').delete().eq('id', id);
    if (error) { setErr('삭제하지 못했어요.'); return; }
    setMsg('삭제했어요. 이미 바뀐 단가와 재고는 되돌리지 않아요.'); await reload();
  }

  return (
    <>
      <div className="hero"><span className="lbl">매입</span><h1>거래명세서를 적으면<br />단가가 알아서 바뀌어요</h1><p>사진 인식은 아직 없어요. 지금은 직접 적어요.</p></div>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      {!open && <button className="btn" onClick={() => { setOpen(true); setMsg(''); if (!lines.length) addLine(); }}>거래명세서 추가</button>}
      {open && (
        <div className="card">
          <div className="row">
            <div className="field" style={{ flex: 1.3 }}><label htmlFor="iv">거래처</label><div className="inp"><input id="iv" maxLength={60} value={vendor} onChange={(e) => setVendor(e.target.value)} list="vendors" /></div>
              <datalist id="vendors">{[...new Set(d.ingredients.map((i) => i.vendor).filter(Boolean))].map((v) => <option key={v} value={v} />)}</datalist></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="id">날짜</label><div className="inp"><input id="id" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
          </div>
          {lines.map((l) => (
            <div className="rrow" key={l.key}>
              <div className="row">
                <select className="sel" aria-label="재료 연결" value={l.ingredient_id ?? ''} onChange={(e) => pick(l.key, e.target.value)}>
                  <option value="">직접 입력</option>{d.ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <button className="xbtn" aria-label="품목 삭제" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>×</button>
              </div>
              {!l.ingredient_id && (
                <>
                  <div className="inp"><input aria-label="품목명" maxLength={80} placeholder="품목명" value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} /></div>
                  <div className="row">
                    <select className="sel" aria-label="분류" value={l.cat} onChange={(e) => patch(l.key, { cat: e.target.value, taxed: e.target.value === '공산품' })}>{ING_CATS.map((c) => <option key={c}>{c}</option>)}</select>
                    <span className="hint" style={{ flex: 1.2 }}>{l.taxed ? '부가세 10% 포함' : '부가세 없음'}</span>
                  </div>
                  <label className="chk" style={{ borderBottom: 0, padding: '2px 0' }}><input type="checkbox" checked={l.register} onChange={(e) => patch(l.key, { register: e.target.checked })} /><span>재료로 등록해서 단가·재고·원가에 쓰기</span></label>
                  {l.register && <div className="inp"><input aria-label="한 포장 무게" type="number" inputMode="decimal" min={0} placeholder="예: 20" value={l.kgStr} onChange={(e) => patch(l.key, { kgStr: e.target.value })} /><span>kg 한 포장</span></div>}
                </>
              )}
              <div className="row">
                <div className="inp" style={{ flex: 1.2 }}><input aria-label="한 포장 가격" type="number" inputMode="numeric" min={0} value={l.priceStr} onChange={(e) => patch(l.key, { priceStr: e.target.value })} /><span>원/포장</span></div>
                <div className="inp" style={{ flex: 1 }}><input aria-label="수량" type="number" inputMode="decimal" min={0} value={l.qtyStr} onChange={(e) => patch(l.key, { qtyStr: e.target.value })} /><span>개</span></div>
              </div>
            </div>
          ))}
          {lines.length < 200 && <button className="btn ghost" onClick={addLine}>품목 추가</button>}
          <div className="row sp"><span>공급가</span><b className="num">{won(totals.supply)}원</b></div>
          <div className="row sp"><span>부가세 (공산품만)</span><b className="num">{won(totals.tax)}원</b></div>
          <div className="row sp"><span>합계</span><b className="num">{won(totals.total)}원</b></div>
          {changes.length > 0 && (
            <div className="note"><b>단가가 바뀌는 재료</b>
              {changes.map((c) => <div key={c.ingredient_id}>{c.name}: {won(c.from)} → {won(c.to)}원</div>)}</div>
          )}
          {impacts.length > 0 && (
            <div className="note"><b>원가율이 바뀌는 메뉴</b>
              {impacts.map((m) => <div key={m.menu_id}>{m.name}: {m.before.toFixed(1)}% → {m.after.toFixed(1)}%</div>)}</div>
          )}
          {confirmExtreme && <p className="err" role="alert">{extremes.map((e) => e.name).join(', ')}의 가격이 지난번과 2배 이상 차이 나요. 한 포장 기준(무게)이 맞는지 확인하고, 맞으면 한 번 더 저장을 눌러 주세요.</p>}
          <label className="chk" style={{ borderBottom: 0 }}><input type="checkbox" checked={stockIn} onChange={(e) => setStockIn(e.target.checked)} /><span>연결한 재료의 재고에 수량을 더하고 발주 수량을 0으로 해요</span></label>
          <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : confirmExtreme ? '그래도 저장' : '저장'}</button>
          <button className="btn line" onClick={reset}>취소</button>
        </div>
      )}
      <div className="card"><h3>최근 거래명세서</h3>
        {list.length === 0 && <p className="hint">아직 없어요.</p>}
        {list.map((i) => (
          <div className="inv" key={i.id}>
            <div className="row sp">
              <button className="inv-main" aria-expanded={openId === i.id} onClick={() => void toggleDetail(i.id)}>
                <b>{i.vendor}</b><span className="hint">{i.issued_on} · {openId === i.id ? '접기' : '품목 보기'}</span>
              </button>
              <div style={{ textAlign: 'right' }}><b className="num">{won(i.total)}원</b>
                <div><button className="xbtn" style={{ fontSize: 13 }} onClick={() => void remove(i.id)}>{armed === i.id ? '한 번 더 누르면 삭제' : '삭제'}</button></div></div>
            </div>
            {openId === i.id && (
              <ul className="inv-items">
                {(detail[i.id] ?? []).length === 0 && <li className="hint">불러오는 중…</li>}
                {(detail[i.id] ?? []).map((x, k) => <li key={k}><span>{x.name}</span><span className="num">{won(x.price)}원 × {x.qty}</span></li>)}
              </ul>
            )}
          </div>
        ))}
        {list.length >= limit && <button className="btn line" onClick={() => setLimit(limit + 30)}>더 보기</button>}</div>
    </>
  );
}
