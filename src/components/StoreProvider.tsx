'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { dbClient, type DbClient } from '@/lib/db/client';
import type { StoreProfile } from '@/lib/types';

type Ctx = { sb: DbClient; store: StoreProfile; setStore: (s: StoreProfile) => void; reloadStore: () => Promise<void> };
const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider 밖에서 사용했어요');
  return c;
};

const COLS = 'id,name,biz_type,status,opened_before_2025,annual_sales_man,sales_dropped,is_rent,income_tier,profile_done,address,phone,biz_no,place_url,place_id';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [sb] = useState(() => dbClient());
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    let { data, error } = await sb.from('stores').select(COLS).maybeSingle();
    if (!error && !data) {
      // 가게가 아직 없거나, 데이터를 모두 지운 경우 새로 만든다(주인은 서버가 로그인 정보로 채운다).
      const ins = await sb.from('stores').insert({}).select(COLS).single();
      data = ins.data; error = ins.error;
    }
    if (error || !data) { setErr('가게 정보를 불러오지 못했어요.'); return; }
    setStore(data as StoreProfile);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  if (err) return <div className="card"><p className="err" role="alert">{err}</p><button className="btn line" onClick={() => void load()}>다시 시도</button></div>;
  if (!store) return <p className="hint">불러오는 중…</p>;
  return <StoreCtx.Provider value={{ sb, store, setStore, reloadStore: load }}>{children}</StoreCtx.Provider>;
}
