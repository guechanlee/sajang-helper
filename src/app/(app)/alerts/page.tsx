'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { buildAlerts } from '@/lib/dates';
import { matchSubsidies } from '@/lib/subsidy';

const TABLES = ['stores', 'ingredients', 'preps', 'prep_rows', 'menus', 'menu_rows', 'settlements', 'settlement_purchases', 'invoices', 'invoice_items', 'checklist_checks'];

export default function AlertsPage() {
  const { sb, store, reloadStore } = useStore();
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);
  const open = store.profile_done ? matchSubsidies(store).filter((m) => m.id !== 'yellow').length : 0;
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
      <div className="hero"><span className="lbl">알림</span><h1>놓치면 아까운 날짜</h1><p>세금 기한은 실제 날짜예요. 지원금 마감은 공고가 열리면 채워 넣어요.</p></div>
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
