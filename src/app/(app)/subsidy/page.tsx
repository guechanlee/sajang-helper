'use client';
import { useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { man } from '@/lib/format';
import { matchSubsidies, RULES_CHECKED_ON, totalMax, type Kind, type SubsidyMatch } from '@/lib/subsidy';

const GROUPS: { kind: Kind; title: string; desc: string }[] = [
  { kind: 'grant', title: '받는 돈 · 지원', desc: '갚지 않아도 되는 지원금과 혜택이에요.' },
  { kind: 'tax', title: '세금 줄이기', desc: '내야 할 세금이 줄어드는 제도예요.' },
  { kind: 'loan', title: '대출 · 보증', desc: '낮은 금리로 빌리는 돈이에요. 갚아야 해서 위쪽 합계에는 넣지 않았어요.' },
  { kind: 'info', title: '알아두면 좋은 제도', desc: '금액보다 절차와 요건을 챙기면 좋은 제도예요.' },
];

function amountText(x: SubsidyMatch) {
  if (x.max == null) return x.kind === 'info' ? '혜택 안내' : '금액은 공고에서 확인';
  const m = `${Math.round(x.max / 10_000).toLocaleString('ko-KR')}만 원`;
  if (x.kind === 'tax') return `세금 약 ${m}`;
  if (x.kind === 'loan') return `최대 ${m} 대출`;
  return `최대 ${m}`;
}
import type { StoreProfile } from '@/lib/types';

type Answers = Partial<{ biz: string; status: string; open: string; sales: number; drop: string; rent: string; income: string }>;
type Step =
  | { k: keyof Answers; q: string; t: 'c'; o: [string, string][]; h?: string }
  | { k: keyof Answers; q: string; t: 'n'; ph: string; chips: number[]; h?: string };

const STEPS: Step[] = [
  { k: 'biz', q: '어떤 가게를 하세요?', t: 'c', o: [['cafe', '카페·디저트'], ['food', '음식점'], ['pub', '주점·기타 외식']] },
  { k: 'status', q: '지금 가게 상황은요?', t: 'c', o: [['run', '운영 중이에요'], ['think', '폐업을 고민 중이에요'], ['closed', '이미 폐업했어요']] },
  { k: 'open', q: '언제 문을 열었어요?', t: 'c', o: [['old', '2024년 12월 이전'], ['new', '2025년 1월 이후']] },
  { k: 'sales', q: '작년 한 해 매출은 대략 얼마예요?', t: 'n', ph: '예: 8000', chips: [5000, 8000, 10000, 15000], h: '부가세 신고서의 과세표준을 보면 정확해요.' },
  { k: 'drop', q: '최근 매출이 줄었나요?', t: 'c', o: [['no', '비슷하거나 늘었어요'], ['yes', '1년 전보다 10% 넘게 줄었어요']] },
  { k: 'rent', q: '가게는 빌린 곳인가요?', t: 'c', o: [['rent', '네, 월세예요'], ['own', '아니요, 제 건물이에요']] },
  { k: 'income', q: '작년 사업소득(번 돈에서 경비 뺀 금액)은요?', t: 'c', o: [['low', '4천만 원 이하'], ['mid', '4천만 원 초과 ~ 1억 원'], ['high', '1억 원 초과'], ['unk', '잘 모르겠어요']], h: '세금 줄이는 방법을 계산할 때 써요.' },
];

export default function SubsidyPage() {
  const { sb, store, setStore } = useStore();
  const [step, setStep] = useState(store.profile_done ? 0 : 0);
  const [wizard, setWizard] = useState(false);
  const [draft, setDraft] = useState<Answers>({});
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function finish(a: Answers) {
    setSaving(true); setErr('');
    const patch = {
      biz_type: a.biz as StoreProfile['biz_type'],
      status: a.status as StoreProfile['status'],
      opened_before_2025: a.open === 'old',
      annual_sales_man: Math.round(a.sales ?? 0),
      sales_dropped: a.drop === 'yes',
      is_rent: a.rent === 'rent',
      income_tier: a.income as StoreProfile['income_tier'],
      profile_done: true,
    };
    const { error } = await sb.from('stores').update(patch).eq('id', store.id);
    setSaving(false);
    if (error) { setErr('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return; }
    setStore({ ...store, ...patch });
    setWizard(false); setStep(0); setDraft({});
  }

  function answer(k: keyof Answers, v: string | number) {
    const a = { ...draft, [k]: v };
    setDraft(a); setNum('');
    if (step >= STEPS.length) void finish(a); else setStep(step + 1);
  }

  // ---- 질문 화면 ----
  if (wizard && step >= 1) {
    const s = STEPS[step - 1]!;
    return (
      <>
        <div className="progress"><i style={{ width: `${(step / STEPS.length) * 100}%` }} /></div>
        <div className="row sp"><button className="xbtn" onClick={() => (step <= 1 ? setWizard(false) : setStep(step - 1))} aria-label="이전">←</button><span className="hint num">{step} / {STEPS.length}</span></div>
        <h2 className="q">{s.q}</h2>
        {s.h && <p className="hint">{s.h}</p>}
        {s.t === 'c' ? (
          <div className="choices">
            {s.o.map(([v, label]) => <button key={v} className="choice" aria-pressed={draft[s.k] === v} onClick={() => answer(s.k, v)} disabled={saving}>{label}</button>)}
          </div>
        ) : (
          <>
            <div className="field"><div className="inp"><input id="wn" type="number" inputMode="numeric" min={0} placeholder={s.ph} value={num} onChange={(e) => setNum(e.target.value)} aria-label={s.q} /><span>만원</span></div></div>
            <div className="chips">{s.chips.map((c) => <button key={c} className="chip" onClick={() => setNum(String(c))}>{c.toLocaleString('ko-KR')}만</button>)}</div>
            <button className="btn" disabled={!num || Number(num) < 0} onClick={() => answer(s.k, Number(num))}>다음</button>
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </>
    );
  }

  // ---- 처음 화면 ----
  if (!store.profile_done) {
    return (
      <>
        <div className="hero"><span className="lbl">지원금 찾기</span><h1>내 가게가 받을 수 있는 돈,<br />3분이면 찾아요</h1><p>질문 7개에 답하면 신청 가능한 지원금과 줄일 수 있는 세금을 한 번에 보여드려요.</p></div>
        <button className="btn" onClick={() => { setDraft({}); setStep(1); setWizard(true); }}>내 지원금 찾기</button>
        <div className="note">지원 조건은 뉴스·블로그 요약을 바탕으로 한 안내예요. 신청 전에 반드시 공식 공고를 확인하세요. (조건 확인일 {RULES_CHECKED_ON})</div>
      </>
    );
  }

  // ---- 결과 화면 ----
  const matches = matchSubsidies(store);
  const total = totalMax(matches);
  const label = `${{ cafe: '카페', food: '음식점', pub: '주점' }[store.biz_type ?? 'food']} · ${{ run: '운영 중', think: '폐업 고민', closed: '폐업' }[store.status]} · 연매출 ${(store.annual_sales_man ?? 0).toLocaleString('ko-KR')}만 원`;
  return (
    <>
      <div className="hero"><span className="lbl">{label}</span><h1>제도 {matches.length}개를 찾았어요<br />받는 돈·세금 합계 최대 <span className="num" style={{ color: 'var(--accent)' }}>{man(total)}만 원</span></h1></div>
      {matches.length === 0 && <div className="card"><h3>지금 맞는 지원금이 없어요</h3><p className="hint">조건이 바뀌면 다시 알려드릴게요.</p></div>}
      {GROUPS.map((g) => {
        const list = matches.filter((x) => x.kind === g.kind);
        if (list.length === 0) return null;
        return (
          <div key={g.kind}>
            <h2 style={{ margin: '20px 0 4px' }}>{g.title} <span className="hint">{list.length}개</span></h2>
            <p className="hint">{g.desc}</p>
            {list.map((x) => (
              <div className="card" key={x.id}>
                <div className="row sp"><span className={`pill ${x.level}`}>{x.tag}</span><span className="hint">{x.due}</span></div>
                <h3>{x.name}</h3>
                <div className="amount">{amountText(x)}</div>
                <p className="hint">{x.why}</p>
                <div className="sub"><span className="lbl">신청 순서</span><ol>{x.todo.map((t) => <li key={t}>{t}</li>)}</ol></div>
              </div>
            ))}
          </div>
        );
      })}
      <button className="btn line" onClick={() => { setDraft({}); setStep(1); setWizard(true); }}>답변 다시 입력</button>
      <div className="note">표시된 금액은 사업 안내의 상한이에요. 실제 지급액은 심사와 예산에 따라 달라요. 공식 공고 확인 후 신청하세요. (조건 확인일 {RULES_CHECKED_ON})</div>
    </>
  );
}
