'use client';
import { useState } from 'react';
import { sbClient } from '@/lib/supabase/client';
import { isConfigured, siteUrl } from '@/lib/supabase/env';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setState('error'); setMsg('이메일 주소를 확인해 주세요.'); return; }
    setState('sending');
    const { error } = await sbClient().auth.signInWithOtp({
      email: v,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) { setState('error'); setMsg('링크를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return; }
    setState('sent');
  }

  if (!isConfigured()) {
    return <div id="app"><div className="note">서비스 설정이 아직 끝나지 않았어요. README의 &quot;처음 설정&quot;을 확인해 주세요.</div></div>;
  }
  return (
    <div id="app">
      <div className="top"><span className="brand">사장님 도우미</span></div>
      <div className="hero"><h1>이메일로 로그인해요</h1><p>비밀번호는 필요 없어요. 메일로 받은 링크를 누르면 들어와요.</p></div>
      {state === 'sent' ? (
        <div className="card"><h3>메일을 보냈어요</h3><p className="hint">{email.trim()} 로 보낸 링크를 눌러 주세요. 몇 분 안에 오지 않으면 스팸함도 확인해 주세요.</p></div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="field"><label htmlFor="email">이메일</label>
            <div className="inp big-in"><input id="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
          {state === 'error' && <div className="err" role="alert">{msg}</div>}
          <button className="btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? '보내는 중' : '로그인 링크 받기'}</button>
        </form>
      )}
      <div className="note">로그인하면 <a href="/privacy">개인정보 처리 안내</a>를 읽은 것으로 봐요.</div>
    </div>
  );
}
