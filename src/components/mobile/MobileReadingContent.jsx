import MobileReaderSettingsPanel from './MobileReaderSettingsPanel';

export default function MobileReadingContent({
  isMobile,
  workspaceUi,
  readingTheme,
  setReadingTheme,
  readingFontSize,
  setReadingFontSize,
  variantPreview,
  readingContentRef,
  handleReadingContentScroll,
  readingContent,
  showScrollTop,
  handleScrollToTop,
}) {
  return (
    <>
      {/* Reading settings — mobile */}
      {isMobile && (
        <MobileReaderSettingsPanel
          workspaceUi={workspaceUi}
          readingTheme={readingTheme}
          setReadingTheme={setReadingTheme}
          readingFontSize={readingFontSize}
          setReadingFontSize={setReadingFontSize}
        />
      )}

      <div
        className={`reading-content reading-theme-${readingTheme} reading-font-${readingFontSize}`}
        ref={readingContentRef}
        onScroll={handleReadingContentScroll}
      >{variantPreview ? variantPreview.content : readingContent}</div>

      {showScrollTop && (
        /* 回到开头：只滚动当前阅读容器或移动端页面，不保存或请求后端。 */
        <button className="scroll-to-top-btn" onClick={handleScrollToTop} title="回到开头" aria-label="回到开头">
          &uarr;
        </button>
      )}
    </>
  );
}
