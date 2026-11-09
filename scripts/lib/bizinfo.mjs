// 기업마당(bizinfo.go.kr) 정책정보 API 응답을 우리 표 모양으로 바꾼다. 순수 함수만 모아 두었다(테스트 가능).
// API 문서: https://www.bizinfo.go.kr/web/lay1/program/S1T175C174/apiDetail.do

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const validDate = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** "20260105 ~ 20261231", "2026-01-05 ~ 2026-12-31", "2026.01.05~2026.12.31" 같은 접수기간 글자를 날짜 두 개로 푼다.
 *  날짜를 못 찾으면(예: "예산 소진시까지", "상시") start/end 는 null 이고 원문은 text 로 남는다. */
export function parsePeriod(raw) {
  const text = String(raw ?? '').trim();
  const found = [];
  for (const m of text.matchAll(/(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/g)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validDate(y, mo, d)) found.push({ iso: `${m[1]}-${m[2]}-${m[3]}`, at: m.index });
  }
  if (found.length >= 2) return { start: found[0].iso, end: found[1].iso, text };
  if (found.length === 1) {
    const tilde = text.indexOf('~');
    // "~2026-12-31" 은 마감일, "2026-01-05~" 는 시작일, "~" 가 없으면 마감일로 본다.
    if (tilde === -1 || tilde < found[0].at) return { start: null, end: found[0].iso, text };
    return { start: found[0].iso, end: null, text };
  }
  return { start: null, end: null, text };
}

const cut = (s, n) => String(s ?? '').slice(0, n);
const BASE = 'https://www.bizinfo.go.kr';

/** 공고 원문 주소는 기업마당 도메인만 받는다(응답에 엉뚱한 주소가 섞여도 화면에 링크로 나가지 않게). */
export function safeUrl(p) {
  const s = String(p ?? '').trim();
  if (s.startsWith('/') && !s.startsWith('//')) return BASE + s;
  if (s.startsWith(BASE + '/')) return s;
  return '';
}

/** API 항목 1건 → programs 표의 한 행. 필수값(번호·이름)이 없으면 null. */
export function normalize(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.pblancId ?? '').trim();
  const name = stripHtml(item.pblancNm);
  if (!id || !name) return null;
  const period = parsePeriod(item.reqstBeginEndDe);
  return {
    source: 'bizinfo',
    ext_id: cut(id, 100),
    name: cut(name, 300),
    summary: stripHtml(item.bsnsSumryCn).slice(0, 4000) || null,
    org: cut(stripHtml(item.jrsdInsttNm) || stripHtml(item.excInsttNm), 200),
    target: cut(stripHtml(item.trgetNm), 300),
    category: cut([item.pldirSportRealmLclasCodeNm, item.pldirSportRealmMlsfcCodeNm].map(stripHtml).filter(Boolean).join(' > '), 100),
    hashtags: cut(stripHtml(item.hashtags), 500),
    apply_start: period.start,
    apply_end: period.end,
    apply_text: cut(period.text, 200),
    url: cut(safeUrl(item.pblancUrl), 500),
  };
}
