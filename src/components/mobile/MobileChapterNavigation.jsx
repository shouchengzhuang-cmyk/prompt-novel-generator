export default function MobileChapterNavigation({
  chapters,
  readingChapter,
  isMobile,
  onBackClick,
  onReadChapter,
  workspaceUi,
}) {
  if (!chapters) return null;

  const currentIndex = chapters.findIndex((chapter) =>
    (chapter.fileName || chapter.filename) === readingChapter
  );
  if (currentIndex === -1) return null;

  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const previousFileName = previousChapter?.fileName || previousChapter?.filename;
  const nextFileName = nextChapter?.fileName || nextChapter?.filename;

  const openChapter = (fileName) => {
    if (!fileName) return;
    onReadChapter?.(fileName);
    workspaceUi.setMobileGenerateOpen(false);
    workspaceUi.setMobileVariantsOpen(false);
  };

  const handleDirectoryClick = () => {
    if (isMobile) {
      onBackClick();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="chapter-bottom-nav">
      {/* 上一章：读取上一章正文并关闭移动端生成/候选浮层，会改变当前阅读章节。 */}
      <button className="btn" disabled={!previousChapter} onClick={() => openChapter(previousFileName)}>
        上一章
      </button>
      {/* 返回目录：移动端走应用内返回；桌面端只滚动到页面顶部，不保存内容。 */}
      <button className="btn btn-secondary" onClick={handleDirectoryClick}>
        {isMobile ? '目录' : '回目录'}
      </button>
      {/* 下一章：读取下一章正文并关闭移动端生成/候选浮层，会改变当前阅读章节。 */}
      <button className="btn" disabled={!nextChapter} onClick={() => openChapter(nextFileName)}>
        下一章
      </button>
    </div>
  );
}
