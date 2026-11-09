import type { Review } from './types';

export const SOURCES: Record<Review['source'], string> = {
  naver: '네이버', kakao: '카카오맵', google: '구글', baemin: '배달의민족', coupang: '쿠팡이츠', etc: '기타',
};

export function summarize(list: Pick<Review, 'rating' | 'replied'>[]) {
  const count = list.length;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ star: s, n: list.filter((r) => r.rating === s).length }));
  const avg = count ? list.reduce((a, r) => a + r.rating, 0) / count : 0;
  return { count, avg, dist, unreplied: list.filter((r) => !r.replied).length };
}

/** 별점별 답글 초안. 가게 이름과 작성자 이름만 바꿔 끼운 예시라서, 사장님이 고쳐서 쓰도록 한다. */
export function draftReplies(storeName: string, rating: number, author: string): { label: string; text: string }[] {
  const name = author.trim() ? `${author.trim()}님` : '고객님';
  const shop = storeName.trim() || '저희 가게';
  if (rating >= 4) return [
    { label: '따뜻한 감사', text: `${name}, ${shop}을(를) 찾아 주시고 좋은 후기까지 남겨 주셔서 정말 감사합니다. 말씀해 주신 칭찬이 큰 힘이 됩니다. 다음에 또 오셨을 때도 같은 맛과 정성으로 맞이하겠습니다. 감사합니다!` },
    { label: '짧게', text: `${name}, 소중한 후기 감사합니다. 또 찾아 주세요!` },
  ];
  if (rating === 3) return [
    { label: '아쉬움 듣기', text: `${name}, 방문해 주시고 솔직한 후기를 남겨 주셔서 감사합니다. 기대에 다 맞춰 드리지 못한 부분이 있었다면 죄송합니다. 말씀해 주신 내용을 살펴보고 더 나아지도록 노력하겠습니다. 다음에는 더 만족하실 수 있도록 준비하겠습니다.` },
    { label: '짧게', text: `${name}, 솔직한 후기 감사합니다. 아쉬운 점은 꼭 개선하겠습니다.` },
  ];
  return [
    { label: '사과와 개선', text: `${name}, ${shop}에서 불편을 드려 진심으로 죄송합니다. 말씀해 주신 내용을 매장에서 바로 확인하고 개선하겠습니다. 더 자세히 듣고 싶으니 괜찮으시다면 가게로 연락 주시면 성의껏 답변드리겠습니다.` },
    { label: '짧게', text: `${name}, 불편을 드려 죄송합니다. 말씀해 주신 점은 바로 확인해 개선하겠습니다.` },
  ];
}
