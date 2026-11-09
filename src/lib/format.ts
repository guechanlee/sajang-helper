export const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
/** 원 → 만원 (소수 첫째 자리까지, 정수면 정수로) */
export const man = (won_: number) => {
  const v = won_ / 10000;
  return Number.isInteger(v) ? v.toLocaleString('ko-KR') : (Math.round(v * 10) / 10).toLocaleString('ko-KR');
};
export const pct = (n: number, d = 1) => n.toFixed(d);
export const manToWon = (m: number) => Math.round(m * 10000);
export const kg = (g: number) => (g >= 1000 ? `${g / 1000}kg` : `${g}g`);
