'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { costRate, menuCost, priceForRate, settle } from '@/lib/calc';
import { bookOf, loadCost, rowsByMenu, type CostData } from '@/lib/data';
import { buildAlerts, monthOf, settlementYm } from '@/lib/dates';
import { man, pct, won } from '@/lib/format';
import { matchSubsidies } from '@/lib/subsidy';
import type { Settlement } from '@/lib/types';

type Month = { ym: string; sales: number; profit: number; costShare: number } | null;

const n = (c: Record<string, unknown>, k: string) => Number(c[k] ?? 0);
const toS = (c: Record<string, unknown>): Settlement => ({
  ym: String(c.ym), hall_won: n(c, 'hall_won'), deliv_won: n(c, 'deliv_won'), receipts: n(c, 'receipts'), days: n(c, 'days') || 30,
  open_stock_won: n(c, 'open_stock_won'), close_stock_won: n(c, 'close_stock_won'), theory_won: n(c, 'theory_won'),
  labor_won: n(c, 'labor_won'), ins_won: n(c, 'ins_won'), rent_won: n(c, 'rent_won'), util_won: n(c, 'util_won'),
  waste_won: n(c, 'waste_won'), etc_won: n(c, 'etc_won'), tax_won: n(c, 'tax_won'),
});

export default function HomePage() {
  const { sb, store } = useStore();
  const [d, setD] = useState<CostData | null>(null);
  const [month, setMonth] = useState<Month>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const now = new Date();
  const ym = settlementYm(now);

  useEffect(() => {
    (async () => {
      try {
        const cost = await loadCost(sb);
        const cur = await sb.from('settlements').select('*').eq('ym', ym).maybeSingle();
        if (cur.error) throw new Error('x');
        let m: Month = null;
        if (cur.data) {
          const row = cur.data as Record<string, unknown>;
          const ps = await sb.from('settlement_purchases').select('vendor,amount_won').eq('settlement_id', row.id as string);
          const r = settle(toS(row), (ps.data ?? []).map((x) => ({ vendor: String(x.vendor), amount_won: Number(x.amount_won) })));
          if (r.sales > 0) m = { ym, sales: r.sales, profit: r.profit, costShare: r.share(r.cost) };
        }
        setD(cost); setMonth(m); setReady(true);
      } catch { setErr('불러오지 못했어요. 새로고침해 주세요.'); }
    })();
  }, [sb, ym]);

  if (!ready || !d) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;

  const book = bookOf(d), byMenu = rowsByMenu(d.menuRows);
  const withRecipe = d.menus.filter((m) => (byMenu.get(m.id) ?? []).length > 0);
  const high = withRecipe
    .map((m) => { const cost = menuCost(byMenu.get(m.id) ?? [], book); return { m, cost, rate: costRate(cost, m.price) }; })
    .filter((x) => x.rate > 30).sort((a, b) => b.rate - a.rate).slice(0, 3);
  const toOrder = d.ingredients.filter((i) => i.order_qty > 0).length;
  const subsidyN = store.profile_done ? matchSubsidies(store).filter((x) => x.kind === 'grant' || x.kind === 'loan').length : 0;
  const dates = buildAlerts(store, now, 0).filter((a) => a.dday !== null).slice(0, 2);

  const steps: { done: boolean; title: string; sub: string; href: string }[] = [
    { done: store.profile_done, title: '받을 수 있는 지원금 찾기', sub: '질문 7개, 3분이면 돼요', href: '/subsidy' },
    { done: d.menus.length > 0 && withRecipe.length > 0, title: '메뉴 원가 만들기', sub: '재료 가격과 레시피를 넣거나, 예시로 먼저 둘러봐요', href: '/cost' },
    { done: month !== null, title: `${monthOf(ym)}월 정산 적기`, sub: '매출과 비용을 넣으면 남은 돈이 나와요', href: '/month' },
  ];
  const doneN = steps.filter((s) => s.done).length;

  return (
    <>
      <div className="hero"><span className="lbl">오늘의 가게</span><h1>사장님, 오늘 챙길 것만<br />모아 봤어요</h1></div>

      {doneN < steps.length && (
        <div className="card">
          <div className="row sp"><h3>시작 가이드</h3><span className="hint num">{doneN} / {steps.length}</span></div>
          {steps.map((s) => (
            <Link key={s.href} href={s.href} className="step">
              <span className={`stepdot ${s.done ? 'on' : ''}`} aria-hidden="true">{s.done ? '✓' : ''}</span>
              <span style={{ flex: 1 }}><b>{s.title}</b><span className="hint" style={{ display: 'block' }}>{s.sub}</span></span>
              <span className="hint" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}

      {month && (
        <Link href="/month" className="card list-link">
          <span className="lbl">{monthOf(month.ym)}월에 남은 돈</span>
          <div className="big" style={{ color: month.profit < 0 ? 'var(--bad)' : undefined }}>{man(month.profit)}<small>만원</small></div>
          <span className="hint">매출 {man(month.sales)}만원 · 재료비 {pct(month.costShare, 0)}%</span>
        </Link>
      )}

      {d.menus.length > 0 && (
        <div className="card">
          <div className="row sp"><h3>원가율 높은 메뉴</h3><Link href="/cost" className="lnk">원가 탭</Link></div>
          {withRecipe.length === 0 && <p className="hint">레시피를 넣으면 원가율이 계산돼요.</p>}
          {withRecipe.length > 0 && high.length === 0 && <p className="hint">모든 메뉴가 원가율 30% 이하예요. 잘 관리하고 계세요.</p>}
          {high.map((x) => (
            <div className="row sp" key={x.m.id}>
              <div><b>{x.m.name}</b><div className="hint">30%로 맞추려면 {won(priceForRate(x.cost))}원</div></div>
              <span className={`pill ${x.rate > 38 ? 'bad' : 'warn'}`}>{pct(x.rate)}%</span>
            </div>
          ))}
        </div>
      )}

      {toOrder > 0 && (
        <Link href="/stock" className="card list-link"><div className="row sp"><div><h3>발주할 품목 {toOrder}개</h3><span className="hint">재고 탭에서 발주서를 복사하거나 문자로 보내요</span></div><span className="hint" aria-hidden="true">›</span></div></Link>
      )}

      {subsidyN > 0 && (
        <Link href="/subsidy" className="card list-link"><div className="row sp"><div><h3>확인해 볼 지원금·대출 {subsidyN}건</h3><span className="hint">신청 순서까지 정리돼 있어요</span></div><span className="hint" aria-hidden="true">›</span></div></Link>
      )}

      <div className="card">
        <div className="row sp"><h3>다가오는 날짜</h3><Link href="/alerts" className="lnk">알림 탭</Link></div>
        {dates.map((a) => (
          <div className="row" key={a.key}><div className="dday">D-{a.dday}</div><div style={{ flex: 1 }}><b>{a.title}</b><div className="hint">{a.sub}</div></div></div>
        ))}
      </div>
    </>
  );
}
