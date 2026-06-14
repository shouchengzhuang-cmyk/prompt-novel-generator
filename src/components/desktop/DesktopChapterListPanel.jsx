export default function DesktopChapterListPanel({
  currentProject,
  chapters,
  totalWords,
  summary,
}) {
  return (
    <div className="desktop-overview-panel">
      <h3>章节总览</h3>
      <p>当前项目 {currentProject}，共 {chapters.length} 章，总计 {totalWords.toLocaleString()} 字。</p>
      <p>{summary || '暂无剧情摘要，可在设定页签中补充。'}</p>
    </div>
  );
}
