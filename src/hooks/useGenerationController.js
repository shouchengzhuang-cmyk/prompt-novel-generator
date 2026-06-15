import { useCallback } from 'react';
import { apiFetch, safeJsonFetch } from '../api';
import { parseSSEStream } from '../utils/sseReader';
import * as ProjectsApi from '../api/projectsApi';

export function useGenerationController({
  loading,
  regenerating,
  setRegenerating,
  currentProject,
  readingChapter,
  readingChapterTitle,
  readingContent,
  setReadingChapter,
  setReadingChapterTitle,
  setReadingContent,
  setDesktopEditorContent,
  rewritePrompt,
  enhancedRewritePrompt,
  model,
  setError,
  setMobileWritingError,
  setMobileWritingOutput,
  setVariantPreview,
  setVariants,
  handleLoadVariants,
  setShowRewriteInput,
  setRewritePrompt,
  setProjectDetails,
  setNotification,
  setGenProgress,
  rememberLastProject,
  normalizeChapters,
}) {
  const handleRegenerate = useCallback(async () => {
    if (loading || regenerating) return;
    if (!currentProject || !readingChapter) return;
    rememberLastProject(currentProject);
    const trimmed = rewritePrompt.trim();
    if (!trimmed) {
      setError('续写要求不能为空');
      return;
    }

    // Save original chapter state in case streaming fails
    const origChapter = readingChapter;
    const origTitle = readingChapterTitle;
    const origContent = readingContent;

    setRegenerating(true);
    setError('');
    setMobileWritingError('');
    setMobileWritingOutput('');
    setVariantPreview(null);
    setReadingChapter('_streaming');
    setReadingChapterTitle('重写生成中...');
    setReadingContent('');
    setDesktopEditorContent('');
    setGenProgress({ visible: true, mode: 'rewrite', status: 'streaming', errorMessage: '' });

    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(origChapter)}/regenerate-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, userPrompt: enhancedRewritePrompt }),
      });

      if (!response.ok) {
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = {}; }
        throw new Error(data.error || '重写请求失败');
      }

      const reader = response.body.getReader();
      let streamedContent = '';
      let doneVariant = null;
      let doneDebugInfo = null;

      await parseSSEStream(reader, {
        onChunk: (chunk) => {
          streamedContent += chunk;
          setReadingContent((prev) => prev + chunk);
          setDesktopEditorContent((prev) => prev + chunk);
          setMobileWritingOutput((prev) => prev + chunk);
        },
        onDone: (event) => {
          doneVariant = event.variant;
          doneDebugInfo = event.debugPromptInfo;
        },
        onError: (message) => {
          throw new Error(message);
        },
      });

      console.log('[重写] done 事件:', doneVariant ? `variantId=${doneVariant.id}` : '(未收到)');

      // 流式完成但未收到 done 事件 → 后端可能已保存变体，尝试加载变体列表
      if (!doneVariant && streamedContent.trim()) {
        console.log('[重写] 流式未收到 done 事件，尝试加载变体列表');
        try {
          const vData = await safeJsonFetch(
            `/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(origChapter)}/variants`
          );
          const v = vData.variants || [];
          if (v.length > 0) {
            doneVariant = v[v.length - 1];
            console.log('[重写] 通过加载变体找到最新变体:', doneVariant.id);
          }
        } catch { /* ignore */ }
      }
      if (!doneVariant) {
        throw new Error('重写未完成');
      }

      // Success: restore readingChapter, update title from variant, keep streamed content
      setReadingChapter(origChapter);
      setReadingChapterTitle(doneVariant.title || origTitle);
      setReadingContent(doneVariant.content || streamedContent);
      setDesktopEditorContent(doneVariant.content || streamedContent);
      setMobileWritingOutput(doneVariant.content || streamedContent);
      setVariants((prev) => [...prev, { ...doneVariant, _debugPromptInfo: doneDebugInfo }]);
      handleLoadVariants(origChapter, currentProject);
      setShowRewriteInput(false);
      setRewritePrompt('');
      setGenProgress(prev => ({ ...prev, status: 'success' }));
      setNotification({ title: '候选版本写好了', message: '可以查看并决定是否采用。' });
      // 刷新项目详情，保持章节列表与后台同步
      try {
        const refreshData = await ProjectsApi.fetchProjectDetails(currentProject);
        if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
        setProjectDetails(refreshData);
      } catch (refreshErr) {
        console.warn('重写后刷新项目详情失败:', refreshErr);
      }
    } catch (err) {
      setReadingChapter(origChapter);
      setReadingChapterTitle(origTitle);
      setReadingContent(origContent);
      setMobileWritingError(err.message);
      setGenProgress({ visible: true, mode: 'rewrite', status: 'error', errorMessage: err.message });
      setNotification({ title: '生成失败', message: err.message });
    } finally {
      setRegenerating(false);
    }
  }, [
    loading, regenerating, setRegenerating,
    currentProject, readingChapter, readingChapterTitle, readingContent,
    setReadingChapter, setReadingChapterTitle, setReadingContent, setDesktopEditorContent,
    rewritePrompt, enhancedRewritePrompt, model,
    setError, setMobileWritingError, setMobileWritingOutput,
    setVariantPreview, setVariants, handleLoadVariants,
    setShowRewriteInput, setRewritePrompt,
    setProjectDetails, setNotification, setGenProgress,
    rememberLastProject, normalizeChapters,
  ]);

  return { handleRegenerate };
}
