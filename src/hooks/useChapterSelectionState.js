import { useCallback, useState } from 'react';
import * as ProjectsApi from '../api/projectsApi';

export function useChapterSelectionState({ projectDetails, setProjectDetails, setError }) {
  const [readingChapter, setReadingChapter] = useState(null);
  const [readingChapterTitle, setReadingChapterTitle] = useState('');
  const [readingContent, setReadingContent] = useState('');

  const chapters = projectDetails?.chapters || [];

  const setChapters = useCallback((nextChapters) => {
    setProjectDetails((prev) => {
      if (!prev) return prev;
      const chaptersValue = typeof nextChapters === 'function'
        ? nextChapters(prev.chapters || [])
        : nextChapters;
      return { ...prev, chapters: chaptersValue };
    });
  }, [setProjectDetails]);

  const clearChapterSelection = useCallback(() => {
    setReadingChapter(null);
    setReadingChapterTitle('');
    setReadingContent('');
  }, []);

  const loadChapterContent = async (projectName, filename) => {
    if (!projectName) return null;
    setError('');
    setReadingContent('');
    try {
      const data = await ProjectsApi.getChapterContent(projectName, filename);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingChapterTitle(data.title || '');
      setReadingContent(data.content === '' ? '章节为空' : data.content);
      setChapters((prev) => prev.map((chapter) =>
        (chapter.fileName || chapter.filename) === data.fileName
          ? {
              ...chapter,
              staleAfterRewrite: data.staleAfterRewrite === true,
              staleReason: data.staleReason || '',
              staleFromFileName: data.staleFromFileName || '',
              staleAt: data.staleAt || null,
            }
          : chapter
      ));
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  return {
    chapters,
    setChapters,
    readingChapter,
    setReadingChapter,
    readingChapterTitle,
    setReadingChapterTitle,
    readingContent,
    setReadingContent,
    loadChapterContent,
    clearChapterSelection,
  };
}
