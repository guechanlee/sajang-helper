// 기업마당 등에서 가져온 공고(programs 표) 중 "내 가게에 맞을 법한 것"만 추린다.
// 규칙 기반 어림짐작이다. 지원 자격을 판정하지 않고, 마감·지역·업종 키워드로 걸러서 보여줄 뿐이다.
// 신청 전에는 공고 원문의 조건을 반드시 직접 확인해야 한다.

export const REGIONS = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도'] as const;
export type Region = (typeof REGIONS)[number];

// 공고의 기관·이름·해시태그에 지역 이름이 있으면 그 지역 사람 대상으로 본다. (본문은 보지 않는다: 본문엔 "서울 포함" 같은 말이 흔하다)
const REGION_RE: Record<Region, RegExp> = {
  서울특별시: /서울/, 부산광역시: /부산/, 대구광역시: /대구/, 인천광역시: /인천/, 광주광역시: /광주/, 대전광역시: /대전/,
  울산광역시: /울산/, 세종특별자치시: /세종/,
  경기도: /경기도|\[경기\]|경기(신용|테크노|콘텐츠|주택|도시)/, // "경기 활성화" 같은 일반 표현은 지역으로 보지 않는다
  강원특별자치도: /강원/, 충청북도: /충청북도|충북/, 충청남도: /충청남도|충남/, 전북특별자치도: /전북|전라북도/,
  전라남도: /전라남도|전남/, 경상북도: /경상북도|경북/, 경상남도: /경상남도|경남/, 제주특별자치도: /제주/,
};

export type ProgramRow = {
  id: number; name: string; summary: string | null; org: string; target: string; category: string; hashtags: string;
  apply_start: string | null; apply_end: string | null; apply_text: string; url: string;
};
export type ProfileForPrograms = { status: 'run' | 'think' | 'closed'; biz_type: 'cafe' | 'food' | 'pub' | null; region: string | null };

export type RankedProgram = {
  id: number; name: string; org: string; summary: string; url: string;
  applyText: string; applyEnd: string | null; dday: number | null; score: number;
  region: Region | null;   // 특정 지역 공고면 그 지역
  notes: string[];         // 화면에 작게 보여줄 "확인할 점"
};

export const regionsIn = (text: string): Region[] => REGIONS.filter((r) => REGION_RE[r].test(text));

const AUDIENCE = /소상공인|자영업|소기업|소공인|점포|상점|상권|전통시장|골목|외식|음식점|식당|카페|요식|프랜차이즈|배달/;
const GENERAL_BOOST = /경영안정|바우처|운영자금|경영개선|판로|디지털|스마트|키오스크|고용보험|보험료|공과금|임대료|환경개선|노후|시설개선|사회보험/;
const CLOSING_ONLY = /폐업|재기|재창업|재도전|점포\s*철거|채무|신용회복/;   // 폐업·재기 전용 공고
const CLOSING_BOOST = /폐업|재기|재창업|재도전|점포\s*철거|희망리턴|채무|신용회복/; // 희망리턴은 운영 중 가게용 트랙도 있어서 따로 둔다
const FOOD_BOOST = /외식|음식|식당|카페|디저트|주점|식품|위생/;
const NEGATIVE = /연구개발|R&D|기술개발|수출|해외진출|바이오|반도체|제조업|농업|어업|임업|축산|스마트팜|특허|벤처|투자유치|액셀러레이|딥테크|스타트업/;
const SPECIFIC_GROUP = /청년|여성|장애인|고령|시니어|귀농|다문화|북한이탈|재난|산불|수해|침수|피해/;

/** 서울 기준 오늘 날짜(YYYY-MM-DD). 서버가 UTC로 돌아도 날짜가 하루 어긋나지 않게 한다. */
export const todayKst = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

const dayDiff = (to: string, from: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);

export function rankPrograms(rows: ProgramRow[], p: ProfileForPrograms, today = todayKst(), limit = 30): RankedProgram[] {
  const out: RankedProgram[] = [];
  const closing = p.status !== 'run';

  for (const r of rows) {
    if (r.apply_end && r.apply_end < today) continue; // 마감됨

    const head = `${r.name} ${r.target} ${r.hashtags} ${r.category}`;
    const all = `${head} ${r.summary ?? ''}`;

    // 지역: 다른 지역 공고는 뺀다. 지역을 모르면 전국 공고만 보여준다.
    const mentioned = regionsIn(`${r.org} ${r.name} ${r.hashtags}`);
    if (mentioned.length) {
      if (!p.region || !mentioned.includes(p.region as Region)) continue;
    }

    let score = 0;
    if (AUDIENCE.test(head)) score += 3; else if (AUDIENCE.test(all)) score += 1;
    if (closing) { if (CLOSING_BOOST.test(all)) score += 3; }
    else {
      if (CLOSING_ONLY.test(head)) continue; // 이름이 폐업·재기 전용인 공고는 운영 중인 가게에 맞지 않는다
      if (GENERAL_BOOST.test(all)) score += 1;
      if (CLOSING_ONLY.test(all)) score -= 1;
    }
    if (p.biz_type && FOOD_BOOST.test(all)) score += 1;
    if (NEGATIVE.test(head)) score -= 3;
    if (score < 2) continue;

    const notes: string[] = [];
    if (SPECIFIC_GROUP.test(head)) { notes.push('특정 대상(청년·여성·피해 업체 등) 공고일 수 있어요'); score -= 1; }
    if (!r.apply_end) notes.push(r.apply_text ? `접수: ${r.apply_text}` : '접수 기간은 원문 확인');

    out.push({
      id: r.id, name: r.name, org: r.org, summary: (r.summary ?? '').replace(/\s+/g, ' ').slice(0, 160),
      url: r.url, applyText: r.apply_text, applyEnd: r.apply_end,
      dday: r.apply_end ? dayDiff(r.apply_end, today) : null, score,
      region: mentioned[0] ?? null, notes,
    });
  }

  out.sort((a, b) => b.score - a.score || (a.dday ?? 9999) - (b.dday ?? 9999) || a.id - b.id);
  return out.slice(0, limit);
}
