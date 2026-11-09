// 네이버 플레이스(스마트플레이스) 주소를 읽고, 바로가기 링크를 만든다.
// 주의: 네이버는 스마트플레이스의 로그인·리뷰를 외부 프로그램이 가져갈 공식 방법(공개 API)을 열어 두지 않았다.
// 그래서 이 앱은 "주소를 저장해 두고 바로 열어 주는 것"까지만 한다. 리뷰 내용은 사장님이 직접 기록한다.

const OK_HOSTS = ['naver.com', 'naver.me'];

export type Place = { url: string; placeId: string };

/** 붙여넣은 주소에서 플레이스 번호를 뽑는다. 네이버 주소가 아니면 null. 단축 주소(naver.me)는 번호 없이 주소만 저장한다. */
export function parsePlaceUrl(input: string): Place | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!OK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  const m = u.pathname.match(/\/(\d{5,20})(?:\/|$)/);
  return { url: `https://${host}${u.pathname}`.replace(/\/$/, '').slice(0, 300), placeId: m ? m[1]! : '' };
}

export const SMARTPLACE_ADMIN = 'https://smartplace.naver.com/';
export const placePage = (p: { place_url: string; place_id: string }) =>
  p.place_id ? `https://map.naver.com/p/entry/place/${p.place_id}` : p.place_url || '';

/** 사업자등록번호 형식(000-00-00000)과 검증 숫자를 확인한다. */
export function validBizNo(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const n = d.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i]! * w[i]!;
  sum += Math.floor((n[8]! * 5) / 10);
  return (10 - (sum % 10)) % 10 === n[9];
}
export const fmtBizNo = (input: string) => {
  const d = input.replace(/\D/g, '').slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};
