import type { StoreProfile } from './types';

// 지원 조건은 뉴스·블로그 요약을 바탕으로 한 것이다. 신청 전에 반드시 공식 공고로 확인해야 한다.
// 화면에도 같은 안내를 표시한다. 조건이 바뀌면 이 파일(나중에는 DB)만 고친다.
export const RULES_CHECKED_ON = '2026-11-03';

export type SubsidyMatch = {
  id: 'voucher' | 'improve' | 'demo' | 'restart' | 'yellow';
  name: string;
  max: number;            // 원
  isTaxSaving: boolean;   // 노란우산은 받는 돈이 아니라 줄어드는 세금
  level: 'good' | 'warn';
  tag: string;
  why: string;
  todo: string[];
  due: string;
};

export type ProfileInput = Pick<StoreProfile,
  'status' | 'opened_before_2025' | 'annual_sales_man' | 'sales_dropped' | 'is_rent' | 'income_tier'>;

const YELLOW: Record<'low' | 'mid' | 'high' | 'unk', [number, number]> = {
  low: [6_000_000, 0.165],
  mid: [4_000_000, 0.264],
  high: [2_000_000, 0.385],
  unk: [4_000_000, 0.264],
};

export function matchSubsidies(p: ProfileInput): SubsidyMatch[] {
  const out: SubsidyMatch[] = [];
  const salesWon = (p.annual_sales_man ?? 0) * 10_000;
  const run = p.status === 'run';

  if (run && salesWon < 104_000_000) {
    out.push({
      id: 'voucher', name: '경영안정 바우처', max: 250_000, isTaxSaving: false, level: 'good', tag: '받을 가능성 높음',
      why: '연매출 1.04억 원 미만 운영 중인 가게예요.',
      todo: ['소상공인24 로그인', '경영안정 바우처 공고 확인', '전기·가스·수도 등 공과금 선택 후 신청'],
      due: '공고 기간 확인',
    });
  }
  if (run && p.opened_before_2025 === true && p.sales_dropped === true) {
    out.push({
      id: 'improve', name: '희망리턴패키지 · 경영개선', max: 20_000_000, isTaxSaving: false, level: 'warn', tag: '확인 필요',
      why: '2025년 이전 개업이고 매출이 10% 넘게 줄었어요. 실제 감소율은 증빙으로 확인해요.',
      todo: ['소진공 지역센터 상담 예약', '매출 증빙(부가세 신고서·카드매출 자료) 준비', '컨설팅 후 사업화 자금 신청'],
      due: '연중 모집(예산 소진 시 마감)',
    });
  }
  if (!run && p.is_rent === true) {
    out.push({
      id: 'demo', name: '희망리턴패키지 · 점포 철거비', max: 6_000_000, isTaxSaving: false, level: 'warn', tag: '철거 전에 신청',
      why: '월세 점포예요. 철거비는 3.3㎡당 20만 원씩, 최대 600만 원까지예요. 실제 금액은 점포 면적에 따라 달라져요.',
      todo: ['철거 공사 전에 신청 (철거 후에는 못 받아요)', '폐업 후 60일 안 신청 기한 확인', '철거 견적서 준비'],
      due: '철거 전 / 폐업 후 60일',
    });
  }
  if (!run) {
    out.push({
      id: 'restart', name: '희망리턴패키지 · 재창업', max: 20_000_000, isTaxSaving: false, level: 'warn', tag: '자부담 50%',
      why: '폐업을 앞두었거나 폐업한 분이 새로 시작할 때 쓰는 사업화 자금이에요. 자부담 50%가 있어요.',
      todo: ['재창업 교육 이수 여부 확인', '사업계획서 작성', '심사 후 선정'],
      due: '모집 공고 확인',
    });
  }
  if (run) {
    const [deduction, rate] = YELLOW[p.income_tier ?? 'unk'];
    out.push({
      id: 'yellow', name: '노란우산공제 (세금 줄이기)', max: Math.round(deduction * rate), isTaxSaving: true, level: 'good', tag: '누구나 가입',
      why: `연 ${deduction / 10_000}만 원까지 소득공제돼요. 세금이 대략 이만큼 줄어요. 중간에 해지하면 기타소득세 16.5%가 붙어요.`,
      todo: ['월 납입액 정하기 (연 최대 1,800만 원)', '12월 31일 전까지 납입분이 올해 공제', '해지 조건 먼저 확인'],
      due: '올해분은 12월 31일까지',
    });
  }
  return out;
}

export const totalMax = (m: SubsidyMatch[]) => m.reduce((a, b) => a + b.max, 0);
