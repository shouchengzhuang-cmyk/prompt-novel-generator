import { useCallback } from 'react';
import { safeJsonFetch } from '../api';

export function useVariantActions({
  currentProject,
  readingChapter,
  setReadingContent,
  setReadingChapterTitle,
  setVariantPreview,
  setProjectDetails,
  setNotification,
  setApplyingVariant,
  setError,
  normalizeChapters,
}) {
  const handleApplyVariant = useCallback(async (variantId) => {
    if (!currentProject || !readingChapter) return;
    setApplyingVariant(true);
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/variants/${encodeURIComponent(variantId)}/apply`, {
        method: 'PUT',
      });
      setReadingContent(data.content);
      if (data.title) setReadingChapterTitle(data.title);
      setVariantPreview(null);
      if (data.chapters) {
        const chapters = normalizeChapters(data.chapters);
        setProjectDetails((prev) => prev ? { ...prev, chapters } : prev);
      } else if (data.activeVersionId) {
        setProjectDetails((prev) => {
          if (!prev) return prev;
          const chapters = prev.chapters?.map((ch) =>
            (ch.fileName || ch.filename) === readingChapter
              ? { ...ch, activeVersionId: data.activeVersionId, title: data.title || ch.title }
              : ch
          );
          return { ...prev, chapters };
        });
      }

      let summaryFailed = false;
      try {
        const summaryData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/summary/rebuild`, {
          method: 'POST',
        });
        setProjectDetails((prev) => prev ? { ...prev, summary: summaryData.summary } : prev);
      } catch (summaryErr) {
        summaryFailed = true;
        console.error('摘要更新失败:', summaryErr);
      }

      if (summaryFailed) {
        setNotification({ title: '重写完成', message: '章节已重写，但摘要更新失败，请稍后再试。' });
      } else {
        setNotification({ title: '重写完成', message: '重写完成，摘要已同步更新。' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingVariant(false);
    }
  }, [
    currentProject,
    readingChapter,
    setReadingContent,
    setReadingChapterTitle,
    setVariantPreview,
    setProjectDetails,
    setNotification,
    setApplyingVariant,
    setError,
    normalizeChapters,
  ]);

  return {
    handleApplyVariant,
  };
}
