export default function DesktopRailChapterList({
  chapters,
  filteredChapters,
  chapterQuery,
  readingChapter,
  onSetChapterQuery,
  onReadChapter,
  onSetEditorTab,
  formatProjectUpdatedAt,
}) {
  return (
    <section className="desktop-card desktop-chapter-card">
      <div className="desktop-card-head">
        <h2>章节列表</h2>
      </div>
      <div className="desktop-chapter-search">
        <input
          value={chapterQuery}
          onChange={(e) => onSetChapterQuery(e.target.value)}
          placeholder="搜索章节标题 / 摘要"
        />
      </div>
      <div className="desktop-chapter-list">
        {filteredChapters.length > 0 ? filteredChapters.map((ch, index) => {
          const cf = ch.fileName || ch.filename;
          const isActive = cf && readingChapter === cf;
          const chapterNo = chapters.findIndex((item) => (item.fileName || item.filename) === cf) + 1 || index + 1;
          return (
            /* 打开章节：读取该章节正文和候选版本，会更新当前阅读/编辑状态。 */
            <button
              key={cf || `chapter-${index}`}
              className={isActive ? 'active' : ''}
              type="button"
              disabled={!cf}
              onClick={() => { if (cf) { onReadChapter(cf); onSetEditorTab('writing'); } }}
            >
              <strong>第{chapterNo}章　{ch.title || cf?.replace(/\.txt$/, '') || '未命名章节'}</strong>
              <span>{ch.date || ch.createdAt ? formatProjectUpdatedAt(ch.date || ch.createdAt) : '未记录'} · {(Number(ch.wordCount) || Number(ch.words) || 0).toLocaleString()} 字</span>
              {ch.staleAfterRewrite && <em>待检查</em>}
            </button>
          );
        }) : (
          <p className="desktop-empty">{chapterQuery.trim() ? '没有匹配章节。' : '暂无章节，先在右侧控制台生成第一章。'}</p>
        )}
      </div>
    </section>
  );
}
