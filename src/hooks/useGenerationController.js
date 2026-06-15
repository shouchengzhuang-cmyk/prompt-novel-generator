import { useCallback } from 'react';
import { apiFetch, safeJsonFetch } from '../api';
import { parseSSEStream } from '../utils/sseReader';
import * as ProjectsApi from '../api/projectsApi';

export function useGenerationController({
  // shared by both handlers
  loading,
  regenerating,
  currentProject,
  model,
  setError,
  setMobileWritingError,
  setMobileWritingOutput,
  setReadingChapter,
  setReadingChapterTitle,
  setReadingContent,
  setDesktopEditorContent,
  setGenProgress,
  setProjectDetails,
  setNotification,
  rememberLastProject,
  normalizeChapters,
  // regenerate-only
  setRegenerating,
  readingChapter,
  readingChapterTitle,
  readingContent,
  rewritePrompt,
  enhancedRewritePrompt,
  setVariantPreview,
  setVariants,
  handleLoadVariants,
  setShowRewriteInput,
  setRewritePrompt,
  // generate-only
  generatingRef,
  userPrompt,
  enhancedPrompt,
  projectDetails,
  setLoading,
  setUserPrompt,
  setDisplayContent,
  setLastFilename,
  setDebugPromptInfo,
  setStreamingChapterNum,
  clearVariantState,
  isMobile,
  switchMobileView,
  readingSectionRef,
  readingContentRef,
}) {
  const handleGenerate = useCallback(async () => {
    if (loading || regenerating || generatingRef.current) return;
    if (!currentProject) {
      setError('请先选择一个项目');
      return;
    }
    rememberLastProject(currentProject);
    if (!userPrompt.trim()) {
      setError('请输入生成要求');
      return;
    }

    const chapters = projectDetails?.chapters || [];
    const lastChapter = chapters[chapters.length - 1];
    if (lastChapter?.staleAfterRewrite) {
      const message = '当前后续章节可能基于旧版本，建议先确认保留或重写。';
      setError(message);
      setNotification({ title: '请先检查后续章节', message });
      return;
    }

    // 计算下一章编号
    const nums = chapters
      .map((ch) => parseInt((ch.fileName || ch.filename || '').replace('.txt', ''), 10))
      .filter((n) => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const nextNumStr = String(nextNum).padStart(3, '0');

    setError('');
    // 清理重写/变体状态，避免 variantPreview 遮挡新生成内容
    clearVariantState();
    setLoading(true);
    setMobileWritingError('');
    setMobileWritingOutput('');
    generatingRef.current = true;
    setStreamingChapterNum(nextNumStr);
    // 立即进入临时章节状态，在阅读区显示生成进度
    setReadingChapter('_streaming');
    setReadingChapterTitle('第 ' + nextNumStr + ' 章 生成中...');
    setReadingContent('');
    setDesktopEditorContent('');
    setGenProgress({ visible: true, mode: 'generate', status: 'streaming', errorMessage: '' });

    let fileName, content, title, debugInfo;
    let streamedContent = '';

    try {
      // 优先使用流式生成
      const response = await apiFetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          userPrompt: enhancedPrompt,
          model,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || '流式接口返回错误状态');
      }

      const reader = response.body.getReader();

      console.log('[生成] 请求 URL: /api/generate-stream');

      await parseSSEStream(reader, {
        onChunk: (chunk) => {
          streamedContent += chunk;
          setReadingContent((prev) => prev + chunk);
          setDesktopEditorContent((prev) => prev + chunk);
          setMobileWritingOutput((prev) => prev + chunk);
        },
        onDone: (event) => {
          fileName = event.fileName;
          content = event.content;
          title = event.title;
          debugInfo = event.debugPromptInfo;
        },
        onError: (message) => {
          throw new Error(message);
        },
        onReadCycle: () => {
          if (streamedContent) {
            setReadingContent(streamedContent);
            setDesktopEditorContent(streamedContent);
            console.log('[生成] done 事件:', fileName ? `fileName=${fileName}` : '(未收到)');
          }
        },
      });

      // 流式完成但未收到 done 事件 → 后端可能已保存章节，尝试刷新项目定位
      if (!fileName && streamedContent.trim()) {
        console.log('[生成] 流式未收到 done 事件，streamedContent 长度=' + streamedContent.length + '，尝试刷新查找新章节');
        try {
          const refreshData = await ProjectsApi.fetchProjectDetails(currentProject);
          if (refreshData.chapters) {
            const chs = normalizeChapters(refreshData.chapters);
            const last = chs[chs.length - 1];
            if (last) {
              fileName = last.fileName || last.filename;
              content = streamedContent;
              title = last.title || '';
              console.log('[生成] 刷新后找到新章节:', fileName);
            }
          }
        } catch (fetchErr) {
          console.warn('[生成] 刷新查找新章节失败:', fetchErr);
        }
      }
      if (!fileName) throw new Error('流式生成未完成');
    } catch (streamErr) {
      console.warn('流式生成失败，回退到普通生成:', streamErr);
      setReadingChapter(null);
      setReadingChapterTitle('');
      setReadingContent('');
      setDesktopEditorContent('');
      setMobileWritingOutput('');
      setStreamingChapterNum('');

      // 回退到非流式生成
      setGenProgress({ visible: true, mode: 'generate', status: 'running', errorMessage: '' });
      try {
        const data = await ProjectsApi.generateChapter({
          projectName: currentProject,
          userPrompt: enhancedPrompt,
          model,
        });
        fileName = data.fileName || data.filename;
        content = data.content;
        title = data.title || '';
        debugInfo = data.debugPromptInfo || null;
      } catch (err) {
        const isNetworkOrTimeout = err.name === 'AbortError' || err instanceof TypeError;
        // 流式已产生内容但回退 API 也失败 → 后端可能已保存，尝试刷新恢复
        if (!isNetworkOrTimeout && streamedContent.trim()) {
          console.log('[生成] 回退 API 也失败:', err.message, '，尝试刷新项目确认');
          try {
            const rescueData = await ProjectsApi.fetchProjectDetails(currentProject);
            if (rescueData.chapters) {
              const chs = normalizeChapters(rescueData.chapters);
              const last = chs[chs.length - 1];
              if (last) {
                fileName = last.fileName || last.filename;
                content = streamedContent;
                title = last.title || '';
                console.log('[生成] 通过恢复找到新章节:', fileName);
              }
            }
          } catch (rescueErr) {
            console.warn('[生成] 恢复尝试也失败:', rescueErr);
          }
        }
        if (!fileName) {
          if (isNetworkOrTimeout) {
            setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: '网络异常或请求超时' });
            setNotification({ title: '网络异常', message: '请求超时或网络中断，章节可能已保存。请刷新页面确认，不要重复点击生成。' });
          } else {
            setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: err.message });
            setNotification({ title: '生成失败', message: err.message });
          }
          setLoading(false);
          setMobileWritingError(isNetworkOrTimeout ? '网络异常或请求超时' : err.message);
          generatingRef.current = false;
          return;
        }
      }
    }

    // 公共完成逻辑
    content = content || streamedContent;
    setStreamingChapterNum('');
    setDisplayContent((prev) => {
      const sep = prev ? '\n\n' : '';
      return prev + sep + '--- ' + fileName + ' ---\n' + content;
    });
    setLastFilename(fileName);
    setMobileWritingOutput(content || '');
    setUserPrompt('');
    setDebugPromptInfo(debugInfo || null);
    // 从临时章节转为正式章节
    setReadingChapter(fileName);
    setReadingChapterTitle(title || '');
    setReadingContent(content);
    setDesktopEditorContent(content || '');
    rememberLastProject(currentProject);

    let refreshFailed = false;
    try {
      const refreshData = await ProjectsApi.fetchProjectDetails(currentProject);
      if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
      setProjectDetails(refreshData);
    } catch (refreshErr) {
      refreshFailed = true;
      console.warn('刷新章节列表失败:', refreshErr);
    }
    setGenProgress(prev => ({ ...prev, status: 'success' }));
    if (refreshFailed) {
      setNotification({ title: '这一章写好了', message: `章节已保存（${fileName}），但列表刷新失败，请手动刷新。` });
    } else if (!isMobile) {
      setNotification({ title: '这一章写好了', message: `新章节已保存（${fileName}）` });
    }

    // Mobile: auto-navigate to reading page after successful generation
    if (isMobile && fileName) {
      switchMobileView('chapter');
      setNotification({ title: '新章节已保存', message: `${fileName} 已保存，正在打开阅读页` });
      requestAnimationFrame(() => {
        readingSectionRef.current?.scrollIntoView({ block: 'start' });
        readingContentRef.current?.scrollTo?.(0, 0);
      });
    }

    setLoading(false);
    generatingRef.current = false;
  }, [
    loading, regenerating, generatingRef,
    currentProject, userPrompt, enhancedPrompt, projectDetails,
    model,
    setError, setNotification,
    clearVariantState, setLoading, setMobileWritingError, setMobileWritingOutput,
    setStreamingChapterNum, setReadingChapter, setReadingChapterTitle,
    setReadingContent, setDesktopEditorContent, setGenProgress,
    setDisplayContent, setLastFilename, setUserPrompt, setDebugPromptInfo,
    setProjectDetails, rememberLastProject, normalizeChapters,
    isMobile, switchMobileView, readingSectionRef, readingContentRef,
  ]);

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

  return { handleGenerate, handleRegenerate };
}
