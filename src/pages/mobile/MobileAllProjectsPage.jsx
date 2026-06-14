import MobileProjectListPanel from '../../components/mobile/MobileProjectListPanel';

export default function MobileAllProjectsPage({
  sortedProjects,
  allProjectDetails,
  getProjectIntro,
  formatProjectUpdatedAt,
  getProjectChapterCount,
  onHomeProjectOpen,
  onBackClick,
}) {
  return (
    <div className="panel panel-main mobile-all-projects-view">
      {/* 返回上一层：走应用内返回逻辑，只切换移动端视图。 */}
      <button className="mobile-back-btn" onClick={onBackClick}>
        ← 返回
      </button>
      <header className="mobile-outline-header">
        <span>小墨匣</span>
        <h2>全部项目</h2>
      </header>
      <MobileProjectListPanel
        projects={sortedProjects}
        allProjectDetails={allProjectDetails}
        getProjectIntro={getProjectIntro}
        formatProjectUpdatedAt={formatProjectUpdatedAt}
        getProjectChapterCount={getProjectChapterCount}
        onOpenProject={onHomeProjectOpen}
      />
    </div>
  );
}
