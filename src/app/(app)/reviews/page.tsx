'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BackToMore } from '@/components/BackToMore';
import { useStore } from '@/components/StoreProvider';
import { placePage, SMARTPLACE_ADMIN } from '@/lib/place';
import { draftReplies, SOURCES, summarize } from '@/lib/reviews';
import type { Review } from '@/lib/types';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function ReviewsPage() {
  const { sb, store } = useStore();
  const [list, setList] = useState<Review[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ source: 'naver' as Review['source'], rating: 5, author: '', body: '', date: today() });
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(20);

  const reload = useCallback(async () => {
    const { data, error } = await sb.from('reviews').select('*').order('reviewed_on', { ascending: false }).limit(300);
    if (error) { setErr('불러오지 못했어요. 새로고침해 주세요.'); return; }
    setList((data ?? []).map((r) => ({ ...(r as Review), rating: Number(r.rating), replied: Boolean(r.replied) })));
    setErr('');
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);

  if (!list) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;

  const sum = summarize(list);
  const shown = filter === 'open' ? list.filter((r) => !r.replied) : list;
  const link = placePage(store);

  async function add() {
    setErr(''); setMsg('');
    if (!f.body.trim() && !f.author.trim()) { setErr('리뷰 내용을 붙여 넣어 주세요.'); return; }
    setBusy(true);
    const { error } = await sb.from('reviews').insert({ store_id: store.id, source: f.source, rating: f.rating, author: f.author.trim().slice(0, 40), body: f.body.trim().slice(0, 1000), reviewed_on: f.date });
    setBusy(false);
    if (error) { setErr('저장하지 못했어요. 입력값을 확인해 주세요.'); return; }
    setAdding(false); setF({ ...f, author: '', body: '', rating: 5 }); setMsg('리뷰를 기록했어요.'); await reload();
  }

  async function saveReply(r: Review, done: boolean) {
    setErr('');
    const { error } = await sb.from('reviews').update({ reply: draft.trim().slice(0, 1000), replied: done }).eq('id', r.id);
    if (error) { setErr('저장하지 못했어요.'); return; }
    setReplyFor(null); setMsg(done ? '답글 완료로 표시했어요.' : '초안을 저장했어요.'); await reload();
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMsg('복사했어요. 스마트플레이스에서 붙여 넣으세요.'); } catch { setMsg('복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.'); }
  }
  async function remove(id: string) {
    if (armed !== id) { setArmed(id); return; }
    setArmed(null);
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if (error) { setErr('삭제하지 못했어요.'); return; }
    await reload();
  }

  return (
    <>
      <BackToMore />
      <div className="hero"><span className="lbl">리뷰 관리</span><h1>답글 안 단 리뷰를<br />놓치지 않게 챙겨요</h1><p>네이버 리뷰는 앱이 자동으로 가져올 수 없어요. 스마트플레이스에서 리뷰를 복사해 여기에 기록하면 답글 초안과 미답변 관리를 도와드려요.</p></div>

      <div className="card">
        <div className="row sp"><span className="lbl">리뷰 현황</span><span className="hint">기록한 리뷰 기준</span></div>
        {sum.count === 0 ? <p className="hint">아직 기록한 리뷰가 없어요.</p> : (
          <>
            <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
              <div className="big">{sum.avg.toFixed(1)}<small>점</small></div>
              <div className="hint" style={{ paddingBottom: 6 }}>리뷰 {sum.count}개 · 답글 안 단 것 <b style={{ color: sum.unreplied ? 'var(--accent)' : undefined }}>{sum.unreplied}개</b></div>
            </div>
            <div className="dist">
              {sum.dist.map((d) => (
                <div className="drow" key={d.star}><span className="hint num">{d.star}점</span><div className="fit-bar"><i style={{ width: `${(d.n / sum.count) * 100}%` }} /></div><span className="hint num">{d.n}</span></div>
              ))}
            </div>
          </>
        )}
        <div className="linkrow">
          <a className="btn line" href={SMARTPLACE_ADMIN} target="_blank" rel="noopener noreferrer">스마트플레이스에서 리뷰 보기</a>
          {link && <a className="btn line" href={link} target="_blank" rel="noopener noreferrer">내 플레이스 페이지</a>}
        </div>
        {!link && <p className="hint">내 가게 주소를 저장해 두면 바로 열 수 있어요. <Link href="/more" className="lnk">가게 정보 입력</Link></p>}
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}

      {!adding && <button className="btn" onClick={() => { setAdding(true); setMsg(''); }}>리뷰 기록하기</button>}
      {adding && (
        <div className="card">
          <h3>리뷰 기록</h3>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label htmlFor="rs">어디 리뷰예요?</label>
              <select id="rs" className="sel" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Review['source'] })}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="rd">날짜</label><div className="inp"><input id="rd" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div></div>
          </div>
          <div className="field"><span className="lbl">별점</span>
            <div className="starpick" role="radiogroup" aria-label="별점">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n}점`} className={f.rating >= n ? 'on' : ''} onClick={() => setF({ ...f, rating: n })}>★</button>)}
            </div></div>
          <div className="field"><label htmlFor="ra">작성자 (선택)</label><div className="inp"><input id="ra" maxLength={40} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></div></div>
          <div className="field"><label htmlFor="rb">리뷰 내용</label><textarea id="rb" className="ta" rows={4} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="스마트플레이스에서 리뷰를 복사해 붙여 넣어 주세요" /></div>
          <button className="btn" disabled={busy} onClick={() => void add()}>{busy ? '저장 중…' : '기록하기'}</button>
          <button className="btn line" onClick={() => setAdding(false)}>취소</button>
        </div>
      )}

      {list.length > 0 && (
        <div className="seg">
          <button aria-pressed={filter === 'open'} onClick={() => { setFilter('open'); setMore(20); }}>답글 안 단 것 {sum.unreplied}</button>
          <button aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setMore(20); }}>전체 {sum.count}</button>
        </div>
      )}
      {list.length > 0 && shown.length === 0 && <div className="card"><p className="hint">답글 안 단 리뷰가 없어요. 잘 챙기고 계세요.</p></div>}

      {shown.slice(0, more).map((r) => (
        <div className="card" key={r.id}>
          <div className="row sp"><span className="stars" aria-label={`${r.rating}점`}>{stars(r.rating)}</span><span className="hint">{SOURCES[r.source]} · {r.reviewed_on}</span></div>
          {(r.author || r.body) && <div><b>{r.author || '익명'}</b>{r.body && <p className="rbody">{r.body}</p>}</div>}
          {r.replied && replyFor !== r.id && <div className="reply"><span className="lbl">내 답글</span><p>{r.reply || '(내용 없이 완료로 표시됨)'}</p></div>}
          {replyFor === r.id ? (
            <>
              <span className="lbl">답글 초안 (고쳐서 쓰세요)</span>
              <div className="chips">{draftReplies(store.name, r.rating, r.author).map((d) => <button key={d.label} className="chip" onClick={() => setDraft(d.text)}>{d.label}</button>)}</div>
              <textarea className="ta" rows={5} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="답글" />
              <div className="linkrow">
                <button className="btn ghost" disabled={!draft.trim()} onClick={() => void copy(draft)}>복사</button>
                <a className="btn line" href={SMARTPLACE_ADMIN} target="_blank" rel="noopener noreferrer">답글 달러 가기</a>
              </div>
              <button className="btn" onClick={() => void saveReply(r, true)}>답글 달았어요 (완료로 표시)</button>
              <button className="btn line" onClick={() => void saveReply(r, false)}>초안만 저장</button>
              <button className="xbtn" style={{ alignSelf: 'center' }} onClick={() => setReplyFor(null)}>닫기</button>
            </>
          ) : (
            <div className="row sp">
              <button className="lnk" onClick={() => { setReplyFor(r.id); setDraft(r.reply || draftReplies(store.name, r.rating, r.author)[0]!.text); setMsg(''); }}>{r.replied ? '답글 수정' : '답글 쓰기'}</button>
              <button className="xbtn" style={{ fontSize: 13 }} onClick={() => void remove(r.id)}>{armed === r.id ? '한 번 더 누르면 삭제' : '삭제'}</button>
            </div>
          )}
        </div>
      ))}
      {shown.length > more && <button className="btn line" onClick={() => setMore(more + 20)}>더 보기 ({shown.length - more}개 남음)</button>}
      <div className="note">리뷰에 답글을 달면 다른 손님도 볼 수 있어요. 개인정보나 보상 약속은 쓰지 않는 게 좋아요. 답글은 스마트플레이스에서 직접 등록해야 해요.</div>
    </>
  );
}
