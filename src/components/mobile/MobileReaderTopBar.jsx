export default function MobileReaderTopBar({ isMobile, mobileView, onBackClick }) {
  if (!isMobile || mobileView !== 'chapter') return null;

  return (
    <button className="mobile-back-btn" onClick={onBackClick}>
      ← 返回列表
    </button>
  );
}
