export default function MobileReaderSettingsPanel({
  workspaceUi,
  readingTheme,
  setReadingTheme,
  readingFontSize,
  setReadingFontSize,
}) {
  const {
    mobileReadingSettingsOpen,
    setMobileReadingSettingsOpen,
  } = workspaceUi;

  return (
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
  );
}
