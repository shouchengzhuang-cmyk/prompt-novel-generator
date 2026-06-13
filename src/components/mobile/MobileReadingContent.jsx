export default function MobileReadingContent({
  isMobile,
  mobileReadingSettingsOpen,
  setMobileReadingSettingsOpen,
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
        <div className="reading-settings">
          <button className="reading-settings-toggle" onClick={() => setMobileReadingSettingsOpen(!mobileReadingSettingsOpen)}>
            <span>阅读设置</span>
            <span>{mobileReadingSettingsOpen ? '▲' : '▼'}</span>
          </button>
          {mobileReadingSettingsOpen && (
            <div className="reading-settings-panel">
              <div className="reading-settings-row">
                <span className="reading-settings-label">背景</span>
                <div className="reading-settings-chips">
                  {[
                    { v: 'ink', t: '深墨' },
                    { v: 'night', t: '暖夜' },
                    { v: 'paper', t: '纸张' },
                  ].map(({ v, t }) => (
                    <button
                      key={v}
                      className={'reading-settings-chip' + (readingTheme === v ? ' active' : '')}
                      onClick={() => setReadingTheme(v)}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="reading-settings-row">
                <span className="reading-settings-label">字号</span>
                <div className="reading-settings-chips">
                  {[
                    { v: 'small', t: '小' },
                    { v: 'medium', t: '中' },
                    { v: 'large', t: '大' },
                  ].map(({ v, t }) => (
                    <button
                      key={v}
                      className={'reading-settings-chip' + (readingFontSize === v ? ' active' : '')}
                      onClick={() => setReadingFontSize(v)}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
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
