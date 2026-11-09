import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/db/auth';
import { isConfigured } from '@/lib/db/env';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (isConfigured()) {
    if (await getSessionUser()) redirect('/subsidy');
  }
  return (
    <div id="app">
      <div className="top"><span className="brand">사장님 도우미</span></div>
      <div className="hero">
        <span className="lbl">자영업 사장님을 위한</span>
        <h1>내 가게가 받을 수 있는 돈,<br />이번 달에 남은 돈</h1>
        <p>지원금 찾기, 메뉴 원가, 월 정산, 거래명세서 정리를 한 곳에서. 어려운 회계 용어 없이 숫자 몇 개만 넣으면 돼요.</p>
      </div>
      {isConfigured() ? (
        <Link className="btn" href="/login">시작하기</Link>
      ) : (
        <div className="note">서비스 설정이 아직 끝나지 않았어요. README의 &quot;처음 설정&quot;을 따라 데이터베이스(MySQL) 주소를 넣어 주세요.</div>
      )}
      <div className="note">지원금 조건은 뉴스·블로그 요약 기준이에요. 신청 전에 반드시 공식 공고를 확인하세요. <Link href="/privacy">개인정보 처리 안내</Link></div>
    </div>
  );
}
