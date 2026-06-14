export default function DesktopProjectRail({
  currentProject,
  projectDetails,
  desktopTotalWords,
  desktopChapters,
  sortedProjects,
  desktopChapterQuery,
  filteredDesktopChapters,
  readingChapter,
  onSetDesktopEditorTab,
  onOpenSettings,
  onRenameProject,
  onSetDesktopChapterQuery,
  onReadChapter,
  formatProjectUpdatedAt,
}) {
  const getProjectIntro = (details) => {
    return details?.summary || details?.world || details?.style || '';
  };

  return (
    <aside className="desktop-project-rail">
      <section className="desktop-card desktop-current-project">
        <div className="desktop-card-head">
          <h2>当前项目</h2>
          {/* 项目设置：切换到设定页签编辑当前项目设定。 */}
          <button type="button" onClick={() => { onSetDesktopEditorTab('settings'); onOpenSettings(); }}>⚙</button>
        </div>
        {currentProject ? (
          <>
            <div className="desktop-project-cover">
              <span>{currentProject.slice(0, 1)}</span>
              <div>
                <h3>
                  {currentProject}
                  {/* 重命名当前项目：弹窗编辑项目名。 */}
                  <button type="button" className="desktop-project-rename-btn" title="重命名" onClick={(e) => {
                    e.stopPropagation();
                    const newName = window.prompt(`将「${currentProject}」重命名为：`, currentProject);
                    if (newName && newName.trim() !== currentProject) {
                      onRenameProject(currentProject, newName.trim());
                    }
                  }}>✎</button>
                </h3>
                <em>长篇玄幻</em>
                <p>{getProjectIntro(projectDetails).slice(0, 46) || '在这里沉淀世界观、人物与章节主线。'}</p>
              </div>
            </div>
            <div className="desktop-project-stats">
              <span>总字数<strong>{desktopTotalWords.toLocaleString()} 字</strong></span>
              <span>章节数<strong>{desktopChapters.length} 章</strong></span>
              <span>最近编辑<strong>{formatProjectUpdatedAt(sortedProjects.find((p) => p.name === currentProject)?.updatedAt)}</strong></span>
            </div>
          </>
        ) : (
          <p className="desktop-empty">请选择或创建一个小说项目。</p>
        )}
      </section>

      <section className="desktop-card desktop-chapter-card">
        <div className="desktop-card-head">
          <h2>章节列表</h2>
        </div>
        <div className="desktop-chapter-search">
          <input
            value={desktopChapterQuery}
            onChange={(e) => onSetDesktopChapterQuery(e.target.value)}
            placeholder="搜索章节标题 / 摘要"
          />
        </div>
        <div className="desktop-chapter-list">
          {filteredDesktopChapters.length > 0 ? filteredDesktopChapters.map((ch, index) => {
            const cf = ch.fileName || ch.filename;
            const isActive = cf && readingChapter === cf;
            const chapterNo = desktopChapters.findIndex((item) => (item.fileName || item.filename) === cf) + 1 || index + 1;
            return (
              /* 打开章节：读取该章节正文和候选版本，会更新当前阅读/编辑状态。 */
              <button
                key={cf || `chapter-${index}`}
                className={isActive ? 'active' : ''}
                type="button"
                disabled={!cf}
                onClick={() => { if (cf) { onReadChapter(cf); onSetDesktopEditorTab('writing'); } }}
              >
                <strong>第{chapterNo}章　{ch.title || cf?.replace(/\.txt$/, '') || '未命名章节'}</strong>
                <span>{ch.date || ch.createdAt ? formatProjectUpdatedAt(ch.date || ch.createdAt) : '未记录'} · {(Number(ch.wordCount) || Number(ch.words) || 0).toLocaleString()} 字</span>
                {ch.staleAfterRewrite && <em>待检查</em>}
              </button>
            );
          }) : (
            <p className="desktop-empty">{desktopChapterQuery.trim() ? '没有匹配章节。' : '暂无章节，先在右侧控制台生成第一章。'}</p>
          )}
        </div>
      </section>
    </aside>
  );
}
