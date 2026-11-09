import type { StoreProfile } from './types';

// 지원 조건은 뉴스·블로그 요약을 바탕으로 한 것이다. 신청 전에 반드시 공식 공고로 확인해야 한다.
// 화면에도 같은 안내를 표시한다. 조건이 바뀌면 이 파일(나중에는 DB)만 고친다.
export const RULES_CHECKED_ON = '2026-11-09';

// grant: 받는 돈 / tax: 줄어드는 세금 / loan: 갚아야 하는 대출 / info: 금액보다 알아두면 좋은 제도
export type Kind = 'grant' | 'tax' | 'loan' | 'info';

export type SubsidyMatch = {
  id: string;
  kind: Kind;
  name: string;
  max: number | null;     // 원. null이면 공고에서 확인
  level: 'good' | 'warn';
  fit: number;            // 0~100. 내가 답한 조건에 얼마나 맞는지 어림한 값 (실제 선정 확률이 아님)
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

// 조건 부합도: 입력한 답으로 확인되는 조건이 많을수록 높게, 직원 수·신용·예산 경쟁처럼 앱이 모르는 조건이 크면 낮게 잡은 어림값이다.
const FIT: Record<string, number> = {
  voucher: 80, improve: 55, demo: 70, restart: 60, yellow: 95,
  'loan-general': 75, 'loan-weak': 50, 'loan-refi': 50, 'loan-growth': 55, hs119: 40,
  smartshop: 35, 'employment-ins': 85, duruanu: 40, hire24: 35, edu: 90, eitc: 45,
  'vat-free': 90, 'vat-simple': 80, 'card-fee': 95, lease: 90, newbiz: 90,
  'close-consult': 85, job: 80, unemp: 40, 'yellow-close': 40, 'retry-loan': 60, newstart: 45,
};

function fitOf(id: string, p: ProfileInput): number {
  let v = FIT[id] ?? 50;
  if (id === 'hs119' && p.income_tier === 'low') v = 65;
  if (id === 'eitc' && p.income_tier === 'low') v = 60;
  if (id === 'loan-weak' && p.sales_dropped === true && p.income_tier === 'low') v = 65;
  if (id === 'voucher' && (p.annual_sales_man ?? 0) < 4800) v = 90;
  return v;
}

export function matchSubsidies(p: ProfileInput): SubsidyMatch[] {
  const out: Omit<SubsidyMatch, 'fit'>[] = [];
  const salesWon = (p.annual_sales_man ?? 0) * 10_000;
  const run = p.status === 'run';

  if (run && salesWon < 104_000_000) {
    out.push({
      id: 'voucher', name: '경영안정 바우처', max: 250_000, kind: 'grant', level: 'good', tag: '받을 가능성 높음',
      why: '연매출 1.04억 원 미만 운영 중인 가게예요.',
      todo: ['소상공인24 로그인', '경영안정 바우처 공고 확인', '전기·가스·수도 등 공과금 선택 후 신청'],
      due: '공고 기간 확인',
    });
  }
  if (run && p.opened_before_2025 === true && p.sales_dropped === true) {
    out.push({
      id: 'improve', name: '희망리턴패키지 · 경영개선', max: 20_000_000, kind: 'grant', level: 'warn', tag: '확인 필요',
      why: '2025년 이전 개업이고 매출이 10% 넘게 줄었어요. 실제 감소율은 증빙으로 확인해요.',
      todo: ['소진공 지역센터 상담 예약', '매출 증빙(부가세 신고서·카드매출 자료) 준비', '컨설팅 후 사업화 자금 신청'],
      due: '연중 모집(예산 소진 시 마감)',
    });
  }
  if (!run && p.is_rent === true) {
    out.push({
      id: 'demo', name: '희망리턴패키지 · 점포 철거비', max: 6_000_000, kind: 'grant', level: 'warn', tag: '철거 전에 신청',
      why: '월세 점포예요. 철거비는 3.3㎡당 20만 원씩, 최대 600만 원까지예요. 실제 금액은 점포 면적에 따라 달라져요.',
      todo: ['철거 공사 전에 신청 (철거 후에는 못 받아요)', '폐업 후 60일 안 신청 기한 확인', '철거 견적서 준비'],
      due: '철거 전 / 폐업 후 60일',
    });
  }
  if (!run) {
    out.push({
      id: 'restart', name: '희망리턴패키지 · 재창업', max: 20_000_000, kind: 'grant', level: 'warn', tag: '자부담 50%',
      why: '폐업을 앞두었거나 폐업한 분이 새로 시작할 때 쓰는 사업화 자금이에요. 자부담 50%가 있어요.',
      todo: ['재창업 교육 이수 여부 확인', '사업계획서 작성', '심사 후 선정'],
      due: '모집 공고 확인',
    });
  }
  if (run) {
    const [deduction, rate] = YELLOW[p.income_tier ?? 'unk'];
    out.push({
      id: 'yellow', name: '노란우산공제 (세금 줄이기)', max: Math.round(deduction * rate), kind: 'tax', level: 'good', tag: '누구나 가입',
      why: `연 ${deduction / 10_000}만 원까지 소득공제돼요. 세금이 대략 이만큼 줄어요. 중간에 해지하면 기타소득세 16.5%가 붙어요.`,
      todo: ['월 납입액 정하기 (연 최대 1,800만 원)', '12월 31일 전까지 납입분이 올해 공제', '해지 조건 먼저 확인'],
      due: '올해분은 12월 31일까지',
    });
  }
  // ---- 운영 중: 대출·보증 ----
  if (run) {
    out.push({
      id: 'loan-general', kind: 'loan', name: '소상공인 정책자금 · 일반경영안정자금', max: 70_000_000, level: 'good', tag: '낮은 금리 대출',
      why: '운영 자금이 필요할 때 시중보다 낮은 금리로 빌리는 정책 대출이에요. 한도는 최대 7,000만 원 수준이고, 금리는 분기마다 바뀌어요.',
      todo: ['소상공인24에서 자금 공고·자격 확인', '직접대출은 매달 첫 주 접수가 많아요 — 접수 시기 확인', '지역 소진공 센터 또는 신용보증재단 상담'],
      due: '상시(월별 접수)',
    });
    if (p.sales_dropped === true || p.income_tier === 'low') {
      out.push({
        id: 'loan-weak', kind: 'loan', name: '소상공인 정책자금 · 신용취약 소상공인 자금', max: null, level: 'warn', tag: '신용이 낮다면',
        why: '신용점수가 낮아 은행 대출이 어려운 소상공인을 위한 별도 자금이에요. 신용 요건은 공고에서 확인해야 해요.',
        todo: ['본인 신용점수 조회', '소상공인24 공고에서 신용 요건 확인', '소진공 센터 상담'],
        due: '상시',
      });
      out.push({
        id: 'loan-refi', kind: 'loan', name: '소상공인 대환대출 (비싼 빚 갈아타기)', max: null, level: 'warn', tag: '이자 줄이기',
        why: '금리가 높은 기존 사업자 대출을 낮은 금리 정책자금으로 바꾸는 제도예요. 대상 대출 종류는 공고로 확인해요.',
        todo: ['현재 대출 금리·잔액 정리', '대환 대상 여부 확인', '신용보증재단 상담'],
        due: '공고 확인',
      });
    }
    if (salesWon >= 104_000_000) {
      out.push({
        id: 'loan-growth', kind: 'loan', name: '소상공인 정책자금 · 성장기반자금', max: 500_000_000, level: 'warn', tag: '사업 키울 때',
        why: '매출이 어느 정도 되는 가게가 시설·설비나 확장에 쓰는 자금이에요. 최대 5억 원까지 가능한 것으로 안내돼요(조건·한도는 공고 확인).',
        todo: ['사업계획서 준비', '소진공 센터 상담', '시설 견적서·계약서 준비'],
        due: '상시',
      });
    }
    out.push({
      id: 'hs119', kind: 'loan', name: '햇살론 (서민금융진흥원 소상공인 대출)', max: null, level: 'warn',
      tag: p.income_tier === 'low' ? '소득이 낮다면' : '조건 확인 필요',
      why: '소득·신용이 낮은 자영업자가 쓸 수 있는 서민금융 대출이에요. 은행 대출이 막혔을 때 확인해 보세요.',
      todo: ['서민금융진흥원 조건 조회', '소득 증빙 준비', '보증 승인 후 금융사 신청'],
      due: '상시',
    });
  }

  // ---- 운영 중: 받는 돈 ----
  if (run) {
    out.push({
      id: 'smartshop', kind: 'grant', name: '스마트상점 기술보급 (키오스크·테이블오더 등)', max: 5_000_000, level: 'warn', tag: '장비 지원',
      why: '키오스크, 테이블오더 같은 스마트 장비 도입비를 최대 70%, 500만 원 안팎까지 지원해요. 올해 모집은 이미 끝났을 수 있어서 내년 공고를 봐야 해요.',
      todo: ['소상공인24 공고 확인', '도입할 장비와 공급사 견적 준비', '자부담금(30%) 준비'],
      due: '연 1~2회 모집',
    });
    out.push({
      id: 'employment-ins', kind: 'grant', name: '자영업자 고용보험료 지원', max: null, level: 'good', tag: '폐업 대비',
      why: '자영업자가 고용보험에 가입하면 보험료의 일부(등급에 따라 50~80%, 최대 5년)를 지원받아요. 가입해 두면 폐업 때 실업급여를 받을 수 있어요.',
      todo: ['근로복지공단에서 가입 가능 여부 확인', '기준보수 등급 선택', '지원 신청서 제출'],
      due: '상시',
    });
    out.push({
      id: 'duruanu', kind: 'grant', name: '두루누리 사회보험료 지원 (직원이 있다면)', max: null, level: 'warn', tag: '직원 있을 때',
      why: '직원이 10명 미만이고 월급이 270만 원 미만이면 국민연금·고용보험료의 최대 80%를 지원받아요(최대 36개월). 직원 수는 앱에서 묻지 않으니 직접 확인해 주세요.',
      todo: ['직원 수와 월급 확인', '4대보험 사업장 가입 확인', '국민연금공단·근로복지공단에 신청'],
      due: '상시',
    });
    out.push({
      id: 'hire24', kind: 'grant', name: '고용24 고용장려금 (직원을 뽑을 때)', max: null, level: 'warn', tag: '채용 계획이 있다면',
      why: '청년·취약계층 채용 시 받을 수 있는 장려금이 여러 가지 있어요. 채용 전에 신청해야 하는 것이 많아요.',
      todo: ['고용24에서 장려금 종류 검색', '채용 전 신청 조건 확인', '고용보험 가입 여부 확인'],
      due: '채용 전 확인',
    });
    out.push({
      id: 'edu', kind: 'grant', name: '소상공인 무료 교육·컨설팅', max: null, level: 'good', tag: '무료',
      why: '소진공이 경영·마케팅·세무·디지털 교육을 무료나 낮은 비용으로 운영해요. 경영진단과 컨설팅을 받을 수 있는 과정도 있어요.',
      todo: ['소상공인마당 교육 일정 확인', '관심 과정 신청', '경영진단 컨설팅 신청 가능 여부 확인'],
      due: '상시',
    });
    if (p.income_tier === 'low') {
      out.push({
        id: 'eitc', kind: 'grant', name: '근로장려금 (자영업자도 대상)', max: null, level: 'warn', tag: '소득이 낮다면',
        why: '소득과 재산이 기준보다 낮으면 사업소득자도 현금으로 받을 수 있어요. 가구 형태·소득·재산 기준이 있어요.',
        todo: ['국세청 홈택스에서 모의계산', '정기 신청은 5월(반기 신청도 있어요)', '재산 요건 확인'],
        due: '매년 5월',
      });
    }
  }

  // ---- 운영 중: 세금·비용 ----
  if (run) {
    if (salesWon < 48_000_000) {
      out.push({
        id: 'vat-free', kind: 'info', name: '부가세 납부 면제 (간이과세자)', max: null, level: 'good', tag: '연 4,800만 원 미만',
        why: '간이과세자로 연 공급대가가 4,800만 원 미만이면 부가세 납부가 면제돼요. 그래도 신고는 해야 해요.',
        todo: ['홈택스에서 과세유형 확인', '면제여도 신고서 제출', '직전 연도 매출 기준으로 유형이 바뀌는지 확인'],
        due: '매년 1월 신고',
      });
    } else if (salesWon < 104_000_000) {
      out.push({
        id: 'vat-simple', kind: 'info', name: '간이과세 부가세 혜택', max: null, level: 'good', tag: '연 1억 400만 원 미만',
        why: '연 매출이 1억 400만 원 미만이면 간이과세 대상이 될 수 있어요. 업종별 부가가치율이 적용돼 일반과세보다 세금이 적은 편이에요.',
        todo: ['홈택스에서 현재 과세유형 확인', '일반과세자라면 간이과세 전환 대상인지 확인', '세무사 상담'],
        due: '매년 7월 유형 확인',
      });
    }
    out.push({
      id: 'card-fee', kind: 'info', name: '신용카드 수수료 우대', max: null, level: 'good', tag: '자동 적용',
      why: '연 매출 30억 원 이하 가맹점은 우대 수수료율(대략 0.4~1.45%)이 적용돼요. 카드사가 매출 구간별로 알아서 조정하지만, 잘 적용되고 있는지 한 번 확인해 보세요.',
      todo: ['카드 가맹점 정산 내역에서 수수료율 확인', '구간이 다르면 카드사에 문의', '배달앱·간편결제 수수료도 별도로 비교'],
      due: '상시',
    });
    if (p.is_rent === true) {
      out.push({
        id: 'lease', kind: 'info', name: '상가 임대차 보호 (갱신 10년·분쟁조정)', max: null, level: 'good', tag: '월세 가게',
        why: '상가 임대차는 계약갱신요구권을 최대 10년까지 쓸 수 있고, 임대료 분쟁은 상가건물임대차분쟁조정위원회에서 저렴하게 다툴 수 있어요.',
        todo: ['사업자등록과 확정일자 받아 두기', '계약 만료 6개월~1개월 전에 갱신 요구', '분쟁 시 조정위원회 신청'],
        due: '계약 만료 전',
      });
    }
    if (p.opened_before_2025 === false) {
      out.push({
        id: 'newbiz', kind: 'info', name: '창업 초기 가게 점검 (경영진단·상권 정보)', max: null, level: 'good', tag: '2025년 이후 개업',
        why: '개업 1~2년 차에는 상권·매출 분석과 경영진단을 무료로 받을 수 있어요. 소상공인 상권정보시스템에서 주변 매출과 비교해 볼 수 있어요.',
        todo: ['소상공인 상권정보시스템에서 주변 업종 확인', '소진공 센터에서 경영진단 상담', '교육 과정 신청'],
        due: '상시',
      });
    }
  }

  // ---- 폐업 고민·폐업 ----
  if (!run) {
    out.push({
      id: 'close-consult', kind: 'grant', name: '희망리턴패키지 · 사업정리 컨설팅', max: null, level: 'good', tag: '폐업 전에',
      why: '폐업 절차, 세금, 권리금, 임대차 정리를 전문가에게 컨설팅받는 지원이에요. 폐업 전후 모두 상담 가능해요.',
      todo: ['소진공 지역센터 상담 예약', '사업장 현황(임대차, 부채, 직원) 정리', '컨설팅 신청'],
      due: '연중',
    });
    out.push({
      id: 'job', kind: 'grant', name: '희망리턴패키지 · 취업·교육 연계', max: null, level: 'good', tag: '일자리 연결',
      why: '폐업한 분이 직업훈련을 받거나 일자리를 찾도록 돕는 제도예요. 훈련 참여 지원금이 붙는 과정도 있어요.',
      todo: ['소진공 지역센터에서 상담', '희망 직종 정하기', '교육·알선 신청'],
      due: '연중',
    });
    out.push({
      id: 'unemp', kind: 'info', name: '자영업자 실업급여 (고용보험 가입자만)', max: null, level: 'warn', tag: '가입했다면',
      why: '고용보험에 가입한 자영업자가 비자발적으로 폐업하면 구직급여를 받을 수 있어요. 가입 기간과 폐업 사유 요건이 있어요.',
      todo: ['근로복지공단 가입 기간 확인', '폐업 사유 증빙 준비', '폐업 후 구직급여 신청'],
      due: '폐업 후 12개월 이내',
    });
    out.push({
      id: 'yellow-close', kind: 'info', name: '노란우산공제금 받기 (가입했다면)', max: null, level: 'good', tag: '폐업 시 지급',
      why: '노란우산에 가입해 있다면 폐업 때 공제금을 받을 수 있어요. 해지 불이익 없이 쓸 수 있는 경우가 있으니 사유를 확인하세요.',
      todo: ['중소기업중앙회에 공제금 지급 사유 확인', '폐업 증명서 준비', '공제금 청구'],
      due: '폐업 후',
    });
    out.push({
      id: 'retry-loan', kind: 'loan', name: '소상공인 재도전특별자금', max: null, level: 'warn', tag: '재창업 자금',
      why: '폐업 경험이 있는 사람이 다시 사업을 시작할 때 쓰는 정책 대출이에요. 조건은 공고로 확인해야 해요.',
      todo: ['소상공인24 공고 확인', '재창업 사업계획서 준비', '신용보증재단 상담'],
      due: '상시',
    });
  }
  if (!run || p.sales_dropped === true) {
    out.push({
      id: 'newstart', kind: 'info', name: '새출발기금 · 채무조정', max: null, level: 'warn', tag: '빚이 부담이라면',
      why: '코로나 시기 등에 진 사업 관련 대출이 부담이면 원금 감면·분할상환 같은 채무조정을 받을 수 있어요. 대상 대출과 접수 기간은 공고로 확인해야 해요.',
      todo: ['대출 잔액·연체 현황 정리', '캠코 새출발기금 사이트에서 대상 여부 확인', '상담 후 신청'],
      due: '접수 기간 확인',
    });
  }
  return out.map((m) => ({ ...m, fit: fitOf(m.id, p) }));
}

// 합계에는 받는 돈과 줄어드는 세금만 넣는다. 대출은 갚아야 하는 돈이라 뺀다.
export const totalMax = (m: SubsidyMatch[]) =>
  m.reduce((a, b) => (b.kind === 'grant' || b.kind === 'tax' ? a + (b.max ?? 0) : a), 0);
