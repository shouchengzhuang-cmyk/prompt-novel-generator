import { useCallback, useRef } from 'react';

export function useReadingStateController({
  loadChapterContent,
  handleLoadVariants,
  rememberLastProject,
  setDebugPromptInfo,
  setVariantPreview,
  setVariants,
  setShowRewriteInput,
  setRewritePrompt,
  setMobileWritingOutput,
  currentProject,
}) {
  const readingSectionRef = useRef(null);
  const readingContentRef = useRef(null);

  const handleReadChapter = useCallback(async (filename, projectName = currentProject) => {
    if (!projectName) return null;
    rememberLastProject(projectName);
    setDebugPromptInfo(null);
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    const data = await loadChapterContent(projectName, filename);
    if (!data) return null;
    setMobileWritingOutput('');
    handleLoadVariants(data.fileName, projectName);
    return data;
  }, [
    currentProject,
    loadChapterContent,
    handleLoadVariants,
    rememberLastProject,
    setDebugPromptInfo,
    setVariantPreview,
    setVariants,
    setShowRewriteInput,
    setRewritePrompt,
    setMobileWritingOutput,
  ]);

  return {
    readingSectionRef,
    readingContentRef,
    handleReadChapter,
  };
}
