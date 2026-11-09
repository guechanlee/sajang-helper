'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { monthTips, settle } from '@/lib/calc';
import { monthOf, settlementYm } from '@/lib/dates';
import { man, manToWon, pct, won } from '@/lib/format';
import { invoiceTotals, stockValue } from '@/lib/invoice';
import type { Ingredient, Purchase, Settlement } from '@/lib/types';

const CHECKS = [
  '카드·현금 매출이 정산 금액과 맞는지 확인했어요',
  '배달앱 정산금(수수료 뺀 금액)을 확인했어요',
  '이번 달 거래명세서를 모두 입력했어요',
  '월말 재고를 세어 입력했어요',
  '직원 월급과 4대보험을 확인했어요',
  '세금(부가세 등) 납부 예정 금액을 확인했어요',
];

type Form = Record<'hall' | 'deliv' | 'receipts' | 'days' | 'open' | 'close' | 'theory' | 'labor' | 'ins' | 'rent' | 'util' | 'waste' | 'etc' | 'tax', string>;
type PRow = { vendor: string; man: string };
const EMPTY: Form = { hall: '', deliv: '', receipts: '', days: '30', open: '', close: '', theory: '', labor: '', ins: '', rent: '', util: '', waste: '', etc: '', tax: '' };
const shiftYm = (ym: string, d: number) => { const [y, m] = ym.split('-').map(Number) as [number, number]; const t = new Date(y, m - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
const m2w = (s: string) => Math.max(0, manToWon(Number(s) || 0));
const w2m = (w: number) => (w ? String(w / 10000) : '');

function toSettlement(ym: string, f: Form): Settlement {
  return {
    ym, hall_won: m2w(f.hall), deliv_won: m2w(f.deliv), receipts: Math.max(0, Math.round(Number(f.receipts) || 0)),
    days: Math.min(31, Math.max(1, Math.round(Number(f.days) || 30))),
    open_stock_won: m2w(f.open), close_stock_won: m2w(f.close), theory_won: m2w(f.theory),
    labor_won: m2w(f.labor), ins_won: m2w(f.ins), rent_won: m2w(f.rent), util_won: m2w(f.util),
    waste_won: m2w(f.waste), etc_won: m2w(f.etc), tax_won: m2w(f.tax),
  };
}
const toPurchases = (rows: PRow[]): Purchase[] => rows.filter((r) => r.vendor.trim()).map((r) => ({ vendor: r.vendor.trim().slice(0, 60), amount_won: m2w(r.man) }));

export default function MonthPage() {
  const { sb, store } = useStore();
  const defaultYm = settlementYm(new Date()); // 기본은 지난달
  const now0 = new Date();
  const maxYm = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}`; // 이번 달까지 볼 수 있다
  const [ym, setYm] = useState(defaultYm);
  const snap = useRef('');
  const [f, setF] = useState<Form>(EMPTY);
  const [rows, setRows] = useState<PRow[]>([]);
  const [checks, setChecks] = useState<Set<number>>(new Set());
  const [prev, setPrev] = useState<{ profit: number; sales: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const prevYm = shiftYm(ym, -1);

  const load = useCallback(async () => {
    try {
      const [cur, pv, ck] = await Promise.all([
        sb.from('settlements').select('*').eq('ym', ym).maybeSingle(),
        sb.from('settlements').select('*').eq('ym', prevYm).maybeSingle(),
        sb.from('checklist_checks').select('idx,checked').eq('ym', ym),
      ]);
      if (cur.error || pv.error || ck.error) throw new Error('load');
      setChecks(new Set((ck.data ?? []).filter((c) => c.checked).map((c) => Number(c.idx))));
      if (pv.data) {
        const p = pv.data as Record<string, unknown>;
        const ps = await sb.from('settlement_purchases').select('vendor,amount_won').eq('settlement_id', p.id as string);
        const r = settle(dbToS(p), (ps.data ?? []).map((x) => ({ vendor: x.vendor as string, amount_won: Number(x.amount_won) })));
        setPrev({ profit: r.profit, sales: r.sales });
      }
      if (cur.data) {
        const c = cur.data as Record<string, unknown>;
        const s = dbToS(c);
        const ps = await sb.from('settlement_purchases').select('vendor,amount_won').eq('settlement_id', c.id as string);
        setF({ hall: w2m(s.hall_won), deliv: w2m(s.deliv_won), receipts: s.receipts ? String(s.receipts) : '', days: String(s.days), open: w2m(s.open_stock_won), close: w2m(s.close_stock_won), theory: w2m(s.theory_won), labor: w2m(s.labor_won), ins: w2m(s.ins_won), rent: w2m(s.rent_won), util: w2m(s.util_won), waste: w2m(s.waste_won), etc: w2m(s.etc_won), tax: w2m(s.tax_won) });
        setRows((ps.data ?? []).map((x) => ({ vendor: x.vendor as string, man: w2m(Number(x.amount_won)) })));
      } else if (pv.data) {
        // 지난달 월말 재고가 이번 달 월초 재고
        setF((o) => ({ ...o, open: w2m(Number((pv.data as Record<string, unknown>).close_stock_won)), rent: w2m(Number((pv.data as Record<string, unknown>).rent_won)) }));
      }
      setReady(true); setErr('');
    } catch { setErr('불러오지 못했어요. 새로고침해 주세요.'); }
  }, [sb, ym, prevYm]);
  useEffect(() => {
    setReady(false); setF(EMPTY); setRows([]); setChecks(new Set()); setPrev(null); setMsg(''); snap.current = '';
    void load();
  }, [load]);
  // 불러온 직후의 값을 기억해 두고, 달라지면 "저장 안 됨"으로 본다.
  useEffect(() => { if (ready && snap.current === '') snap.current = JSON.stringify({ f, rows }); }, [ready, f, rows]);
  const dirty = ready && snap.current !== '' && snap.current !== JSON.stringify({ f, rows });
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!ready) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => { setMsg(''); setF({ ...f, [k]: e.target.value }); };
  const s = toSettlement(ym, f), r = settle(s, toPurchases(rows));

  const field = (k: keyof Form, label: string, unit = '만원', hint?: string) => (
    <div className="field"><label htmlFor={`f-${k}`}>{label}</label>
      <div className="inp"><input id={`f-${k}`} type="number" inputMode="decimal" min={0} value={f[k]} onChange={set(k)} /><span>{unit}</span></div>
      {hint && <span className="hint">{hint}</span>}</div>
  );

  async function importInvoices() {
    setErr('');
    const [yy, mm] = ym.split('-').map(Number) as [number, number];
    const start = `${ym}-01`, end = `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`; // 그 달의 실제 마지막 날
    const { data: inv, error } = await sb.from('invoices').select('id,vendor').gte('issued_on', start).lte('issued_on', end);
    if (error) { setErr('거래명세서를 불러오지 못했어요.'); return; }
    if (!inv?.length) { setMsg(`${monthOf(ym)}월 날짜로 입력된 거래명세서가 없어요. 명세서 날짜가 다른 달이면 위의 ← → 로 그 달로 옮겨 보세요.`); return; }
    const { data: its, error: e2 } = await sb.from('invoice_items').select('invoice_id,unit_price_won,qty,taxed').in('invoice_id', inv.map((i) => i.id as string));
    if (e2) { setErr('거래명세서를 불러오지 못했어요.'); return; }
    const sum = new Map<string, number>();
    for (const i of inv) {
      const mine = (its ?? []).filter((x) => x.invoice_id === i.id).map((x) => ({ unit_price_won: Number(x.unit_price_won), qty: Number(x.qty), taxed: Boolean(x.taxed) }));
      sum.set(i.vendor as string, (sum.get(i.vendor as string) ?? 0) + invoiceTotals(mine).total);
    }
    setRows([...sum.entries()].map(([vendor, w]) => ({ vendor, man: String(Math.round(w / 100) / 100) })));
    setMsg('거래처별 합계를 가져왔어요. 확인하고 저장해 주세요.');
  }

  async function importStock() {
    const { data, error } = await sb.from('ingredients').select('stock,price');
    if (error) { setErr('재고를 불러오지 못했어요.'); return; }
    const v = stockValue((data ?? []).map((x) => ({ stock: Number(x.stock), price: Number(x.price) })) as Pick<Ingredient, 'stock' | 'price'>[]);
    setF({ ...f, close: w2m(Math.round(v)) }); setMsg('재고 탭의 금액을 가져왔어요.');
  }

  async function save() {
    setBusy(true); setErr(''); setMsg('');
    const { error } = await sb.rpc('save_settlement', { p_store: store.id, p_ym: ym, p_s: s, p_purchases: toPurchases(rows) });
    setBusy(false);
    if (error) { setErr('저장하지 못했어요. 숫자를 확인해 주세요.'); return; }
    snap.current = JSON.stringify({ f, rows }); setMsg('저장했어요.');
  }

  async function toggle(i: number) {
    const on = !checks.has(i);
    const next = new Set(checks); if (on) next.add(i); else next.delete(i); setChecks(next);
    const { error } = await sb.from('checklist_checks').upsert({ store_id: store.id, ym, idx: i, checked: on });
    if (error) { setErr('체크를 저장하지 못했어요.'); setChecks(checks); }
  }

  const tips = monthTips(r);
  const missing: string[] = [];
  if (r.sales > 0) {
    if (r.purchases === 0 && s.open_stock_won === 0 && s.close_stock_won === 0) missing.push('재료비');
    if (r.labor === 0) missing.push('인건비');
    if (r.rent === 0) missing.push('월세');
  }
  const stockOdd = r.sales > 0 && r.cost < 0;
  function downloadCsv() {
    const rowsOut: [string, string | number][] = [
      ['정산 월', ym], ['홀·포장 매출', s.hall_won], ['배달 매출', s.deliv_won], ['매출 합계', r.sales],
      ['재료 매입 합계', r.purchases], ['월초 재고', s.open_stock_won], ['월말 재고', s.close_stock_won], ['재료비(재고 반영)', r.cost],
      ['직원 월급', s.labor_won], ['4대보험', s.ins_won], ['월세·관리비', s.rent_won], ['전기·가스·수도', s.util_won],
      ['포장재·소모품', s.waste_won], ['기타', s.etc_won], ['세금', s.tax_won], ['남은 돈', r.profit],
    ];
    for (const p of toPurchases(rows)) rowsOut.push([`매입: ${p.vendor}`, p.amount_won]);
    const csv = '\uFEFF' + rowsOut.map(([k, v]) => `"${String(k).replace(/"/g, '""')}",${v}`).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `settlement-${ym}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const diff = prev ? r.profit - prev.profit : null;

  return (
    <>
      <div className="hero"><span className="lbl">월 정산</span><h1>{monthOf(ym)}월에 얼마 남았는지<br />차례로 적어요</h1><p>모르는 칸은 비워도 돼요. 아는 것부터 넣으면 아래 결과가 바로 바뀌어요. 보통은 지난달을 정산해요. 이번 달 진행 상황도 → 로 넘겨서 적어 볼 수 있어요.</p></div>
      <div className="row sp monthnav">
        <button className="btn line" aria-label="이전 달" disabled={ym <= shiftYm(defaultYm, -23)} onClick={() => setYm(shiftYm(ym, -1))}>←</button>
        <b>{ym.slice(0, 4)}년 {monthOf(ym)}월</b>
        <button className="btn line" aria-label="다음 달" disabled={ym >= maxYm} onClick={() => setYm(shiftYm(ym, 1))}>→</button>
      </div>
      <div className="card"><h3>1. 매출</h3>
        {field('hall', '홀·포장 매출')}{field('deliv', '배달 매출 (수수료 뺀 정산금)')}
        <div className="row">{field('receipts', '결제 건수', '건')}{field('days', '영업일', '일')}</div></div>
      <div className="card"><h3>2. 재료비</h3>
        <span className="hint lead">거래처별 매입액 (부가세 포함)</span>
        <button className="lnk" style={{ marginTop: -6 }} onClick={() => void importInvoices()}>거래명세서에서 가져오기</button>
        {rows.map((p, i) => (
          <div className="row" key={i}>
            <div className="inp" style={{ flex: 1.3 }}><input aria-label="거래처" maxLength={60} placeholder="거래처" value={p.vendor} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, vendor: e.target.value } : x)))} /></div>
            <div className="inp" style={{ flex: 1 }}><input aria-label="매입액" type="number" inputMode="decimal" min={0} value={p.man} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, man: e.target.value } : x)))} /><span>만원</span></div>
            <button className="xbtn" aria-label="삭제" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        {rows.length < 100 && <button className="btn ghost" onClick={() => setRows([...rows, { vendor: '', man: '' }])}>거래처 추가</button>}
        {field('open', '월초 재고 금액', '만원', '지난달 정산이 있으면 그 월말 재고가 자동으로 들어와요.')}
        {field('close', '월말 재고 금액')}
        <button className="lnk" style={{ marginTop: -6 }} onClick={() => void importStock()}>재고 탭에서 가져오기</button>
        {field('theory', '이론 재료비 (선택)', '만원', '메뉴를 전부 레시피대로 만들었다면 들었을 재료값이에요. 넣으면 실제 재료비와 비교해 낭비·손실 비율을 보여줘요. 모르면 비워 두세요.')}</div>
      <div className="card"><h3>3. 그 밖의 비용</h3>
        {field('labor', '직원 월급')}{field('ins', '4대보험')}{field('rent', '월세·관리비')}{field('util', '전기·가스·수도')}{field('waste', '포장재·소모품')}{field('etc', '기타')}{field('tax', '세금 (납부했거나 낼 부가세·소득세)', '만원', '거래명세서 합계에 이미 들어 있는 부가세는 재료비에 포함돼 있으니 여기엔 또 넣지 마세요.')}</div>

      <div className="card">
        <span className="lbl">{monthOf(ym)}월 남은 돈</span>
        <div className="big" style={{ color: r.profit < 0 ? "var(--bad)" : undefined }}>{man(r.profit)}<small>만원</small></div>
        {diff !== null && <span className="hint">지난달보다 {diff >= 0 ? "+" : ""}{man(diff)}만원</span>}
        <div className="row sp"><span>매출</span><b className="num">{won(r.sales)}원</b></div>
        <div className="row sp"><span>재료비 (재고 반영)</span><b className="num">{won(r.cost)}원 · {pct(r.share(r.cost), 0)}%</b></div>
        <div className="row sp"><span>인건비</span><b className="num">{won(r.labor)}원 · {pct(r.share(r.labor), 0)}%</b></div>
        <div className="row sp"><span>월세</span><b className="num">{won(r.rent)}원 · {pct(r.share(r.rent), 0)}%</b></div>
        <div className="row sp"><span>하루 평균 매출</span><b className="num">{won(r.day)}원</b></div>
        <div className="row sp"><span>객단가</span><b className="num">{won(r.ticket)}원</b></div>
        {r.loss !== null && <div className="row sp"><span>재료 낭비·손실</span><b className="num">{pct(r.loss)}%</b></div>}
        {stockOdd && <p className="warnbox" role="status">월말 재고가 월초 재고와 이번 달 매입을 합친 것보다 커요. 매입액이나 월초 재고가 빠졌는지 확인해 주세요.</p>}
        {missing.length > 0 && <p className="warnbox" role="status">아직 안 넣은 칸이 있어요: {missing.join(', ')}. 이 상태의 남은 돈은 실제보다 크게 보일 수 있어요.</p>}
        {tips.map((t) => <p key={t} className="hint">· {t}</p>)}
        <button className="lnk" style={{ alignSelf: 'flex-start' }} onClick={downloadCsv}>정산표 내려받기 (엑셀용)</button>
      </div>

      <div className="card"><h3>마감 전 확인</h3>
        {CHECKS.map((c, i) => (
          <div className="chk" key={c}><input id={`c${i}`} type="checkbox" checked={checks.has(i)} onChange={() => void toggle(i)} /><label htmlFor={`c${i}`}>{c}</label></div>
        ))}</div>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      {dirty && !msg && <p className="hint" role="status">아직 저장하지 않았어요.</p>}
      <button className="btn" onClick={() => void save()} disabled={busy}>{busy ? '저장 중…' : '이 달 정산 저장'}</button>
    </>
  );
}

function dbToS(c: Record<string, unknown>): Settlement {
  const n = (k: string) => Number(c[k] ?? 0);
  return { ym: String(c.ym), hall_won: n('hall_won'), deliv_won: n('deliv_won'), receipts: n('receipts'), days: n('days') || 30,
    open_stock_won: n('open_stock_won'), close_stock_won: n('close_stock_won'), theory_won: n('theory_won'),
    labor_won: n('labor_won'), ins_won: n('ins_won'), rent_won: n('rent_won'), util_won: n('util_won'),
    waste_won: n('waste_won'), etc_won: n('etc_won'), tax_won: n('tax_won') };
}
