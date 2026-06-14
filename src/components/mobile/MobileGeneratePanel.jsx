export default function MobileGeneratePanel({
  workspaceUi,
  projectSelection,
  chapterSelection,
  variants,
  variantPreview,
  onPreviewVariant,
  onApplyVariant,
  applyingVariant,
  readingSectionRef,
}) {
  const { isMobile, mobileVariantsOpen, setMobileVariantsOpen } = workspaceUi;
  const { projectDetails } = projectSelection;
  const { readingChapter } = chapterSelection;

  if (variants.length === 0) return null;

  const chapter = projectDetails?.chapters?.find((item) =>
    (item.fileName || item.filename) === readingChapter
  );
  const activeVersionId = chapter?.activeVersionId || 'v-original';

  const handlePreview = (variant) => {
    onPreviewVariant(variant);
    if (isMobile) {
      setMobileVariantsOpen(false);
      requestAnimationFrame(() => {
        readingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  return (
    <>
      {isMobile && (
        /* 候选版本开关：只切换移动端候选列表显示状态，不请求后端。 */
        <button
          className="mobile-section-toggle"
          onClick={() => setMobileVariantsOpen(!mobileVariantsOpen)}
        >
          候选版本（{variants.length}） {mobileVariantsOpen ? '▲' : '▼'}
        </button>
      )}
      {!(isMobile && !mobileVariantsOpen) && (
        <div className="variants-section">
          <div className="panel-header" style={{ marginTop: 16 }}>
            <h3>候选版本（{variants.length}）</h3>
          </div>
          {variants.map((variant, index) => {
            const versionLabel = variant.id === 'v-original'
              ? '第一版 / 原始版'
              : `第${index + 1}版 / 候选版`;
            const promptSummary = variant.userPrompt || '继续写';
            return (
              <div key={variant.id}>
                <div className={'variant-item' + (variant.id === activeVersionId ? ' active' : '')}>
                  <div className="variant-info">
                    <span className="variant-meta">
                      {variant.id === activeVersionId && <span style={{ color: '#52c41a', fontWeight: 600, marginRight: 8 }}>● 当前主线</span>}
                      {versionLabel} · {new Date(variant.createdAt).toLocaleString()} · {variant.model || '原始版'}
                    </span>
                    {variant.title && variant.title !== chapter?.title && (
                      <span className="variant-instruction" style={{ color: '#4a6cf7' }}>
                        标题：{variant.title.slice(0, 80)}{variant.title.length > 80 ? '...' : ''}
                      </span>
                    )}
                    <span className="variant-instruction">
                      续写要求：{promptSummary.slice(0, 100)}{promptSummary.length > 100 ? '...' : ''}
                    </span>
                    {variant._debugPromptInfo && !variant._debugPromptInfo.usedFallback && (
                      <span className="debug-prompt-info debug-prompt-info-inline">
                        模板：{variant._debugPromptInfo.templateTitle || '未知'}
                      </span>
                    )}
                  </div>
                  <div className="variant-actions">
                    {/* 查看正文：只预览/关闭该候选版本正文，不会应用到主线。 */}
                    <button
                      className={'btn' + (variantPreview?.id === variant.id ? ' active' : '')}
                      onClick={() => handlePreview(variant)}
                    >
                      {variantPreview?.id === variant.id ? '关闭正文' : '查看正文'}
                    </button>
                    {/* 沿此版本继续：把候选版本应用为当前主线内容，会改变当前章节版本。 */}
                    <button
                      className="btn btn-secondary"
                      disabled={applyingVariant || variant.id === activeVersionId}
                      onClick={() => onApplyVariant(variant.id)}
                    >
                      {variant.id === activeVersionId ? '当前主线' : (applyingVariant ? '应用中...' : '沿此版本继续')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
