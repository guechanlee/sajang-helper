'use client';
import { useCallback, useEffect, useState } from 'react';
import { LedgerNav } from '@/components/LedgerNav';
import { useStore } from '@/components/StoreProvider';
import { settlementYm, monthOf } from '@/lib/dates';
import { man, won } from '@/lib/format';
import { orderText, stockValue } from '@/lib/invoice';
import type { Ingredient } from '@/lib/types';

const numVal = (n: number) => (n === 0 ? '' : n);

export default function StockPage() {
  const { sb, store } = useStore();
  const [ings, setIngs] = useState<Ingredient[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const reload = useCallback(async () => {
    const { data, error } = await sb.from('ingredients').select('*').order('vendor').order('name');
    if (error) { setErr('불러오지 못했어요. 새로고침해 주세요.'); return; }
    setIngs((data ?? []).map((x) => ({ ...(x as Ingredient), spec_g: Number(x.spec_g), loss_pct: Number(x.loss_pct), stock: Number(x.stock), order_qty: Number(x.order_qty) })));
    setErr('');
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);

  if (!ings) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;
  if (!ings.length) return <><LedgerNav /><div className="hero"><span className="lbl">재고·발주</span><h1>먼저 원가 탭에서<br />재료를 넣어 주세요</h1></div></>;

  const patch = (id: string, p: Partial<Ingredient>) => setIngs(ings.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const save = async (id: string, col: 'stock' | 'order_qty') => {
    const i = ings.find((x) => x.id === id); if (!i) return;
    const v = Math.max(0, Number(i[col]) || 0);
    patch(id, { [col]: v });
    const { error } = await sb.from('ingredients').update({ [col]: v }).eq('id', id);
    if (error) { setErr('저장하지 못했어요.'); await reload(); } else setErr('');
  };

  const total = stockValue(ings);
  const text = orderText(ings);
  const ym = settlementYm(new Date());

  async function toMonth() {
    setMsg(''); setErr('');
    const { data: cur, error: e1 } = await sb.from('settlements').select('id').eq('ym', ym).maybeSingle();
    if (e1) { setErr('저장하지 못했어요.'); return; }
    const row = Math.round(total);
    const { error } = cur
      ? await sb.from('settlements').update({ close_stock_won: row }).eq('id', cur.id as string)
      : await sb.from('settlements').insert({ store_id: store.id, ym, close_stock_won: row });
    if (error) { setErr('저장하지 못했어요.'); return; }
    setMsg(`${monthOf(ym)}월 정산의 월말 재고로 넣었어요.`);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setMsg('발주서를 복사했어요.'); } catch { setMsg('복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.'); }
  }

  const hit = (i: Ingredient) => !q.trim() || `${i.name} ${i.vendor}`.includes(q.trim());
  const vendors = [...new Set(ings.filter(hit).map((i) => i.vendor || '거래처 미지정'))];
  return (
    <>
      <LedgerNav />
      <div className="hero"><span className="lbl">재고·발주</span><h1>지금 가진 재고는<br />{man(Math.round(total))}만원어치예요</h1></div>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      {ings.length > 6 && <div className="inp"><input aria-label="재료 검색" type="search" placeholder={`재료·거래처 검색 (전체 ${ings.length}개)`} value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {q.trim() && vendors.length === 0 && <p className="hint">찾는 재료가 없어요.</p>}
      {vendors.map((v) => (
        <div className="card" key={v}><h3>{v}</h3>
          {ings.filter((i) => hit(i) && (i.vendor || '거래처 미지정') === v).map((i) => (
            <div className="rrow" key={i.id}>
              <div className="row sp"><b>{i.name}</b><span className="hint num">{won(i.stock * i.price)}원</span></div>
              <div className="row">
                <div className="inp" style={{ flex: 1 }}><input aria-label={`${i.name} 재고`} type="number" inputMode="decimal" min={0} placeholder="0" value={numVal(i.stock)} onChange={(e) => patch(i.id, { stock: Number(e.target.value) })} onBlur={() => void save(i.id, 'stock')} /><span>포장 재고</span></div>
                <div className="inp" style={{ flex: 1 }}><input aria-label={`${i.name} 발주`} type="number" inputMode="decimal" min={0} placeholder="0" value={numVal(i.order_qty)} onChange={(e) => patch(i.id, { order_qty: Number(e.target.value) })} onBlur={() => void save(i.id, 'order_qty')} /><span>포장 발주</span></div>
              </div>
            </div>
          ))}</div>
      ))}
      <div className="card"><h3>발주서</h3><pre className="num" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{text}</pre>
        <button className="btn ghost" onClick={() => void copy()}>복사하기</button>
        {text.startsWith('[') && <a className="btn line" href={`sms:?&body=${encodeURIComponent(text)}`}>문자로 보내기</a>}</div>
      <button className="btn line" onClick={() => void toMonth()}>이 금액을 {monthOf(ym)}월 정산의 월말 재고로 넣기</button>
      <div className="note">재고는 "포장" 단위예요. 재고 금액 = 포장 수 × 한 포장 가격이에요. 거래명세서를 저장하면 재고가 자동으로 늘어요.</div>
    </>
  );
}
