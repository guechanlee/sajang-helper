import { describe, expect, it } from 'vitest';

// scripts/lib/bizinfo.mjs 는 타입이 없는 JS라서 경로를 변수로 넘겨 불러온다.
const path = '../scripts/lib/bizinfo.mjs';
const lib = (await import(/* @vite-ignore */ path)) as {
  stripHtml: (s: unknown) => string;
  parsePeriod: (s: unknown) => { start: string | null; end: string | null; text: string };
  safeUrl: (s: unknown) => string;
  normalize: (i: unknown) => Record<string, unknown> | null;
};

describe('기업마당 응답 정리', () => {
  it('HTML 태그와 엔티티를 지운다', () => {
    expect(lib.stripHtml('<p>소상공인&nbsp;지원 &amp; 융자</p><br/>끝')).toBe('소상공인 지원 & 융자\n끝');
    expect(lib.stripHtml('<script>alert(1)</script>안녕')).not.toContain('<');
    expect(lib.stripHtml(null)).toBe('');
  });
  it('접수기간 글자를 날짜로 푼다', () => {
    expect(lib.parsePeriod('20260105 ~ 20261231')).toMatchObject({ start: '2026-01-05', end: '2026-12-31' });
    expect(lib.parsePeriod('2026.01.05 ~ 2026.12.31')).toMatchObject({ start: '2026-01-05', end: '2026-12-31' });
    expect(lib.parsePeriod('2026-01-05~2026-12-31')).toMatchObject({ start: '2026-01-05', end: '2026-12-31' });
  });
  it('날짜가 없거나 이상하면 null 이고 원문을 남긴다', () => {
    expect(lib.parsePeriod('예산 소진시까지')).toEqual({ start: null, end: null, text: '예산 소진시까지' });
    expect(lib.parsePeriod('20261340 ~ 20261399')).toMatchObject({ start: null, end: null });
    expect(lib.parsePeriod(undefined)).toEqual({ start: null, end: null, text: '' });
  });
  it('날짜가 하나면 "~"의 위치로 시작/마감을 가른다', () => {
    expect(lib.parsePeriod('~ 2026-12-31')).toMatchObject({ start: null, end: '2026-12-31' });
    expect(lib.parsePeriod('2026-12-31 ~')).toMatchObject({ start: '2026-12-31', end: null });
    expect(lib.parsePeriod('2026-12-31')).toMatchObject({ start: null, end: '2026-12-31' });
  });
  it('원문 주소는 기업마당 도메인만 받는다', () => {
    expect(lib.safeUrl('/web/x?a=1')).toBe('https://www.bizinfo.go.kr/web/x?a=1');
    expect(lib.safeUrl('https://www.bizinfo.go.kr/y')).toBe('https://www.bizinfo.go.kr/y');
    expect(lib.safeUrl('https://evil.example/x')).toBe('');
    expect(lib.safeUrl('//evil.example/x')).toBe('');
    expect(lib.safeUrl('javascript:alert(1)')).toBe('');
  });
  it('번호나 이름이 없는 항목은 버린다', () => {
    expect(lib.normalize({ pblancNm: '이름만' })).toBeNull();
    expect(lib.normalize({ pblancId: 'x' })).toBeNull();
    expect(lib.normalize(null)).toBeNull();
    expect(lib.normalize({ pblancId: 'A', pblancNm: '소상공인', jrsdInsttNm: '서울특별시' })).toMatchObject({ source: 'bizinfo', ext_id: 'A', org: '서울특별시' });
  });
});
