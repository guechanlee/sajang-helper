import type { StoreProfile } from './types';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** 정산 대상 월 = 지난달 (예: 11월에는 10월 정산) */
export function settlementYm(now: Date): string {
  let y = now.getFullYear(), m = now.getMonth(); // 0-index → m은 지난달의 1-index와 같다
  if (m === 0) { y -= 1; m = 12; }
  return `${y}-${pad(m)}`;
}
export const monthOf = (ym: string) => Number(ym.slice(5, 7));

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 올해 또는 내년의 (월, 일) 중 오늘 이후 가장 가까운 날짜 */
export function nextOccurrence(month: number, day: number, now: Date): Date {
  const today = startOfDay(now);
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, month - 1, day);
}
export const daysUntil = (d: Date, now: Date) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);

export type AlertItem = { key: string; title: string; sub: string; dday: number | null; tag?: string };

export function buildAlerts(profile: Pick<StoreProfile, 'status' | 'is_rent' | 'profile_done'> | null, now: Date, openSubsidies: number): AlertItem[] {
  const fixed: { key: string; title: string; sub: string; m: number; d: number; yellow?: boolean }[] = [
    { key: 'yellow', title: '노란우산공제 올해분 납입 마감', sub: '12월 31일까지 낸 금액이 올해 소득공제에 들어가요', m: 12, d: 31, yellow: true },
    { key: 'vat1', title: '부가가치세 확정신고(2기분)', sub: '1월 25일까지 신고·납부', m: 1, d: 25 },
    { key: 'vat2', title: '부가가치세 확정신고(1기분)', sub: '7월 25일까지 신고·납부', m: 7, d: 25 },
    { key: 'income', title: '종합소득세 신고', sub: '5월 31일까지 (성실신고대상자는 6월 30일)', m: 5, d: 31 },
  ];
  const showYellow = !profile || profile.status === 'run';
  const out: AlertItem[] = fixed
    .filter((f) => !f.yellow || showYellow)
    .map((f) => ({ key: f.key, title: f.title, sub: f.sub, dday: daysUntil(nextOccurrence(f.m, f.d, now), now) }))
    .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));
  const head: AlertItem[] = [];
  if (profile && profile.status !== 'run' && profile.is_rent) {
    head.push({ key: 'demo', title: '철거 공사 전에 철거비 신청', sub: '철거 후에는 신청할 수 없어요', dday: null, tag: '공사 전' });
  }
  if (profile?.profile_done && openSubsidies > 0) {
    head.push({ key: 'open', title: `확인해 볼 지원금·대출 ${openSubsidies}건`, sub: '지원금 탭에서 신청 순서를 확인하세요. 자동 알림 발송은 아직 없어요.', dday: null, tag: '확인' });
  }
  return [...head, ...out];
}
