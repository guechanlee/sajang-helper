import Link from 'next/link';

export default function Privacy() {
  return (
    <div id="app">
      <div className="top"><Link className="brand" href="/" style={{ textDecoration: 'none' }}>사장님 도우미</Link></div>
      <div className="note" role="note"><b>초안입니다.</b> 서비스를 공개하기 전에 개인정보 보호 전문가나 변호사의 검토를 받아 확정해야 해요.</div>
      <div className="card">
        <h3>수집하는 정보</h3>
        <p className="hint">로그인 이메일과 암호화(해시)된 비밀번호, 입력하신 가게 정보(업종·매출 구간·월세 여부 등), 메뉴·재료·단가, 월 정산 숫자, 거래명세서 내용(거래처·품목·단가·수량), 가게 이름·주소·전화번호·사업자등록번호(입력한 경우), 네이버 플레이스 주소, 사장님이 직접 기록한 리뷰와 답글.</p>
        <h3>수집하지 않는 정보</h3>
        <p className="hint">직원의 주민등록번호 등 인적사항, 정부 사이트나 네이버의 아이디·비밀번호, 카드번호는 받지 않아요. 스마트플레이스 로그인은 네이버에서 직접 해요.</p>
        <h3>쓰는 곳</h3>
        <p className="hint">지원금 안내, 원가·정산 계산, 명세서 정리에만 써요. 다른 사람의 가게 데이터와 섞이지 않고, 광고에 쓰지 않아요.</p>
        <h3>보관과 삭제</h3>
        <p className="hint">앱의 &quot;알림&quot; 탭에서 내 데이터를 내려받거나 모두 지울 수 있어요. 데이터를 지워도 로그인 계정(이메일)은 남아요. 계정 자체의 삭제는 아직 앱에서 할 수 없어서, 서비스 운영자에게 요청해야 해요.</p>
        <h3>저장 위치</h3>
        <p className="hint">데이터는 서비스 운영자가 정한 MySQL 데이터베이스 서버에 저장돼요. 서버가 해외에 있으면 국외 이전에 해당할 수 있어 공개 전에 위치와 고지 방식을 확정해야 해요.</p>
      </div>
    </div>
  );
}
