'use client';
import { useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { fmtBizNo, parsePlaceUrl, placePage, SMARTPLACE_ADMIN, validBizNo } from '@/lib/place';
import type { StoreProfile } from '@/lib/types';

// 가게 등록(정보 입력)과 스마트플레이스 연결(주소 저장 + 바로가기)을 한 카드에서 한다.
export function StoreForm() {
  const { sb, store, setStore } = useStore();
  const [name, setName] = useState(store.name === '내 가게' ? '' : store.name);
  const [biz, setBiz] = useState<string>(store.biz_type ?? '');
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [bizNo, setBizNo] = useState(store.biz_no);
  const [placeIn, setPlaceIn] = useState(store.place_url);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setMsg(''); setErr('');
    if (!name.trim()) { setErr('가게 이름을 적어 주세요.'); return; }
    if (bizNo && !validBizNo(bizNo)) { setErr('사업자등록번호가 맞지 않아요. 숫자 10자리를 다시 확인해 주세요. (모르면 비워 두세요)'); return; }
    let place_url = '', place_id = '';
    if (placeIn.trim()) {
      const p = parsePlaceUrl(placeIn);
      if (!p) { setErr('네이버 주소(naver.com 또는 naver.me)만 넣을 수 있어요. 네이버 지도에서 내 가게를 열고 주소를 복사해 주세요.'); return; }
      place_url = p.url; place_id = p.placeId;
    }
    setBusy(true);
    const patch = { name: name.trim().slice(0, 60), biz_type: (biz || null) as StoreProfile['biz_type'], address: address.trim().slice(0, 120), phone: phone.trim().slice(0, 30), biz_no: bizNo, place_url, place_id };
    const { error } = await sb.from('stores').update(patch).eq('id', store.id);
    setBusy(false);
    if (error) { setErr('저장하지 못했어요. 입력값을 확인해 주세요.'); return; }
    setStore({ ...store, ...patch });
    setPlaceIn(place_url);
    setMsg(place_url ? '저장했어요. 아래 바로가기로 스마트플레이스를 열 수 있어요.' : '저장했어요.');
  }

  const link = placePage(store);
  return (
    <div className="card">
      <h3>내 가게 정보</h3>
      <div className="field"><label htmlFor="sn">가게 이름</label><div className="inp"><input id="sn" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 행복분식" /></div></div>
      <div className="field"><label htmlFor="sb">업종</label>
        <select id="sb" className="sel" value={biz} onChange={(e) => setBiz(e.target.value)}>
          <option value="">선택 안 함</option><option value="food">음식점</option><option value="cafe">카페·디저트</option><option value="pub">주점·기타 외식</option>
        </select></div>
      <div className="field"><label htmlFor="sa">주소</label><div className="inp"><input id="sa" maxLength={120} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 서울시 마포구 ..." /></div></div>
      <div className="field"><label htmlFor="sp">가게 전화번호</label><div className="inp"><input id="sp" type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} /></div></div>
      <div className="field"><label htmlFor="sr">사업자등록번호 (선택)</label><div className="inp"><input id="sr" inputMode="numeric" maxLength={12} value={bizNo} onChange={(e) => setBizNo(fmtBizNo(e.target.value))} placeholder="000-00-00000" /></div></div>

      <h3 style={{ marginTop: 8 }}>네이버 스마트플레이스 연결</h3>
      <p className="hint">네이버는 외부 앱이 스마트플레이스에 대신 로그인하거나 리뷰를 자동으로 가져오게 하는 공식 방법을 열어 두지 않았어요. 그래서 내 가게 주소를 저장해 두고 바로 열 수 있게만 해 둬요. 로그인은 네이버에서 직접 해요.</p>
      <div className="field"><label htmlFor="su">내 플레이스 주소</label><div className="inp"><input id="su" maxLength={300} value={placeIn} onChange={(e) => setPlaceIn(e.target.value)} placeholder="네이버 지도에서 내 가게 주소 복사" /></div>
        <span className="hint">예: https://map.naver.com/p/entry/place/… 또는 https://naver.me/…</span></div>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '가게 정보 저장'}</button>
      <div className="linkrow">
        <a className="btn line" href={SMARTPLACE_ADMIN} target="_blank" rel="noopener noreferrer">스마트플레이스 열기</a>
        {link && <a className="btn line" href={link} target="_blank" rel="noopener noreferrer">내 플레이스 페이지</a>}
      </div>
    </div>
  );
}
