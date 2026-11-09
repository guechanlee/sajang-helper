'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { costRate, ingredientUnit, menuCost, prepUnit, priceForRate, rateLevel } from '@/lib/calc';
import { bookOf, loadCost, rowsByMenu, type CostData } from '@/lib/data';
import { kg, pct, won } from '@/lib/format';
import { SAMPLE_INGREDIENTS, SAMPLE_MENUS, SAMPLE_PREPS } from '@/lib/sample';
import type { Ingredient, MenuRow } from '@/lib/types';

const CATS = ['식사류', '요리류', '사이드·음료'];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const numVal = (n: number) => (n === 0 ? '' : n);

export default function CostPage() {
  const { sb, store } = useStore();
  const [d, setD] = useState<CostData | null>(null);
  const [mode, setMode] = useState<'menu' | 'ing'>('menu');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [addRef, setAddRef] = useState('');

  const reload = useCallback(async () => {
    try { setD(await loadCost(sb)); setErr(''); } catch { setErr('불러오지 못했어요. 새로고침해 주세요.'); }
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);

  const book = useMemo(() => (d ? bookOf(d) : null), [d]);
  const byMenu = useMemo(() => rowsByMenu(d?.menuRows ?? []), [d]);

  // 저장 실패 시 화면 값을 서버 값으로 되돌린다.
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) { setErr('저장하지 못했어요. 입력값을 확인해 주세요.'); await reload(); return false; }
    setErr(''); return true;
  };

  if (!d || !book) return err ? <p className="err" role="alert">{err}</p> : <p className="hint">불러오는 중…</p>;

  const patchIng = (id: string, p: Partial<Ingredient>) => setD({ ...d, ingredients: d.ingredients.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const saveIng = (id: string) => {
    const i = d.ingredients.find((x) => x.id === id); if (!i) return;
    const v = { name: i.name.trim() || '이름 없음', vendor: i.vendor.trim(), category: i.category.trim() || '공산품',
      spec_g: Math.max(1, i.spec_g || 1), price: Math.max(0, Math.round(i.price || 0)), loss_pct: clamp(i.loss_pct, 0, 99) };
    patchIng(id, v); void run(sb.from('ingredients').update(v).eq('id', id));
  };

  async function loadSample() {
    setBusy(true); setErr('');
    const uid = () => crypto.randomUUID();
    const ingId = new Map<string, string>(), prepId = new Map<string, string>();
    SAMPLE_INGREDIENTS.forEach((s) => ingId.set(s.key, uid()));
    SAMPLE_PREPS.forEach((s) => prepId.set(s.key, uid()));
    const menuIds: string[] = SAMPLE_MENUS.map(() => uid());
    const sid = store.id;
    try {
      const steps: [string, Record<string, unknown>[]][] = [
        ['ingredients', SAMPLE_INGREDIENTS.map((s) => ({ id: ingId.get(s.key), store_id: sid, category: s.category, vendor: s.vendor, name: s.name, spec_g: s.spec_g, price: s.price, loss_pct: s.loss_pct, stock: s.stock, order_qty: s.order_qty }))],
        ['preps', SAMPLE_PREPS.map((s) => ({ id: prepId.get(s.key), store_id: sid, name: s.name, yield_g: s.yield_g }))],
        ['prep_rows', SAMPLE_PREPS.flatMap((s) => s.rows.map((r) => ({ store_id: sid, prep_id: prepId.get(s.key), ingredient_id: ingId.get(r.ing), qty_g: r.qty_g })))],
        ['menus', SAMPLE_MENUS.map((m, i) => ({ id: menuIds[i], store_id: sid, category: m.category, name: m.name, price: m.price }))],
        ['menu_rows', SAMPLE_MENUS.flatMap((m, i) => m.rows.map((r) => ({ store_id: sid, menu_id: menuIds[i], ingredient_id: r.ing ? ingId.get(r.ing) : null, prep_id: r.prep ? prepId.get(r.prep) : null, qty_g: r.qty_g })))],
      ];
      for (const [t, rows] of steps) { const { error } = await sb.from(t).insert(rows); if (error) throw error; }
    } catch {
      // 중간에 실패하면 방금 넣은 것만 지운다(재료·메뉴를 지우면 하위 행은 함께 지워진다).
      await sb.from('menus').delete().in('id', menuIds);
      await sb.from('preps').delete().in('id', [...prepId.values()]);
      await sb.from('ingredients').delete().in('id', [...ingId.values()]);
      setErr('예시 데이터를 넣지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
    await reload(); setBusy(false);
  }

  const header = (
    <div className="seg">
      <button aria-pressed={mode === 'menu'} onClick={() => { setMode('menu'); setSel(null); }}>메뉴 원가</button>
      <button aria-pressed={mode === 'ing'} onClick={() => { setMode('ing'); setSel(null); }}>원재료 단가</button>
    </div>
  );

  // ---- 비어 있을 때 ----
  if (d.ingredients.length === 0 && d.menus.length === 0) {
    return (
      <>
        <div className="hero"><span className="lbl">메뉴 원가</span><h1>메뉴별 원가율을<br />한눈에 봐요</h1><p>재료 가격을 넣고 메뉴 레시피를 만들면 원가율이 나와요. 먼저 예시로 둘러볼 수도 있어요.</p></div>
        <button className="btn" onClick={() => void loadSample()} disabled={busy}>예시 데이터로 체험하기</button>
        <button className="btn line" onClick={async () => {
          const ok = await run(sb.from('ingredients').insert({ store_id: store.id, name: '새 재료', spec_g: 1000, price: 0 })); if (ok) { setMode('ing'); await reload(); }
        }}>재료부터 직접 입력하기</button>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="note">예시 데이터는 가상의 거래처와 가격이에요. 언제든 지우고 내 데이터를 넣을 수 있어요.</div>
      </>
    );
  }

  // ---- 원재료 ----
  if (mode === 'ing') {
    return (
      <>
        <div className="hero"><span className="lbl">원재료 단가표</span><h1>산 가격만 넣으면<br />g당 단가가 나와요</h1></div>
        {header}
        {err && <p className="err" role="alert">{err}</p>}
        {d.ingredients.map((i) => (
          <div className="card" key={i.id}>
            <div className="row sp">
              <div className="inp" style={{ flex: 1 }}><input aria-label="재료명" maxLength={80} value={i.name} onChange={(e) => patchIng(i.id, { name: e.target.value })} onBlur={() => saveIng(i.id)} /></div>
              <div className="inp" style={{ width: 124 }}><input aria-label="거래처" maxLength={60} value={i.vendor} placeholder="거래처" onChange={(e) => patchIng(i.id, { vendor: e.target.value })} onBlur={() => saveIng(i.id)} /></div>
            </div>
            <div className="row">
              <div className="inp" style={{ flex: 1 }}><input aria-label="한 포장 무게" type="number" inputMode="decimal" placeholder="0" value={numVal(i.spec_g)} onChange={(e) => patchIng(i.id, { spec_g: Number(e.target.value) })} onBlur={() => saveIng(i.id)} /><span>g 한 포장</span></div>
              <div className="inp" style={{ flex: 1 }}><input aria-label="한 포장 가격" type="number" inputMode="numeric" placeholder="0" value={numVal(i.price)} onChange={(e) => patchIng(i.id, { price: Number(e.target.value) })} onBlur={() => saveIng(i.id)} /><span>원</span></div>
            </div>
            <div className="row sp">
              <div className="inp" style={{ width: 132 }}><input aria-label="버리는 비율" type="number" inputMode="decimal" placeholder="0" value={numVal(i.loss_pct)} onChange={(e) => patchIng(i.id, { loss_pct: Number(e.target.value) })} onBlur={() => saveIng(i.id)} /><span>버리는 %</span></div>
              <span>g당 <b className="num" style={{ fontSize: 18 }}>{ingredientUnit(i).toFixed(2)}</b>원</span>
            </div>
            <button className="xbtn" style={{ fontSize: 13, alignSelf: 'flex-end' }} onClick={async () => {
              if (armed !== i.id) { setArmed(i.id); return; }
              setArmed(null); if (await run(sb.from('ingredients').delete().eq('id', i.id))) await reload();
            }}>{armed === i.id ? '이 재료를 쓰는 레시피 행도 함께 지워져요. 한 번 더 누르면 삭제' : '삭제'}</button>
          </div>
        ))}
        <button className="btn ghost" onClick={async () => { if (await run(sb.from('ingredients').insert({ store_id: store.id, name: '새 재료', spec_g: 1000, price: 0 }))) { await reload(); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50); } }}>원재료 추가</button>
        {d.preps.length > 0 && (
          <div className="card"><h3>반제품</h3>
            {d.preps.map((p) => (
              <div className="row sp" key={p.id}>
                <div><div>{p.name}</div><div className="hint">재료 {d.prepRows.filter((r) => r.prep_id === p.id).length}개</div></div>
                <div className="inp" style={{ width: 130 }}><input aria-label={`${p.name} 완성량`} type="number" inputMode="decimal" placeholder="0" value={numVal(p.yield_g)}
                  onChange={(e) => setD({ ...d, preps: d.preps.map((x) => (x.id === p.id ? { ...x, yield_g: Number(e.target.value) } : x)) })}
                  onBlur={() => { const y = Math.max(1, p.yield_g || 1); void run(sb.from('preps').update({ yield_g: y }).eq('id', p.id)); }} /><span>g 나옴</span></div>
                <b className="num">{prepUnit(p, book).toFixed(2)}</b>
              </div>
            ))}
            <p className="hint">오른쪽 숫자는 g당 원가예요. 완성량은 조리 후 실제로 나온 무게예요.</p>
          </div>
        )}
        <div className="note">버리는 비율은 손질하며 나오는 쓰레기 비율이에요. 15%면 20kg 사도 쓸 수 있는 건 17kg으로 계산해요.</div>
      </>
    );
  }

  // ---- 메뉴 상세 ----
  const menu = sel ? d.menus.find((m) => m.id === sel) : null;
  if (menu) {
    const rows = byMenu.get(menu.id) ?? [];
    const cost = menuCost(rows, book), rate = costRate(cost, menu.price);
    const setRow = (id: string, q: number) => setD({ ...d, menuRows: d.menuRows.map((r) => (r.id === id ? { ...r, qty_g: q } : r)) });
    const nameOf = (r: MenuRow) => (r.ingredient_id ? book.ingredients.get(r.ingredient_id)?.name : `${book.preps.get(r.prep_id ?? '')?.name ?? '?'} · 반제품`) ?? '(삭제됨)';
    const unitOf = (r: MenuRow) => (r.ingredient_id ? ingredientUnit(book.ingredients.get(r.ingredient_id) ?? { spec_g: 1, price: 0, loss_pct: 0 }) : prepUnit(book.preps.get(r.prep_id ?? '') ?? { id: '', store_id: '', name: '', yield_g: 1 }, book));
    const patchMenu = (p: Partial<typeof menu>) => setD({ ...d, menus: d.menus.map((m) => (m.id === menu.id ? { ...m, ...p } : m)) });
    const saveMenu = () => void run(sb.from('menus').update({ name: menu.name.trim() || '이름 없음', price: Math.max(0, Math.round(menu.price || 0)), category: menu.category }).eq('id', menu.id));
    const options = [...d.ingredients.map((i) => ({ v: `i:${i.id}`, l: i.name })), ...d.preps.map((p) => ({ v: `p:${p.id}`, l: `${p.name} (반제품)` }))];
    return (
      <>
        <button className="xbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setSel(null)}>← 목록</button>
        <div className="card">
          <div className="row">
            <div className="field" style={{ flex: 1.4 }}><label htmlFor="mn">메뉴 이름</label><div className="inp"><input id="mn" maxLength={80} value={menu.name} onChange={(e) => patchMenu({ name: e.target.value })} onBlur={saveMenu} /></div></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="mp">판매가</label><div className="inp"><input id="mp" type="number" inputMode="numeric" placeholder="0" value={numVal(menu.price)} onChange={(e) => patchMenu({ price: Number(e.target.value) })} onBlur={saveMenu} /><span>원</span></div></div>
          </div>
          <div className="field"><label htmlFor="mc">분류</label>
            <select id="mc" className="sel" value={menu.category} onChange={(e) => { patchMenu({ category: e.target.value }); void run(sb.from('menus').update({ category: e.target.value }).eq('id', menu.id)); }}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="card">
          <div className="row sp"><span className="lbl">원가율</span><span className={`pill ${rateLevel(rate)}`}>{rate <= 30 ? '안정적이에요' : rate <= 38 ? '조금 높아요' : '손봐야 해요'}</span></div>
          <div className="big">{pct(rate)}<small>%</small></div>
          <div className="row sp"><span>1인분 원가</span><b className="num">{won(cost)}원</b></div>
          <div className="row sp"><span>1개 팔면 남는 돈</span><b className="num">{won(menu.price - cost)}원</b></div>
          <div className="row sp"><span>원가율 30%로 맞추려면</span><b className="num">{won(priceForRate(cost))}원</b></div>
        </div>
        <div className="card"><span className="lbl">레시피 (1인분 사용량 g)</span>
          {err && <p className="err" role="alert">{err}</p>}
          {rows.length === 0 && <p className="hint">아직 재료가 없어요. 아래에서 재료를 골라 추가하면 원가율이 계산돼요.</p>}
          {rows.map((r) => (
            <div className="rrow" key={r.id}>
              <div className="row sp"><div style={{ minWidth: 0 }}><b>{nameOf(r)}</b> <span className="hint num">{unitOf(r).toFixed(2)}원/g</span></div>
                <button className="xbtn" aria-label="삭제" onClick={async () => { if (await run(sb.from('menu_rows').delete().eq('id', r.id))) await reload(); }}>×</button></div>
              <div className="row"><div className="inp" style={{ flex: 1 }}><input aria-label={`${nameOf(r)} 사용량`} type="number" inputMode="decimal" placeholder="0" value={numVal(r.qty_g)} onChange={(e) => setRow(r.id, Number(e.target.value))}
                onBlur={() => void run(sb.from('menu_rows').update({ qty_g: Math.max(0, r.qty_g || 0) }).eq('id', r.id))} /><span>g 사용</span></div>
                <div className="num rc">= <b>{won(r.qty_g * unitOf(r))}</b>원</div></div>
            </div>
          ))}
          <div className="row">
            <select className="sel" aria-label="추가할 재료" value={addRef} onChange={(e) => setAddRef(e.target.value)}>
              <option value="">재료 선택</option>{options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <button className="btn ghost" style={{ width: 'auto', padding: '10px 16px' }} disabled={!addRef} onClick={async () => {
              const [k, id] = addRef.split(':');
              const ok = await run(sb.from('menu_rows').insert({ store_id: store.id, menu_id: menu.id, ingredient_id: k === 'i' ? id : null, prep_id: k === 'p' ? id : null, qty_g: 10 }));
              if (ok) { setAddRef(''); await reload(); }
            }}>추가</button>
          </div>
        </div>
        <button className="btn line" onClick={async () => {
          if (armed !== menu.id) { setArmed(menu.id); return; }
          setArmed(null); if (await run(sb.from('menus').delete().eq('id', menu.id))) { setSel(null); await reload(); }
        }}>{armed === menu.id ? '한 번 더 누르면 삭제돼요' : '이 메뉴 삭제'}</button>
        <div className="note">원가 = 사용량 × g당 단가. g당 단가는 원재료 탭에서 한 포장 무게·가격·버리는 비율로 계산돼요.</div>
      </>
    );
  }

  // ---- 메뉴 목록 ----
  const cats = [...new Set(d.menus.map((m) => m.category))];
  return (
    <>
      <div className="hero"><span className="lbl">메뉴 원가 개요</span><h1>메뉴별 원가율을<br />한눈에 봐요</h1></div>
      {header}
      {err && <p className="err" role="alert">{err}</p>}
      {cats.map((c) => {
        const ms = d.menus.filter((m) => m.category === c);
        const rates = ms.map((m) => costRate(menuCost(byMenu.get(m.id) ?? [], book), m.price));
        const filled = rates.filter((_, i) => (byMenu.get(ms[i]!.id) ?? []).length > 0);
        const avg = filled.reduce((a, b) => a + b, 0) / (filled.length || 1);
        return (
          <div className="card" key={c}>
            <div className="row sp"><h3>{c}</h3>{filled.length > 0 && <span className={`pill ${rateLevel(avg)}`}>평균 {pct(avg)}%</span>}</div>
            <div className="tw"><table><thead><tr><th>메뉴</th><th>원가</th><th>판매가</th><th>원가율</th></tr></thead><tbody>
              {ms.map((m, idx) => {
                const empty = (byMenu.get(m.id) ?? []).length === 0;
                const co = menuCost(byMenu.get(m.id) ?? [], book), r = rates[idx] ?? 0;
                return <tr key={m.id}><td><button className="lnk" onClick={() => setSel(m.id)}>{m.name}</button></td><td>{empty ? '-' : won(co)}</td><td>{won(m.price)}</td><td>{empty ? <span className="pill mut">레시피 없음</span> : <span className={`pill ${rateLevel(r)}`}>{pct(r)}%</span>}</td></tr>;
              })}
            </tbody></table></div>
          </div>
        );
      })}
      <button className="btn ghost" onClick={async () => {
        const { data, error } = await sb.from('menus').insert({ store_id: store.id, name: '새 메뉴', category: '식사류', price: 8000 }).select('id').single();
        if (error || !data) { setErr('메뉴를 만들지 못했어요.'); return; }
        await reload(); setSel(data.id as string);
      }}>메뉴 추가</button>
      <div className="note">원가율 30% 이하 초록, 38% 이하 노랑, 넘으면 빨강이에요. 이름을 누르면 레시피가 열려요. ({kg(1000)} = 1,000g)</div>
    </>
  );
}
