'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setMsg('이메일 주소를 확인해 주세요.'); return; }
    if (mode === 'signup' && pw.length < 8) { setMsg('비밀번호는 8자 이상으로 해 주세요.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, password: pw }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMsg(body.error ?? '잠시 뒤 다시 시도해 주세요.'); setBusy(false); return; }
      window.location.href = '/subsidy';
    } catch {
      setMsg('서버에 연결하지 못했어요.'); setBusy(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <>
      <div className="hero"><h1>{signup ? '처음이시군요' : '다시 오셨네요'}</h1><p>{signup ? '이메일과 비밀번호만 정하면 바로 시작해요.' : '가입한 이메일과 비밀번호로 들어와요.'}</p></div>
      <form className="card" onSubmit={submit}>
        <div className="field"><label htmlFor="email">이메일</label>
          <div className="inp big-in"><input id="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="pw">비밀번호{signup ? ' (8자 이상)' : ''}</label>
          <div className="inp big-in"><input id="pw" type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></div></div>
        {msg && <div className="err" role="alert">{msg}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? '잠시만요' : signup ? '가입하고 시작하기' : '로그인'}</button>
        <button className="btn line" type="button" onClick={() => { setMode(signup ? 'login' : 'signup'); setMsg(''); }}>{signup ? '이미 가입했어요' : '처음이에요 (가입)'}</button>
      </form>
    </>
  );
}
