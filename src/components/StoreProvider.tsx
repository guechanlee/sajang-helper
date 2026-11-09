'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sbClient } from '@/lib/supabase/client';
import type { StoreProfile } from '@/lib/types';

type Ctx = { sb: SupabaseClient; store: StoreProfile; setStore: (s: StoreProfile) => void; reloadStore: () => Promise<void> };
const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider 밖에서 사용했어요');
  return c;
};

const COLS = 'id,name,biz_type,status,opened_before_2025,annual_sales_man,sales_dropped,is_rent,income_tier,profile_done';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [sb] = useState(() => sbClient());
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const { data: u } = await sb.auth.getUser();
    if (!u.user) { window.location.href = '/login'; return; }
    let { data, error } = await sb.from('stores').select(COLS).maybeSingle();
    if (!error && !data) {
      // 가입 직후 가게가 아직 없거나, 데이터를 모두 지운 경우 새로 만든다.
      const ins = await sb.from('stores').insert({ owner_id: u.user.id }).select(COLS).single();
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
