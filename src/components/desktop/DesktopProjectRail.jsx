import DesktopRailChapterList from './DesktopRailChapterList';

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

      <DesktopRailChapterList
        chapters={desktopChapters}
        filteredChapters={filteredDesktopChapters}
        chapterQuery={desktopChapterQuery}
        readingChapter={readingChapter}
        onSetChapterQuery={onSetDesktopChapterQuery}
        onReadChapter={onReadChapter}
        onSetEditorTab={onSetDesktopEditorTab}
        formatProjectUpdatedAt={formatProjectUpdatedAt}
      />
    </aside>
  );
}
