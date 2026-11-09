'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import Link from 'next/link';
import { StoreForm } from '@/components/StoreForm';
import { buildAlerts } from '@/lib/dates';
import { matchSubsidies } from '@/lib/subsidy';

const TABLES = ['reviews', 'stores', 'ingredients', 'preps', 'prep_rows', 'menus', 'menu_rows', 'settlements', 'settlement_purchases', 'invoices', 'invoice_items', 'checklist_checks'];

export default function AlertsPage() {
  const { sb, store, reloadStore } = useStore();
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);
  const open = store.profile_done ? matchSubsidies(store).filter((m) => m.kind === 'grant' || m.kind === 'loan').length : 0;
  const alerts = buildAlerts(store, now, open);

  async function download() {
    setBusy(true); setMsg('');
    try {
      const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const t of TABLES) {
        const { data, error } = await sb.from(t).select('*');
        if (error) throw error;
        out[t] = data;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'sajang-helper-data.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg('내려받았어요.');
    } catch { setMsg('내려받지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
    setBusy(false);
  }

  async function wipe() {
    if (!armed) { setArmed(true); return; }
    setBusy(true); setMsg('');
    const { error } = await sb.from('stores').delete().eq('id', store.id); // 하위 데이터는 모두 함께 지워진다
    if (error) { setMsg('지우지 못했어요. 잠시 뒤 다시 시도해 주세요.'); setBusy(false); return; }
    setArmed(false); setMsg('모든 데이터를 지웠어요.'); await reloadStore(); setBusy(false);
  }

  return (
    <>
      <div className="hero"><span className="lbl">더보기</span><h1>지원금, 리뷰,<br />가게 정보</h1></div>
      <Link href="/subsidy" className="card list-link"><div className="row sp"><div><h3>지원금 찾기</h3><span className="hint">내 가게가 받을 수 있는 돈과 줄일 수 있는 세금</span></div><span className="hint" aria-hidden="true">›</span></div></Link>
      <Link href="/reviews" className="card list-link"><div className="row sp"><div><h3>리뷰 관리</h3><span className="hint">답글 안 단 리뷰 챙기기, 답글 초안</span></div><span className="hint" aria-hidden="true">›</span></div></Link>
      <StoreForm />
      <h2 style={{ fontSize: 18, margin: '8px 0 -4px' }}>놓치면 아까운 날짜</h2>
      <p className="hint" style={{ marginTop: -8 }}>세금 기한은 실제 날짜예요. 지원금 마감일은 공고마다 달라서 공식 공고에서 확인해 주세요.</p>
      {alerts.map((a) => (
        <div className="card" key={a.key}><div className="row"><div className="dday">{a.dday === null ? a.tag : `D-${a.dday}`}</div><div style={{ flex: 1 }}><h3>{a.title}</h3><p className="hint">{a.sub}</p></div></div></div>
      ))}
      <div className="card">
        <h3>내 데이터</h3>
        <p className="hint">내 데이터는 다른 사장님과 분리돼 있고, 나만 볼 수 있어요. 아래에서 내려받거나 모두 지울 수 있어요.</p>
        <button className="btn line" onClick={() => void download()} disabled={busy}>내 데이터 내려받기 (JSON)</button>
        <button className="btn line" onClick={() => void wipe()} disabled={busy}>{armed ? '한 번 더 누르면 모두 지워져요' : '내 데이터 모두 지우기'}</button>
        {msg && <p className="hint" role="status">{msg}</p>}
      </div>
    </>
  );
}
