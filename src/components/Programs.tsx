'use client';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { REGIONS, type RankedProgram } from '@/lib/programs';

type Payload = { items: RankedProgram[]; total: number; syncedAt: string | null };

// 정부 공고(기업마당) 중 내 가게에 맞을 법한 것. 자격 판정이 아니라 "찾아볼 만한 목록"이다.
export function Programs() {
  const { sb, store, setStore } = useStore();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const res = await fetch('/api/programs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const j = (await res.json()) as { data: Payload | null; error: { message: string } | null };
      if (j.error || !j.data) throw new Error(j.error?.message);
      setData(j.data);
    } catch { setErr('공고를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
  }, []);

  useEffect(() => { void load(); }, [load, store.region, store.status]);

  async function pickRegion(region: string) {
    const { error } = await sb.from('stores').update({ region: region || null }).eq('id', store.id);
    if (error) { setErr('지역을 저장하지 못했어요.'); return; }
    setStore({ ...store, region: region || null });
  }

  return (
    <>
      <h2 className="q" style={{ marginTop: 24 }}>더 찾아본 정부 공고</h2>
      <div className="card">
        <div className="field"><label htmlFor="region">가게가 있는 지역</label>
          <select id="region" className="sel" value={store.region ?? ''} onChange={(e) => void pickRegion(e.target.value)}>
            <option value="">선택 안 함 (전국 공고만)</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></div>
        <p className="hint">지역을 고르면 우리 지역 지자체 공고도 같이 보여드려요.</p>
      </div>
      {err && <p className="err" role="alert">{err} <button className="lnk" onClick={() => void load()}>다시 시도</button></p>}
      {!data && !err && <p className="hint">불러오는 중…</p>}
      {data && data.total === 0 && (
        <div className="note">공고 데이터가 아직 없어요. 운영자가 공고 동기화(<code>npm run programs:sync</code>)를 한 번 실행해야 목록이 채워져요.</div>
      )}
      {data && data.total > 0 && data.items.length === 0 && <div className="card"><h3>지금 맞는 공고가 없어요</h3><p className="hint">마감이 지났거나 조건이 맞지 않는 공고는 뺐어요.</p></div>}
      {data?.items.map((p) => (
        <div className="card" key={p.id}>
          <div className="row sp">
            <span className="pill warn">{p.region ?? '전국'}</span>
            <span className="hint">{p.dday === null ? (p.applyText || '접수 기간 확인') : p.dday === 0 ? '오늘 마감' : `마감 D-${p.dday}`}</span>
          </div>
          <h3>{p.name}</h3>
          <p className="hint">{p.org}</p>
          {p.summary && <p className="hint">{p.summary}{p.summary.length >= 160 ? '…' : ''}</p>}
          {p.notes.map((n) => <p className="hint" key={n}>※ {n}</p>)}
          {p.url && <a className="btn line" href={p.url} target="_blank" rel="noopener noreferrer">공고 원문 보기</a>}
        </div>
      ))}
      {data && data.total > 0 && (
        <div className="note">
          기업마당 공고를 업종·지역·마감일로 걸러서 보여주는 참고용 목록이에요. 신청 자격은 판정하지 않아요. 반드시 원문의 신청 조건을 확인하세요.
          {data.syncedAt && <> (공고 갱신 {new Date(data.syncedAt).toLocaleDateString('ko-KR')})</>}
        </div>
      )}
    </>
  );
}
