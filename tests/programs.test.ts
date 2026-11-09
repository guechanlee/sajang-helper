import { describe, expect, it } from 'vitest';
import { rankPrograms, regionsIn, todayKst, type ProfileForPrograms, type ProgramRow } from '../src/lib/programs';

// 순수 함수 테스트(DB 없이 항상 돈다).
let n = 0;
const row = (o: Partial<ProgramRow>): ProgramRow => ({
  id: ++n, name: '', summary: '', org: '중소벤처기업부', target: '', category: '', hashtags: '',
  apply_start: null, apply_end: null, apply_text: '', url: 'https://www.bizinfo.go.kr/x', ...o,
});
const run: ProfileForPrograms = { status: 'run', biz_type: 'food', region: null };
const TODAY = '2026-11-09';
const names = (rows: ProgramRow[], p = run) => rankPrograms(rows, p, TODAY).map((r) => r.name);

describe('지역 판별', () => {
  it('기관·이름·해시태그의 지역 이름을 찾는다', () => {
    expect(regionsIn('서울특별시 [서울] 소상공인')).toEqual(['서울특별시']);
    expect(regionsIn('경상북도 경북신용보증재단')).toEqual(['경상북도']);
    expect(regionsIn('충북 청주')).toEqual(['충청북도']);
  });
  it('"경기 활성화" 같은 일반 표현은 경기도로 보지 않는다', () => {
    expect(regionsIn('지역경기 활성화 소상공인 지원')).toEqual([]);
    expect(regionsIn('경기도 소상공인')).toEqual(['경기도']);
  });
});

describe('마감', () => {
  it('마감이 지난 공고는 뺀다. 오늘 마감과 상시(마감 없음)는 남긴다', () => {
    const r = names([
      row({ name: '지난 소상공인 지원', apply_end: '2026-11-08' }),
      row({ name: '오늘 마감 소상공인 지원', apply_end: '2026-11-09' }),
      row({ name: '상시 소상공인 지원', apply_end: null, apply_text: '상시' }),
    ]);
    expect(r).toContain('오늘 마감 소상공인 지원');
    expect(r).toContain('상시 소상공인 지원');
    expect(r).not.toContain('지난 소상공인 지원');
  });
  it('남은 날짜(D-day)를 계산하고, 급한 것이 먼저 온다(점수가 같을 때)', () => {
    const r = rankPrograms([
      row({ name: '소상공인 B', apply_end: '2026-12-20' }),
      row({ name: '소상공인 A', apply_end: '2026-11-12' }),
    ], run, TODAY);
    expect(r.map((x) => [x.name, x.dday])).toEqual([['소상공인 A', 3], ['소상공인 B', 41]]);
  });
  it('서울 기준 날짜를 쓴다 (UTC 15시 이후는 이미 다음 날)', () => {
    expect(todayKst(Date.parse('2026-11-09T14:59:00Z'))).toBe('2026-11-09');
    expect(todayKst(Date.parse('2026-11-09T15:00:00Z'))).toBe('2026-11-10');
  });
});

describe('지역 필터', () => {
  const rows = () => [
    row({ name: '[서울] 소상공인 자금', org: '서울특별시' }),
    row({ name: '[부산] 소상공인 자금', org: '부산광역시' }),
    row({ name: '전국 소상공인 바우처' }),
  ];
  it('지역을 모르면 전국 공고만 보여준다', () => {
    expect(names(rows())).toEqual(['전국 소상공인 바우처']);
  });
  it('내 지역 공고와 전국 공고만 보여주고 다른 지역은 뺀다', () => {
    const r = names(rows(), { ...run, region: '서울특별시' });
    expect(r).toContain('[서울] 소상공인 자금');
    expect(r).toContain('전국 소상공인 바우처');
    expect(r).not.toContain('[부산] 소상공인 자금');
  });
  it('본문에만 지역이 나오는 전국 공고는 지역 공고로 오해하지 않는다', () => {
    const r = rankPrograms([row({ name: '전국 소상공인 지원', summary: '서울, 부산 등 전국 대상' })], run, TODAY);
    expect(r).toHaveLength(1);
    expect(r[0]!.region).toBeNull();
  });
});

describe('관련도', () => {
  it('소상공인과 무관한 공고(연구개발·수출 등)는 뺀다', () => {
    const r = names([
      row({ name: '반도체 R&D 기술개발 지원' }),
      row({ name: '중소기업 수출 바우처' }),
      row({ name: '소상공인 수출 지원', hashtags: '소상공인' }), // 소상공인이어도 수출 사업이면 점수가 깎여 빠진다
      row({ name: '소상공인 환경개선 지원' }),
    ]);
    expect(r).toEqual(['소상공인 환경개선 지원']);
  });
  it('폐업(예정) 가게에는 폐업·재기 공고를 올리고, 운영 중 가게에는 그런 공고를 뺀다', () => {
    const rows = () => [row({ name: '소상공인 재기 지원 희망리턴', summary: '폐업 소상공인 재창업 지원' }), row({ name: '소상공인 경영안정 바우처' })];
    expect(names(rows(), { ...run, status: 'closed' })[0]).toBe('소상공인 재기 지원 희망리턴');
    expect(names(rows(), run)).toEqual(['소상공인 경영안정 바우처']);
    // 희망리턴패키지는 운영 중 가게용 트랙(경영개선)도 있어서 이름만으로 빼지 않는다
    expect(names([row({ name: '희망리턴패키지 소상공인 경영개선' })], run)).toHaveLength(1);
  });
  it('특정 대상 공고는 남기되 확인할 점을 달아 준다', () => {
    const r = rankPrograms([row({ name: '청년 소상공인 지원' })], run, TODAY);
    expect(r).toHaveLength(1);
    expect(r[0]!.notes.join(' ')).toContain('특정 대상');
  });
  it('최대 개수를 넘기지 않고, 요약은 160자로 줄인다', () => {
    const many = Array.from({ length: 50 }, (_, i) => row({ name: `소상공인 지원 ${i}`, summary: 'ㄱ'.repeat(500) }));
    const r = rankPrograms(many, run, TODAY);
    expect(r).toHaveLength(30);
    expect(r[0]!.summary.length).toBe(160);
  });
});
