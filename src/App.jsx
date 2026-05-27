import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import VaultPanel from './components/VaultPanel';
import PromptPreviewPanel from './components/PromptPreviewPanel';
import WritingControlPanel from './components/WritingControlPanel';
import GenerationProgress from './components/GenerationProgress';
import { apiFetch, safeJsonFetch } from './api';

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) return chapters;
  return chapters.map((ch) => {
    if (!ch.fileName && ch.filename) ch.fileName = ch.filename;
    if (!ch.filename && ch.fileName) ch.filename = ch.fileName;
    return ch;
  });
}

function App() {
  const [projects, setProjects] = useState([]);
  const [projectChapterCounts, setProjectChapterCounts] = useState({});
  const [currentProject, setCurrentProject] = useState(null);
  const [projectDetails, setProjectDetails] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create project form
  const [newProjectName, setNewProjectName] = useState('');
  const [newWorld, setNewWorld] = useState('');
  const [newCharacters, setNewCharacters] = useState('');
  const [newStyle, setNewStyle] = useState('');

  const [newSummary, setNewSummary] = useState('');

  // Create project form error (separate from main error to show it in the left panel)
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Generation
  const [model, setModel] = useState('deepseek-v4-flash');
  const [userPrompt, setUserPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [lastFilename, setLastFilename] = useState('');
  const [copied, setCopied] = useState(false);

  // Reading
  const [readingChapter, setReadingChapter] = useState(null);
  const [readingChapterTitle, setReadingChapterTitle] = useState('');
  const [readingContent, setReadingContent] = useState('');

  // Project settings editor
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editWorld, setEditWorld] = useState('');
  const [editCharacters, setEditCharacters] = useState('');
  const [editStyle, setEditStyle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editEditorialMemory, setEditEditorialMemory] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(null);

  // Export
  const [exportStatus, setExportStatus] = useState('');
  const [rebuildingSummary, setRebuildingSummary] = useState(false);

  // Chapter title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Variants (regenerated chapter candidates)
  const [variants, setVariants] = useState([]);
  const [regenerating, setRegenerating] = useState(false);
  const [variantPreview, setVariantPreview] = useState(null);
  const [applyingVariant, setApplyingVariant] = useState(false);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');

  // Reading settings
  const [readingTheme, setReadingTheme] = useState(() => localStorage.getItem('readingTheme') || 'default');
  const [readingFontSize, setReadingFontSize] = useState(() => localStorage.getItem('readingFontSize') || 'medium');
  const [mobileReadingSettingsOpen, setMobileReadingSettingsOpen] = useState(false);

  useEffect(() => { localStorage.setItem('readingTheme', readingTheme); }, [readingTheme]);
  useEffect(() => { localStorage.setItem('readingFontSize', readingFontSize); }, [readingFontSize]);

  // Sidebar layout
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isChaptersCollapsed, setIsChaptersCollapsed] = useState(false);

  // Mobile view routing: 'shelf' | 'project' | 'chapter' | 'editor'
  const [mobileView, setMobileView] = useState('shelf');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [mobileGenerateOpen, setMobileGenerateOpen] = useState(false);
  const [mobileVariantsOpen, setMobileVariantsOpen] = useState(false);
  const [mobileShelfMenu, setMobileShelfMenu] = useState(null);
  const [mobileChapterMenu, setMobileChapterMenu] = useState(null);

  // Writing preferences
  const [writingPrefs, setWritingPrefs] = useState({
    style: '',
    paragraph: 'normal',
    pace: 'normal',
    characterConsistency: 'strict',
  });

  // Outline (chapter planning)
  const [outline, setOutline] = useState([]);
  const [showOutline, setShowOutline] = useState(false);
  const [outlineText, setOutlineText] = useState('');
  const [outlineSaving, setOutlineSaving] = useState(false);
  const [outlineError, setOutlineError] = useState('');

  // Debug: current generation template info
  const [debugPromptInfo, setDebugPromptInfo] = useState(null);

  // Generation progress
  const [genProgress, setGenProgress] = useState({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });

  // Mobile simple edit
  const [showMobileEdit, setShowMobileEdit] = useState(false);
  const [mobileEditTitle, setMobileEditTitle] = useState('');
  const [mobileEditContent, setMobileEditContent] = useState('');
  const [mobileEditSaving, setMobileEditSaving] = useState(false);

  // Bottom-right notification card
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Browser title during generation / rewrite
  useEffect(() => {
    const busy = loading || regenerating;
    document.title = busy ? '生成中...' : '小墨匣';
    return () => { document.title = '小墨匣'; };
  }, [loading, regenerating]);

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ---- Mobile history navigation ----
  const navigateTo = useCallback((view) => {
    window.history.pushState({ mobileView: view }, '', '');
    setMobileView(view);
    setMobileGenerateOpen(false);
    setMobileVariantsOpen(false);
    setMobileChapterMenu(null);
    setMobileShelfMenu(null);
  }, []);

  const handleAppBackRef = useRef(null);

  // Unified mobile back button: uses internal state transitions, not browser history
  // Unified back handler — used by both popstate and back button
  // Returns 'overlay' (closed a panel), 'view' (changed view), or 'none' (at root)
  const handleAppBack = () => {
    // 1) Close floating panels / overlays first
    if (showSettings) {
      setShowSettings(false);
      setEditingProjectName(null);
      return 'overlay';
    }
    if (showCreateForm) {
      setShowCreateForm(false);
      setCreateError('');
      setNewProjectName('');
      setNewWorld('');
      setNewCharacters('');
      setNewStyle('');
      setNewSummary('');
      return 'overlay';
    }
    if (showOutline) {
      setShowOutline(false);
      return 'overlay';
    }
    if (editingTitle) {
      setEditingTitle(false);
      return 'overlay';
    }

    // 2) View hierarchy: editor → chapter → project → shelf
    if (mobileView === 'editor') {
      setMobileView('chapter');
      return 'view';
    }
    if (mobileView === 'chapter' || readingChapter) {
      setReadingChapter(null);
      setReadingChapterTitle('');
      setReadingContent('');
      setVariants([]);
      setVariantPreview(null);
      setShowRewriteInput(false);
      setRewritePrompt('');
      setDebugPromptInfo(null);
      resetEditorRoom();
      setMobileView('project');
      return 'view';
    }
    if (mobileView === 'project' || currentProject) {
      setCurrentProject(null);
      setProjectDetails(null);
      setDisplayContent('');
      setReadingChapter(null);
      setReadingChapterTitle('');
      setReadingContent('');
      setVariants([]);
      setVariantPreview(null);
      setShowRewriteInput(false);
      setRewritePrompt('');
      setShowOutline(false);
      setShowSettings(false);
      setEditingProjectName(null);
      setMobileView('shelf');
      return 'view';
    }

    // 3) Already at shelf — nothing further
    return 'none';
  };

  // Keep ref current for popstate listener
  handleAppBackRef.current = handleAppBack;

  // Convenience wrapper for back-button clicks
  const onBackClick = () => {
    handleAppBack();
  };

  // Seed initial history & handle popstate (browser back / mobile swipe-back)
  useEffect(() => {
    // Ensure a guard entry so the first back doesn't exit the app
    if (!window.history.state || !window.history.state.mobileView) {
      window.history.replaceState({ mobileView: 'shelf' }, '', '');
      window.history.pushState({ mobileView: 'shelf', guard: true }, '', '');
    }

    const handlePopState = (event) => {
      if (event.state && event.state.mobileView) {
        const result = handleAppBackRef.current();
        if (result === 'none') {
          // At shelf root — push a guard so the next back doesn't exit
          window.history.pushState({ mobileView: 'shelf', guard: true }, '', '');
        }
      } else {
        // Hit boundary (no app state) — push guard to stay in-app
        window.history.pushState({ mobileView: 'shelf', guard: true }, '', '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Editor Note
  const [editorNoteLoading, setEditorNoteLoading] = useState(false);
  const [editorNoteError, setEditorNoteError] = useState('');
  const [editorNoteResult, setEditorNoteResult] = useState('');
  const editorNoteReqId = useRef(0);
  const generatingRef = useRef(false);
  const [streamingChapterNum, setStreamingChapterNum] = useState('');

  // Editor room
  const [editorRoomTab, setEditorRoomTab] = useState('notes');
  const [editorNotes, setEditorNotes] = useState([]);
  const [editorChats, setEditorChats] = useState([]);
  const [editorChatInput, setEditorChatInput] = useState('');
  const [editorChatSending, setEditorChatSending] = useState(false);
  const [editorChatError, setEditorChatError] = useState('');
  const [editorChatContextMode, setEditorChatContextMode] = useState('light');
  const [savingEditorNoteId, setSavingEditorNoteId] = useState('');
  const editorChatListRef = useRef(null);
  const readingSectionRef = useRef(null);
  const readingContentRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      editorChatListRef.current?.scrollTo({
        top: editorChatListRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [editorChats, editorChatSending]);

  // 章节内容区域滚动监听（桌面端使用 content div 的 onScroll，移动端使用 window scroll）
  const handleReadingContentScroll = () => {
    if (readingContentRef.current) {
      setShowScrollTop(readingContentRef.current.scrollTop > 300);
    }
  };

  useEffect(() => {
    if (!isMobile || !readingChapter) {
      setShowScrollTop(false);
      return;
    }
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, readingChapter]);

  // 章节切换时重置滚动状态
  useEffect(() => {
    setShowScrollTop(false);
  }, [readingChapter]);

  const handleScrollToTop = () => {
    if (isMobile) {
      readingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      readingContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ---- Fetch project list ----
  const fetchProjects = async () => {
    try {
      const data = await safeJsonFetch('/api/projects');
      setProjects(data.projects || []);
    } catch {
      setError('获取项目列表失败');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const resetEditorRoom = () => {
    setEditorRoomTab('notes');
    setEditorNotes([]);
    setEditorChats([]);
    setEditorChatInput('');
    setEditorChatError('');
    setSavingEditorNoteId('');
    setEditorNoteResult('');
    setEditorNoteError('');
    setEditorNoteLoading(false);
    editorNoteReqId.current++;
  };

  // ---- Select a project ----
  const handleSelectProject = async (name) => {
    setCurrentProject(name);
    setError('');
    setLastFilename('');
    setUserPrompt('');
    setReadingChapter(null);
    setReadingChapterTitle('');
    setReadingContent('');
    setVariants([]);
    setVariantPreview(null);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setShowSettings(false);
    setEditingProjectName(null);
    setShowOutline(false);
    setOutline([]);
    setOutlineText('');
    setOutlineError('');
    setDebugPromptInfo(null);
    resetEditorRoom();
    if (isMobile) navigateTo('project');
    setWritingPrefs({ style: '', paragraph: 'normal', pace: 'normal', characterConsistency: 'strict' });
    setEditWorld('');
    setEditCharacters('');
    setEditStyle('');
    setEditSummary('');
    setEditEditorialMemory('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`);
      // Normalize: ensure chapters have fileName regardless of backend field name
      if (data.chapters) data.chapters = normalizeChapters(data.chapters);
      setProjectDetails(data);
      setProjectChapterCounts(prev => ({ ...prev, [name]: data.chapters ? data.chapters.length : 0 }));
      setDisplayContent(data.recentContent || '');
    } catch (err) {
      setError(err.message);
      setProjectDetails(null);
      setDisplayContent('');
    }
  };

  const ILLEGAL_CHARS = /[/\\:*?"<>|]/;

  // ---- Create a project ----
  const handleCreateProject = async () => {
    const name = newProjectName.trim();

    if (!name) {
      setCreateError('项目名不能为空');
      return;
    }
    if (ILLEGAL_CHARS.test(name)) {
      setCreateError('项目名不能包含 / \\ : * ? " < > | 等字符');
      return;
    }

    setCreateError('');
    setCreating(true);
    try {
      await safeJsonFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: name,
          world: newWorld,
          characters: newCharacters,
          style: newStyle,
          summary: newSummary,
        }),
      });

      setShowCreateForm(false);
      setNewProjectName('');
      setNewWorld('');
      setNewCharacters('');
      setNewStyle('');
      setNewSummary('');
      setCreateError('');
      await fetchProjects();
      await handleSelectProject(name);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // ---- Generate ----
  const handleGenerate = async () => {
    if (loading || regenerating || generatingRef.current) return;
    if (!currentProject) {
      setError('请先选择一个项目');
      return;
    }
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
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setLoading(true);
    generatingRef.current = true;
    setStreamingChapterNum(nextNumStr);
    // 立即进入临时章节状态，在阅读区显示生成进度
    setReadingChapter('_streaming');
    setReadingChapterTitle('第 ' + nextNumStr + ' 章 生成中...');
    setReadingContent('');
    setGenProgress({ visible: true, mode: 'generate', status: 'streaming', errorMessage: '' });

    let fileName, content, title, debugInfo;

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

      if (!response.ok) throw new Error('流式接口返回错误状态');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'chunk') {
              streamedContent += event.content;
            } else if (event.type === 'done') {
              fileName = event.fileName;
              content = event.content;
              title = event.title;
              debugInfo = event.debugPromptInfo;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }

        // 每轮 read() 后更新阅读区正文，让 React 在 await 间隙渲染
        if (streamedContent) {
          setReadingContent(streamedContent);
        }
      }

      if (!fileName) throw new Error('流式生成未完成');
    } catch (streamErr) {
      console.warn('流式生成失败，回退到普通生成:', streamErr);
      setReadingChapter(null);
      setReadingChapterTitle('');
      setReadingContent('');
      setStreamingChapterNum('');

      // 回退到非流式生成
      setGenProgress({ visible: true, mode: 'generate', status: 'running', errorMessage: '' });
      try {
        const data = await safeJsonFetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: currentProject,
            userPrompt: enhancedPrompt,
            model,
          }),
          timeout: 180000,
        });
        fileName = data.fileName || data.filename;
        content = data.content;
        title = data.title || '';
        debugInfo = data.debugPromptInfo || null;
      } catch (err) {
        const isNetworkOrTimeout = err.name === 'AbortError' || err instanceof TypeError;
        if (isNetworkOrTimeout) {
          setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: '网络异常或请求超时' });
          setNotification({ title: '网络异常', message: '请求超时或网络中断，章节可能已保存。请刷新页面确认，不要重复点击生成。' });
        } else {
          setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: err.message });
          setNotification({ title: '生成失败', message: err.message });
        }
        setLoading(false);
        generatingRef.current = false;
        return;
      }
    }

    // 公共完成逻辑
    setStreamingChapterNum('');
    setDisplayContent((prev) => {
      const sep = prev ? '\n\n' : '';
      return prev + sep + '--- ' + fileName + ' ---\n' + content;
    });
    setLastFilename(fileName);
    setUserPrompt('');
    setDebugPromptInfo(debugInfo || null);
    resetEditorRoom();
    // 从临时章节转为正式章节
    setReadingChapter(fileName);
    setReadingChapterTitle(title || '');
    setReadingContent(content);

    let refreshFailed = false;
    try {
      const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
      if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
      setProjectDetails(refreshData);
    } catch (refreshErr) {
      refreshFailed = true;
      console.warn('刷新章节列表失败:', refreshErr);
    }
    setGenProgress(prev => ({ ...prev, status: 'success' }));
    if (refreshFailed) {
      setNotification({ title: '这一章写好了', message: `章节已保存（${fileName}），但列表刷新失败，请手动刷新。` });
    } else {
      setNotification({ title: '这一章写好了', message: `新章节已保存（${fileName}）` });
    }

    setLoading(false);
    generatingRef.current = false;
  };

  // ---- Read a chapter ----
  const handleReadChapter = async (filename) => {
    setError('');
    setDebugPromptInfo(null);
    resetEditorRoom();
    // Clear previous chapter state before loading new one
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setReadingContent('');
    try {
      const url = `/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`;
      const data = await safeJsonFetch(url);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingChapterTitle(data.title || '');
      setReadingContent(data.content === '' ? '章节为空' : data.content);
      setEditorNotes(Array.isArray(data.editorNotes) ? data.editorNotes : []);
      setEditorChats(Array.isArray(data.editorChats) ? data.editorChats : []);
      setProjectDetails((prev) => {
        if (!prev?.chapters) return prev;
        const chapters = prev.chapters.map((ch) =>
          (ch.fileName || ch.filename) === data.fileName
            ? {
                ...ch,
                staleAfterRewrite: data.staleAfterRewrite === true,
                staleReason: data.staleReason || '',
                staleFromFileName: data.staleFromFileName || '',
                staleAt: data.staleAt || null,
              }
            : ch
        );
        return { ...prev, chapters };
      });
      // Load variants for this chapter
      handleLoadVariants(data.fileName);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Delete a chapter ----
  const handleDeleteChapter = async (filename, e) => {
    e.stopPropagation();
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === filename);
    const label = ch?.title || filename;
    if (!confirm(`确定删除章节【${label}】吗？此操作不可恢复。`)) return;
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      // Refresh chapter list
      const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
      if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
      setProjectDetails(refreshData);
      setDisplayContent(refreshData.recentContent || '');
      // If reading the deleted chapter, close it
      if (readingChapter === filename) {
        setReadingChapter(null);
        setReadingContent('');
        setVariants([]);
        setVariantPreview(null);
        setShowRewriteInput(false);
        setRewritePrompt('');
        setDebugPromptInfo(null);
        resetEditorRoom();
      }
      setError('章节已删除');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Delete a project ----
  const handleDeleteProject = async (name, e) => {
    e.stopPropagation();
    if (!confirm(`确定删除项目【${name}】吗？这会删除该项目的所有章节和设定，且不可恢复。`)) return false;
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      // If deleting the current project, clear all state
      if (currentProject === name) {
        setCurrentProject(null);
        setProjectDetails(null);
        setDisplayContent('');
        setReadingChapter(null);
        setReadingContent('');
        setVariants([]);
        setVariantPreview(null);
        setShowRewriteInput(false);
        setRewritePrompt('');
        setLastFilename('');
        setUserPrompt('');
        setShowSettings(false);
        setEditingProjectName(null);
        setDebugPromptInfo(null);
        setEditWorld('');
        setEditCharacters('');
        setEditStyle('');
        setEditSummary('');
        setEditEditorialMemory('');
        resetEditorRoom();
      }
      await fetchProjects();
      setError('项目已删除');
      setTimeout(() => setError(''), 3000);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Mobile shelf: delete project with view state cleanup
  const handleShelfDeleteProject = async (name) => {
    setMobileShelfMenu(null);
    const ok = await handleDeleteProject(name, { stopPropagation() {} });
    if (ok && isMobile) {
      setMobileView('shelf');
      setMobileGenerateOpen(false);
      setMobileVariantsOpen(false);
    }
  };

  // Mobile chapter list: delete chapter with menu cleanup
  const handleMobileDeleteChapter = async (filename) => {
    setMobileChapterMenu(null);
    await handleDeleteChapter(filename, { stopPropagation() {} });
  };

  // ---- Copy full text ----
  const handleCopyFull = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败');
    }
  };

  // ---- Copy current chapter ----
  const handleCopyChapter = async () => {
    try {
      await navigator.clipboard.writeText(readingContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败');
    }
  };

  // ---- Open settings ----
  const handleOpenSettings = () => {
    if (!projectDetails) return;
    setEditWorld(projectDetails.world || '');
    setEditCharacters(projectDetails.characters || '');
    setEditStyle(projectDetails.style || '');
    setEditSummary(projectDetails.summary || '');
    setEditEditorialMemory(projectDetails.editorialMemory || '');
    setEditingProjectName(currentProject);
    setShowSettings(true);
    setError('');
  };

  // ---- Save settings ----
  const handleSaveSettings = async () => {
    if (editingProjectName !== currentProject) {
      setError('当前项目已切换，请重新打开编辑设定后再保存。');
      setShowSettings(false);
      return;
    }

    setError('');
    setSavingSettings(true);
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: editWorld,
          characters: editCharacters,
          style: editStyle,
          summary: editSummary,
          editorialMemory: editEditorialMemory,
        }),
      });
      // Sync projectDetails
      setProjectDetails((prev) => prev ? {
        ...prev,
        world: data.project?.world ?? editWorld,
        characters: data.project?.characters ?? editCharacters,
        style: data.project?.style ?? editStyle,
        summary: data.project?.summary ?? editSummary,
        editorialMemory: data.project?.editorialMemory ?? editEditorialMemory,
      } : prev);
      setError('设定已保存');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // ---- Outline ----
  const handleLoadOutline = async () => {
    if (!currentProject) return;
    setOutlineError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/outline`);
      const list = Array.isArray(data.outline) ? data.outline : [];
      setOutline(list);
      setOutlineText(JSON.stringify(list, null, 2));
    } catch (err) {
      setOutlineError(err.message);
    }
  };

  const handleSaveOutline = async () => {
    if (!currentProject) return;
    setOutlineError('');
    let parsed;
    try {
      parsed = JSON.parse(outlineText);
      if (!Array.isArray(parsed)) throw new Error('内容必须是 JSON 数组');
    } catch (err) {
      setOutlineError('JSON 格式错误：' + err.message);
      return;
    }
    setOutlineSaving(true);
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: parsed }),
      });
      setOutline(data.outline);
      setOutlineText(JSON.stringify(data.outline, null, 2));
      setOutlineError('已保存');
      setTimeout(() => setOutlineError(''), 3000);
    } catch (err) {
      setOutlineError(err.message);
    } finally {
      setOutlineSaving(false);
    }
  };

  // ---- Refresh ----
  const handleRefresh = async () => {
    setError('');
    await fetchProjects();
    if (currentProject) {
      await handleSelectProject(currentProject);
    }
  };

  // ---- Export full text ----
  const handleExport = async () => {
    if (!currentProject) return;
    setExportStatus('exporting');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/export`);
      const blob = new Blob([data.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName || `${currentProject}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus('success');
      setTimeout(() => setExportStatus(''), 3000);
    } catch (err) {
      setExportStatus('error');
      setError('导出失败：' + err.message);
      setTimeout(() => { setExportStatus(''); }, 3000);
    }
  };

  // ---- Backup project ----
  const handleBackup = async () => {
    if (!currentProject) return;
    setError('');
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(currentProject)}/backup`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '备份下载失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const match = disposition && disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? decodeURIComponent(match[1]) : `${currentProject}-backup.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setError('备份已下载');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Rebuild summary ----
  const handleRebuildSummary = async () => {
    if (!currentProject) return;
    setError('');
    setRebuildingSummary(true);
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/summary/rebuild`, {
        method: 'POST',
      });
      // Update local projectDetails summary
      setProjectDetails((prev) => prev ? { ...prev, summary: data.summary } : prev);
      setError('摘要已重建');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    } finally {
      setRebuildingSummary(false);
    }
  };

  // ---- Rebuild chapter index ----
  const handleRebuildIndex = async () => {
    if (!currentProject) return;
    if (!confirm('确定要重建章节索引吗？已有章节标题会尽量保留。')) return;
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/rebuild-index`, {
        method: 'POST',
      });
      // Update projectDetails chapters
      if (data.chapters) data.chapters = normalizeChapters(data.chapters);
      setProjectDetails((prev) => prev ? { ...prev, chapters: data.chapters } : prev);
      // If the reading chapter no longer exists, clear reading
      if (readingChapter && !data.chapters.find((ch) => ch.fileName === readingChapter)) {
        setReadingChapter(null);
        setReadingContent('');
        resetEditorRoom();
      }
      setError('索引已重建');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Edit chapter title ----
  const handleStartEditTitle = () => {
    setEditTitleValue(readingChapterTitle);
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed) {
      setError('标题不能为空');
      return;
    }
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      // Update local state
      setProjectDetails((prev) => {
        if (!prev) return prev;
        const updated = prev.chapters?.map((ch) =>
          ch.fileName === readingChapter ? { ...ch, title: trimmed } : ch
        );
        return { ...prev, chapters: updated };
      });
      setReadingChapterTitle(trimmed);
      setEditingTitle(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setEditTitleValue('');
  };

  // ---- Variants (regenerate chapter) ----
  const handleLoadVariants = async (filename) => {
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}/variants`);
      setVariants(data.variants || []);
    } catch {
      setVariants([]);
    }
  };

  const handleLoadRewritePrompt = () => {
    if (!currentProject || !readingChapter) return;
    // Get saved userPrompt from projectDetails, fallback to "继续写"
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
    const saved = ch?.userPrompt || '继续写';
    setRewritePrompt(saved);
    setShowRewriteInput(true);
  };

  const handleRegenerate = async () => {
    if (loading || regenerating) return;
    if (!currentProject || !readingChapter) return;
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
    setVariantPreview(null);
    setReadingChapter('_streaming');
    setReadingChapterTitle('重写生成中...');
    setReadingContent('');
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
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedContent = '';
      let doneVariant = null;
      let doneDebugInfo = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'chunk') {
              streamedContent += event.content;
              setReadingContent(streamedContent);
            } else if (event.type === 'done') {
              doneVariant = event.variant;
              doneDebugInfo = event.debugPromptInfo;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      if (!doneVariant) {
        throw new Error('重写未完成');
      }

      // Success: restore readingChapter, update title from variant, keep streamed content
      setReadingChapter(origChapter);
      setReadingChapterTitle(doneVariant.title || origTitle);
      setVariants((prev) => [...prev, { ...doneVariant, _debugPromptInfo: doneDebugInfo }]);
      handleLoadVariants(origChapter);
      setShowRewriteInput(false);
      setRewritePrompt('');
      setGenProgress(prev => ({ ...prev, status: 'success' }));
      setNotification({ title: '候选版本写好了', message: '可以查看并决定是否采用。' });
      // 刷新项目详情，保持章节列表与后台同步
      try {
        const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
        if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
        setProjectDetails(refreshData);
      } catch (refreshErr) {
        console.warn('重写后刷新项目详情失败:', refreshErr);
      }
    } catch (err) {
      setReadingChapter(origChapter);
      setReadingChapterTitle(origTitle);
      setReadingContent(origContent);
      setGenProgress({ visible: true, mode: 'rewrite', status: 'error', errorMessage: err.message });
      setNotification({ title: '生成失败', message: err.message });
    } finally {
      setRegenerating(false);
    }
  };

  const handleMobileSaveEdit = async () => {
    if (!currentProject || !readingChapter || mobileEditSaving) return;
    setMobileEditSaving(true);
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: mobileEditTitle, content: mobileEditContent }),
      });
      setReadingChapterTitle(mobileEditTitle);
      setReadingContent(mobileEditContent);
      setShowMobileEdit(false);
      setNotification({ title: '已保存', message: '章节内容已更新。' });
    } catch (err) {
      setError(err.message);
    } finally {
      setMobileEditSaving(false);
    }
  };

  const handleApplyVariant = async (variantId) => {
    if (!currentProject || !readingChapter) return;
    setApplyingVariant(true);
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/variants/${encodeURIComponent(variantId)}/apply`, {
        method: 'PUT',
      });
      // Update reading content and title
      setReadingContent(data.content);
      if (data.title) setReadingChapterTitle(data.title);
      setVariantPreview(null);
      // Update projectDetails chapters to reflect new activeVersionId and title
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

      // Auto-rebuild summary after variant is applied
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
  };

  const handleConfirmKeepChapter = async () => {
    if (!currentProject || !readingChapter) return;
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/stale/confirm`, {
        method: 'PUT',
      });
      if (data.chapters) {
        const chapters = normalizeChapters(data.chapters);
        setProjectDetails((prev) => prev ? { ...prev, chapters } : prev);
      } else if (data.chapter) {
        setProjectDetails((prev) => {
          if (!prev?.chapters) return prev;
          const chapters = prev.chapters.map((ch) =>
            (ch.fileName || ch.filename) === readingChapter ? { ...ch, ...data.chapter } : ch
          );
          return { ...prev, chapters };
        });
      }
      setNotification({ title: '已确认保留', message: '当前章节已恢复为可用正史。' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePreviewVariant = (variant) => {
    setVariantPreview(variantPreview?.id === variant.id ? null : variant);
  };

  // Build enhanced prompt by appending writing preferences
  function buildEnhancedPrompt(basePrompt, prefs) {
    const lines = [];
    if (prefs.style?.trim()) lines.push(`- 文风：${prefs.style.trim()}`);

    const paragraphMap = { short: '短段，加快叙事节奏', normal: '自然段', long: '长段，展开细节描写' };
    lines.push(`- 段落：${paragraphMap[prefs.paragraph] || paragraphMap.normal}`);

    const paceMap = { slow: '慢热，铺垫细节', normal: '正常推进', fast: '快一点，减少冗余描写' };
    lines.push(`- 剧情推进：${paceMap[prefs.pace] || paceMap.normal}`);

    const charMap = { strict: '严格保持既有人物性格和关系', natural: '允许人物自然发展' };
    lines.push(`- 人设：${charMap[prefs.characterConsistency] || charMap.strict}`);

    return basePrompt + '\n\n【本次写作偏好】\n' + lines.join('\n');
  }

  const enhancedPrompt = useMemo(() => buildEnhancedPrompt(userPrompt.trim(), writingPrefs), [userPrompt, writingPrefs]);
  const enhancedRewritePrompt = useMemo(() => buildEnhancedPrompt((rewritePrompt || '').trim(), writingPrefs), [rewritePrompt, writingPrefs]);
  const readingChapterRecord = useMemo(
    () => projectDetails?.chapters?.find((ch) => (ch.fileName || ch.filename) === readingChapter) || null,
    [projectDetails, readingChapter]
  );

  const handleGenProgressDone = useCallback(() => {
    setGenProgress({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });
  }, []);

  // ---- Editor Note ----
  const syncCurrentChapterEditorData = (notes, chats) => {
    setProjectDetails((prev) => {
      if (!prev || !readingChapter) return prev;
      const chapters = prev.chapters?.map((ch) =>
        (ch.fileName || ch.filename) === readingChapter
          ? {
              ...ch,
              editorNotes: notes ?? ch.editorNotes ?? [],
              editorChats: chats ?? ch.editorChats ?? [],
            }
          : ch
      );
      return { ...prev, chapters };
    });
  };

  const handleEditorNote = async () => {
    if (!currentProject || !readingChapter) {
      setEditorNoteError('请先选择项目并阅读章节');
      return;
    }

    setEditorRoomTab('notes');
    const reqId = ++editorNoteReqId.current;
    setEditorNoteLoading(true);
    setEditorNoteError('');
    setEditorNoteResult('');

    try {
      const url = `/api/editor/note?projectName=${encodeURIComponent(currentProject)}&chapterFileName=${encodeURIComponent(readingChapter)}`;
      const data = await safeJsonFetch(url);
      if (reqId !== editorNoteReqId.current) return;
      setEditorNoteResult(data.note || '（无备注内容）');
    } catch (err) {
      if (reqId !== editorNoteReqId.current) return;
      setEditorNoteError(err.message);
    } finally {
      if (reqId === editorNoteReqId.current) {
        setEditorNoteLoading(false);
      }
    }
  };

  const handleEditorChatKeyDown = (event) => {
    if (event.nativeEvent?.isComposing || event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!editorChatInput.trim() || editorChatSending) return;
      handleSendEditorChat();
    }
  };

  const handleSendEditorChat = async () => {
    if (editorChatSending || !currentProject || !readingChapter) return;
    const trimmed = editorChatInput.trim();
    if (!trimmed) {
      setEditorChatError('');
      return;
    }

    const userMsg = { id: `local-${Date.now()}-user`, role: 'user', content: trimmed, createdAt: Date.now() };
    const chatsWithUser = [...editorChats, userMsg];

    setEditorChats(chatsWithUser);
    setEditorChatInput('');
    setEditorChatSending(true);
    setEditorChatError('');
    try {
      const data = await safeJsonFetch('/api/editor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          chapterId: readingChapter,
          fileName: readingChapter,
          message: trimmed,
          contextMode: editorChatContextMode,
        }),
      });
      const finalChats = Array.isArray(data.editorChats)
        ? data.editorChats
        : [...chatsWithUser, { id: `local-${Date.now()}-editor`, role: 'editor', content: data.reply || '', createdAt: Date.now() }];
      setEditorChats(finalChats);
      syncCurrentChapterEditorData(editorNotes, finalChats);
    } catch (err) {
      setEditorChatError(err.message);
    } finally {
      setEditorChatSending(false);
    }
  };

  const handleClearEditorChats = async () => {
    if (!currentProject || !readingChapter || editorChatSending) return;
    if (!confirm('确定清空当前章节的编辑对话吗？此操作不可恢复。')) return;

    setEditorChatError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/editor-chats`, {
        method: 'DELETE',
      });
      const nextChats = Array.isArray(data.editorChats) ? data.editorChats : [];
      setEditorChats(nextChats);
      syncCurrentChapterEditorData(editorNotes, nextChats);
    } catch (err) {
      setEditorChatError(err.message);
    }
  };

  const handleSaveEditorNote = async (content, sourceId = 'generated-note') => {
    if (!currentProject || !readingChapter || !content?.trim()) return;
    setSavingEditorNoteId(sourceId);
    setEditorNoteError('');
    setEditorChatError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/editor-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const nextNotes = Array.isArray(data.editorNotes) ? data.editorNotes : [...editorNotes, data.note].filter(Boolean);
      setEditorNotes(nextNotes);
      syncCurrentChapterEditorData(nextNotes, editorChats);
      setEditorRoomTab('notes');
      setNotification({ title: '已保存为备注', message: '这条编辑建议已经追加到当前章节。' });
    } catch (err) {
      setEditorNoteError(err.message);
      setEditorChatError(err.message);
    } finally {
      setSavingEditorNoteId('');
    }
  };

  return (
    <div className={`app${isMobile && mobileView === 'chapter' && readingTheme === 'dark' ? ' mobile-chapter-dark' : ''}`}>
      <h1>小墨匣</h1>
      <div className={`container app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        {/* ===== Left Panel: Projects (desktop only) ===== */}
        {!isMobile && (isSidebarCollapsed ? (
          <button
            className="sidebar-collapsed-toggle"
            onClick={() => setIsSidebarCollapsed(false)}
            title="展开侧栏"
          >
            ›
          </button>
        ) : (
          <aside className="panel panel-left sidebar">
            {!isMobile && (
            <button
              className="sidebar-collapsed-toggle sidebar-collapse-button"
              onClick={() => setIsSidebarCollapsed(true)}
              title="收起侧栏"
            >
              ‹
            </button>
            )}

            <section className="sidebar-section">
              <div className="sidebar-section-header">
                <h2>项目</h2>
                <div className="sidebar-section-actions">
                  {!isProjectsCollapsed && <button className="btn" onClick={handleRefresh}>刷新</button>}
                  <button className="btn btn-secondary" onClick={() => setIsProjectsCollapsed((prev) => !prev)}>
                    {isProjectsCollapsed ? '展开' : '收起'}
                  </button>
                </div>
              </div>

              {!isProjectsCollapsed && (
                <div className="sidebar-section-body">
                  <div className="project-list project-list-scroll">
                    {projects.length === 0 && (
                      <p className="hint">暂无项目，请创建一个</p>
                    )}
                    {projects.map((name) => (
                      <div key={name} className="project-item-wrap">
                        <div
                          className={'project-item' + (currentProject === name ? ' active' : '')}
                          onClick={() => handleSelectProject(name)}
                        >
                          <span className="project-name">{name}</span>
                        </div>
                        <button className="delete-btn project-delete" onClick={(e) => handleDeleteProject(name, e)}>删除</button>
                      </div>
                    ))}
                  </div>

                  <button className="btn btn-secondary" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>
                    + 创建项目
                  </button>
                </div>
              )}
            </section>

            {projectDetails && (
              <section className="sidebar-section chapters-list">
                <div className="sidebar-section-header">
                  <h3>章节列表</h3>
                  <div className="sidebar-section-actions">
                    {!isChaptersCollapsed && (
                      <>
                        <button className="btn" onClick={handleExport} disabled={exportStatus === 'exporting'}>
                          {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
                        </button>
                        <details className="project-tools">
                          <summary className="project-tools-summary">项目工具</summary>
                          <div className="project-tools-body">
                            <button className="btn" onClick={handleRebuildIndex}>重建索引</button>
                            <button className="btn btn-secondary" onClick={handleBackup}>
                              导出项目备份
                            </button>
                          </div>
                        </details>
                      </>
                    )}
                    <button className="btn btn-secondary" onClick={() => setIsChaptersCollapsed((prev) => !prev)}>
                      {isChaptersCollapsed ? '展开' : '收起'}
                    </button>
                  </div>
                </div>

                {!isChaptersCollapsed && (
                  <div className="sidebar-section-body chapter-list-scroll">
                    {projectDetails.chapters && projectDetails.chapters.length > 0 ? (
                      <ul>
                        {projectDetails.chapters.map((ch, index) => {
                          const cf = ch.fileName || ch.filename;
                          const key = cf || `chapter-${index}`;
                          return (
                          <li key={key} className={`chapter-item-wrap${!cf ? ' disabled' : ''}`}>
                            <div
                              className={'chapter-item' + (cf && readingChapter === cf ? ' active' : '')}
                              onClick={() => {
                              if (cf) {
                                handleReadChapter(cf);
                                if (isMobile) { navigateTo('chapter'); setMobileGenerateOpen(false); setMobileVariantsOpen(false); }
                              }
                            }}
                            >
                              <span className="chapter-name">
                                <span className="chapter-name-text">{cf ? `${cf.slice(0, 3)} ${ch.title || cf.replace(/\.txt$/, '')}` : '无效章节'}</span>
                                {ch.staleAfterRewrite && <span className="chapter-stale-badge">待检查</span>}
                              </span>
                            </div>
                            <button className="delete-btn chapter-delete" disabled={!cf} onClick={(e) => cf && handleDeleteChapter(cf, e)}>删除</button>
                          </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="hint">暂无章节</p>
                    )}
                  </div>
                )}
              </section>
            )}
          </aside>
        ))}

        {/* ===== Main Panel (desktop always, mobile hidden on shelf/project) ===== */}
        {!(isMobile && (mobileView === 'shelf' || mobileView === 'project')) && (
        <div className="panel panel-main">
          {/* Mobile: editor view — standalone */}
          {isMobile && mobileView === 'editor' && readingChapter ? (
            <div className="mobile-editor-view">
              <button className="mobile-back-btn" onClick={onBackClick}>
                ← 返回章节
              </button>
              <div className="editor-room">
                <div className="editor-room-header">
                  <h3>编辑室</h3>
                  <span className="editor-room-subtitle">{readingChapterTitle || readingChapter || ''}</span>
                  <div className="editor-room-tabs">
                    <button
                      className={'editor-room-tab' + (editorRoomTab === 'notes' ? ' active' : '')}
                      onClick={() => setEditorRoomTab('notes')}
                    >
                      备注
                    </button>
                    <button
                      className={'editor-room-tab' + (editorRoomTab === 'chat' ? ' active' : '')}
                      onClick={() => setEditorRoomTab('chat')}
                    >
                      对话
                    </button>
                  </div>
                  {editorRoomTab === 'chat' && (
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 8px', minHeight: 0, flexShrink: 0 }} onClick={handleClearEditorChats} disabled={editorChatSending || editorChats.length === 0}>
                      清空
                    </button>
                  )}
                </div>

                {editorRoomTab === 'notes' && (
                  <div className="editor-room-notes">
                    <div className="editor-room-toolbar">
                      <button className="btn btn-ai" onClick={handleEditorNote} disabled={editorNoteLoading}>
                        {editorNoteLoading ? '生成中...' : '生成本章编辑备注'}
                      </button>
                    </div>
                    {editorNoteError && <div className="error">{editorNoteError}</div>}
                    {editorNoteLoading && (
                      <div className="editor-note-loading editor-note-loading-inline">
                        <div className="editor-note-loading-spinner"></div>
                        <span>正在生成编辑备注...</span>
                      </div>
                    )}
                    {!editorNoteLoading && editorNoteResult && (
                      <div className="editor-note-draft">
                        <div className="editor-note-text">{editorNoteResult}</div>
                        <button
                          className="btn btn-secondary"
                          disabled={savingEditorNoteId === 'generated-note'}
                          onClick={() => handleSaveEditorNote(editorNoteResult, 'generated-note')}
                        >
                          {savingEditorNoteId === 'generated-note' ? '保存中...' : '保存为备注'}
                        </button>
                      </div>
                    )}
                    <div className="editor-notes-list">
                      {editorNotes.length > 0 ? (
                        editorNotes.map((note, index) => (
                          <div className="editor-note-saved" key={`${readingChapter}-note-${index}`}>
                            {note}
                          </div>
                        ))
                      ) : (
                        <p className="hint">暂无编辑备注。可以生成一条，或从编辑对话中保存编辑回复。</p>
                      )}
                    </div>
                  </div>
                )}

                {editorRoomTab === 'chat' && (
                  <div className="editor-room-chat">
                    <div className="editor-chat-messages" ref={editorChatListRef}>
                      {editorChats.length > 0 ? (
                        editorChats.map((chat) => (
                          <div className={`editor-chat-row ${chat.role}`} key={chat.id}>
                            <div className="editor-chat-bubble">
                              <div className="editor-chat-meta">
                                {chat.role === 'user' ? '你' : '随书编辑'} · {new Date(chat.createdAt).toLocaleString()}
                              </div>
                              <div className="editor-chat-content">{chat.content}</div>
                              {chat.role === 'editor' && (
                                <button
                                  className="btn btn-secondary editor-chat-save"
                                  disabled={savingEditorNoteId === chat.id}
                                  onClick={() => handleSaveEditorNote(chat.content, chat.id)}
                                >
                                  {savingEditorNoteId === chat.id ? '保存中...' : '保存为备注'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="hint editor-chat-empty">暂无对话</p>
                      )}
                      {editorChatSending && (
                        <div className="editor-chat-row editor">
                          <div className="editor-chat-bubble">
                            <div className="editor-note-loading editor-note-loading-inline">
                              <div className="editor-note-loading-spinner"></div>
                              <span>编辑正在回复...</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {editorChatError && <div className="error">{editorChatError}</div>}
                    <div className="editor-chat-mode-row">
                      <div className="editor-chat-mode-btns">
                        {[
                          { mode: 'light', label: '省 token', desc: '只读摘要，适合闲聊' },
                          { mode: 'normal', label: '标准', desc: '读取章节，适合分析' },
                          { mode: 'full', label: '全量', desc: '读取完整设定，消耗较高' },
                        ].map(({ mode, label }) => (
                          <button
                            key={mode}
                            className={`btn btn-mode${editorChatContextMode === mode ? ' active' : ''}`}
                            disabled={editorChatSending}
                            onClick={() => setEditorChatContextMode(mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="editor-chat-mode-hint">
                        {editorChatContextMode === 'light' ? '只读摘要，适合闲聊' : editorChatContextMode === 'normal' ? '读取章节，适合分析' : '读取完整设定，消耗较高'}
                      </span>
                    </div>
                    <div className="editor-chat-input-row">
                      <div className="editor-chat-input-wrap">
                        <textarea
                          value={editorChatInput}
                          onChange={(e) => setEditorChatInput(e.target.value)}
                          onKeyDown={handleEditorChatKeyDown}
                          placeholder="和随书编辑聊聊这一章……"
                          rows={1}
                          disabled={editorChatSending}
                        />
                      </div>
                      <button className="btn" onClick={handleSendEditorChat} disabled={editorChatSending || !editorChatInput.trim()}>
                        {editorChatSending ? '发送中...' : '发送'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <>
          {/* Mobile: back button on chapter view */}
          {isMobile && mobileView === 'chapter' && (
            <button className="mobile-back-btn" onClick={onBackClick}>
              ← 返回列表
            </button>
          )}
          {showCreateForm ? (
            <div className="create-panel">
              <h2>创建新项目</h2>

              <label>项目名</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="输入项目名称"
              />

              <label>世界观设定</label>
              <textarea
                value={newWorld}
                onChange={(e) => setNewWorld(e.target.value)}
                placeholder="描述世界观设定..."
                rows={6}
              />

              <label>人物设定</label>
              <textarea
                value={newCharacters}
                onChange={(e) => setNewCharacters(e.target.value)}
                placeholder="描述主要人物..."
                rows={6}
              />

              <label>写作规则 / 风格要求</label>
              <textarea
                value={newStyle}
                onChange={(e) => setNewStyle(e.target.value)}
                placeholder="文风要求、篇幅要求、写作规则…"
                rows={8}
              />

              <label>剧情摘要（可选）</label>
              <textarea
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="剧情摘要…"
                rows={5}
              />

              {createError && <div className="error">{createError}</div>}

              <div className="form-actions">
                <button className="btn" disabled={creating} onClick={handleCreateProject}>
                  {creating ? '创建中...' : '创建'}
                </button>
                <button className="btn btn-secondary" disabled={creating} onClick={() => { setShowCreateForm(false); setCreateError(''); setNewProjectName(''); setNewWorld(''); setNewCharacters(''); setNewStyle(''); setNewSummary(''); }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              {!isMobile && <h2>生成小说</h2>}

              {currentProject ? (
            <>
              <div className="current-project-label">
                当前项目：<strong>{currentProject}</strong>
                <button className="btn-link" onClick={handleOpenSettings}>编辑设定</button>
                {!isMobile && (
                <button className="btn-link" onClick={() => { setShowOutline(!showOutline); if (!showOutline) handleLoadOutline(); }}>章节规划</button>
                )}
              </div>

              {/* Settings Editor */}
              {showSettings && (
                <div className="settings-panel">
                  <h3>项目设定</h3>
                  <label>世界观设定</label>
                  <textarea
                    className="settings-input"
                    value={editWorld}
                    onChange={(e) => setEditWorld(e.target.value)}
                    rows={3}
                    placeholder="世界观设定..."
                  />
                  <label>人物设定</label>
                  <textarea
                    className="settings-input"
                    value={editCharacters}
                    onChange={(e) => setEditCharacters(e.target.value)}
                    rows={3}
                    placeholder="人物设定..."
                  />
                  <label>写作规则</label>
                  <textarea
                    className="settings-input"
                    value={editStyle}
                    onChange={(e) => setEditStyle(e.target.value)}
                    rows={5}
                    placeholder="写作规则、文风要求..."
                  />
                  <label>剧情摘要</label>
                  <textarea
                    className="settings-input"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    rows={5}
                    placeholder="剧情摘要..."
                  />
                  <label>项目编辑记忆</label>
                  <div className="settings-hint">记录跨章节人物关系、伏笔、长期写作风险和编辑判断。不同于剧情摘要：摘要记录剧情事实，这里记录编辑分析。</div>
                  <textarea
                    className="settings-input"
                    value={editEditorialMemory}
                    onChange={(e) => setEditEditorialMemory(e.target.value)}
                    rows={6}
                    placeholder="项目编辑记忆..."
                  />
                  <details className="advanced-options">
                    <summary className="advanced-options-summary">
                      <span className="advanced-options-title">生成高级选项</span>
                      <span className="advanced-options-arrow">▶</span>
                    </summary>
                    <div className="advanced-options-body">
                      <PromptPreviewPanel
                        taskType="novel.generateChapter"
                        projectDetails={projectDetails}
                        userPrompt={enhancedPrompt}
                      />
                      <details className="advanced-options-sub">
                        <summary className="advanced-options-sub-summary">
                          高级模板设置
                        </summary>
                        <div className="advanced-options-sub-body">
                          <p className="hint" style={{ fontSize: 12, marginBottom: 8 }}>
                            一般不用改。只有在你想调整 AI 底层写作模板时再打开。
                          </p>
                          <VaultPanel />
                        </div>
                      </details>
                    </div>
                  </details>
                  <div className="form-actions">
                    <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>
                      {savingSettings ? '保存中...' : '保存设定'}
                    </button>
                    <button className="btn btn-secondary" disabled={savingSettings} onClick={() => setShowSettings(false)}>
                      关闭
                    </button>
                  </div>
                </div>
              )}

              {/* Outline Editor */}
              {showOutline && (
                <div className="settings-panel">
                  <h3>章节规划</h3>
                  <p className="hint" style={{ marginBottom: 8 }}>
                    用 JSON 数组编辑章节规划。每项包含 number（章节编号）、goal（本章目标）、keyEvents（关键事件数组）、characterChanges（人物变化）、status（planned/writing/written/revising）。生成下一章时会自动注入对应编号的规划。
                  </p>
                  <textarea
                    className="settings-input"
                    value={outlineText}
                    onChange={(e) => { setOutlineText(e.target.value); setOutlineError(''); }}
                    rows={12}
                    placeholder={`[\n  {\n    "number": 1,\n    "goal": "本章目标",\n    "keyEvents": ["事件1", "事件2"],\n    "characterChanges": "人物变化",\n    "status": "planned"\n  }\n]`}
                  />
                  {outlineError && (
                    <div className={outlineError === '已保存' ? '' : 'error'} style={outlineError === '已保存' ? { color: '#52c41a', marginTop: 4, fontSize: 13 } : { marginTop: 4 }}>
                      {outlineError}
                    </div>
                  )}
                  <div className="form-actions" style={{ marginTop: 8 }}>
                    <button className="btn" onClick={handleSaveOutline} disabled={outlineSaving}>
                      {outlineSaving ? '保存中...' : '保存规划'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setShowOutline(false); setOutlineError(''); }}>
                      关闭
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile: generate settings toggle */}
              {isMobile && (
                <button
                  className="mobile-section-toggle"
                  onClick={() => setMobileGenerateOpen(!mobileGenerateOpen)}
                >
                  续写设置 {mobileGenerateOpen ? '▲' : '▼'}
                </button>
              )}
              {!(isMobile && !mobileGenerateOpen) && (
              <div className="generate-panel-area">
              <label>续写要求</label>
              <textarea
                className="prompt-input"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="写下这次续写的方向……"
                rows={isMobile ? 4 : 6}
              />

              <div className="model-select">
                <label className={'model-option' + (model === 'deepseek-v4-flash' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-v4-flash"
                    checked={model === 'deepseek-v4-flash'}
                    onChange={() => setModel('deepseek-v4-flash')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">快速模式</span>
                    <span className="model-option-sub">{isMobile ? 'v4-flash · 日常续写' : 'deepseek-v4-flash · 速度更快，适合日常续写'}</span>
                  </span>
                </label>
                <label className={'model-option' + (model === 'deepseek-v4-pro' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-v4-pro"
                    checked={model === 'deepseek-v4-pro'}
                    onChange={() => setModel('deepseek-v4-pro')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">深度模式</span>
                    <span className="model-option-sub">{isMobile ? 'v4-pro · 长线代笔' : 'deepseek-v4-pro · 复杂剧情与长线伏笔'}</span>
                  </span>
                </label>
              </div>

              <WritingControlPanel
                prefs={writingPrefs}
                onChange={setWritingPrefs}
              />

              <button className="btn" onClick={handleGenerate} disabled={loading || regenerating}>
                {loading ? '生成中...' : '生成下一段'}
              </button>
              <GenerationProgress
                visible={genProgress.visible && genProgress.mode === 'generate'}
                mode={genProgress.mode}
                status={genProgress.status}
                errorMessage={genProgress.errorMessage}
                onComplete={handleGenProgressDone}
              />
              {error && <div className="error">{error}</div>}
              </div>
              )}

              {/* Reading Section */}
              {readingChapter && (
                <div className="reading-section" ref={readingSectionRef}>
                  <div className="reading-header">
                    <div className="reading-title-row">
                      {editingTitle ? (
                        <div className="reading-title-edit">
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            className="reading-title-input"
                            autoFocus
                          />
                          <button className="btn" onClick={handleSaveTitle}>保存</button>
                          <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                        </div>
                      ) : (
                        <h3>
                          {readingChapterTitle || readingChapter}
                          {readingChapter !== '_streaming' && (
                            <span className="reading-filename">{readingChapter}</span>
                          )}
                          {readingChapter !== '_streaming' && (
                            <button className="btn-link reading-title-edit-btn" onClick={handleStartEditTitle}>编辑标题</button>
                          )}
                        </h3>
                      )}
                    </div>
                    <div className="reading-actions">
                      {readingChapter !== '_streaming' && !isMobile && (
                      <button className="btn" onClick={() => { if (showRewriteInput) { setShowRewriteInput(false); setRewritePrompt(''); } else { handleLoadRewritePrompt(); } }}>
                        {showRewriteInput ? '取消重写' : '重写本章'}
                      </button>
                      )}
                      {readingChapter !== '_streaming' && !isMobile && (
                      <button className="btn btn-success" onClick={handleCopyChapter}>
                        {copied ? '已复制' : '复制本章'}
                      </button>
                      )}
                      {readingChapter !== '_streaming' && !isMobile && displayContent && (
                        <button className="btn btn-success" onClick={handleCopyFull}>
                          复制全文
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Debug template info — only shown when a custom Vault template was used */}
                  {debugPromptInfo && !debugPromptInfo.usedFallback && (
                    <div className="debug-prompt-info">
                      本次使用模板：{debugPromptInfo.templateTitle || '未知'}
                    </div>
                  )}

                  {/* Rewrite input — desktop */}
                  {!isMobile && showRewriteInput && (
                    <div className="rewrite-input-area">
                      <h3 style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>本次重写要求</h3>
                      <p style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>你可以在原续写要求基础上修改，只影响这次候选版本生成。</p>
                      <textarea
                        className="prompt-input"
                        value={rewritePrompt}
                        onChange={(e) => setRewritePrompt(e.target.value)}
                        placeholder="这次想怎么重写？"
                        rows={4}
                        style={{ marginBottom: 8 }}
                      />
                      <PromptPreviewPanel
                        taskType="novel.rewriteChapter"
                        projectDetails={projectDetails}
                        userPrompt={enhancedRewritePrompt}
                        fileName={readingChapter}
                      />
                      <button className="btn" onClick={handleRegenerate} disabled={regenerating || loading}>
                        {regenerating ? '重写中...' : '生成候选版本'}
                      </button>
                      <GenerationProgress
                        visible={genProgress.visible && genProgress.mode === 'rewrite'}
                        mode="rewrite"
                        status={genProgress.status}
                        errorMessage={genProgress.errorMessage}
                        onComplete={handleGenProgressDone}
                      />
                    </div>
                  )}

                  {readingChapterRecord?.staleAfterRewrite && !variantPreview && (
                    <div className="stale-chapter-notice">
                      <div>
                        <strong>这章生成于前文重写之前，可能与当前剧情不连续。</strong>
                        {readingChapterRecord.staleReason && <span>{readingChapterRecord.staleReason}</span>}
                      </div>
                      <div className="stale-chapter-actions">
                        <button className="btn btn-secondary" onClick={handleConfirmKeepChapter}>确认保留</button>
                        <button className="btn" onClick={() => { if (!showRewriteInput) handleLoadRewritePrompt(); }}>重写本章</button>
                      </div>
                    </div>
                  )}

                  {/* Reading settings — mobile */}
                  {isMobile && (
                    <div className="reading-settings">
                      <button className="reading-settings-toggle" onClick={() => setMobileReadingSettingsOpen(!mobileReadingSettingsOpen)}>
                        <span>阅读设置</span>
                        <span>{mobileReadingSettingsOpen ? '▲' : '▼'}</span>
                      </button>
                      {mobileReadingSettingsOpen && (
                        <div className="reading-settings-panel">
                          <div className="reading-settings-row">
                            <span className="reading-settings-label">背景</span>
                            <div className="reading-settings-chips">
                              {[
                                { v: 'default', t: '白' },
                                { v: 'warm', t: '米黄' },
                                { v: 'gray', t: '浅灰' },
                                { v: 'dark', t: '夜间' },
                              ].map(({ v, t }) => (
                                <button
                                  key={v}
                                  className={'reading-settings-chip' + (readingTheme === v ? ' active' : '')}
                                  onClick={() => setReadingTheme(v)}
                                >{t}</button>
                              ))}
                            </div>
                          </div>
                          <div className="reading-settings-row">
                            <span className="reading-settings-label">字号</span>
                            <div className="reading-settings-chips">
                              {[
                                { v: 'small', t: '小' },
                                { v: 'medium', t: '中' },
                                { v: 'large', t: '大' },
                              ].map(({ v, t }) => (
                                <button
                                  key={v}
                                  className={'reading-settings-chip' + (readingFontSize === v ? ' active' : '')}
                                  onClick={() => setReadingFontSize(v)}
                                >{t}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={`reading-content reading-theme-${readingTheme} reading-font-${readingFontSize}`}
                    ref={readingContentRef}
                    onScroll={handleReadingContentScroll}
                  >{variantPreview ? variantPreview.content : readingContent}</div>

                  {showScrollTop && (
                    <button className="scroll-to-top-btn" onClick={handleScrollToTop} title="回到开头" aria-label="回到开头">
                      &uarr;
                    </button>
                  )}

                  {/* Mobile: rewrite button after content */}
                  {readingChapter !== '_streaming' && isMobile && (
                    <div style={{ marginTop: 16 }}>
                      <button className="btn" style={{ width: '100%' }} onClick={() => { if (showRewriteInput) { setShowRewriteInput(false); setRewritePrompt(''); } else { handleLoadRewritePrompt(); } }}>
                        {showRewriteInput ? '取消重写' : '重写本章'}
                      </button>
                    </div>
                  )}

                  {/* Mobile: rewrite panel after content */}
                  {isMobile && showRewriteInput && (
                    <div className="rewrite-input-area" ref={(el) => { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                      <h3 style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>本次重写要求</h3>
                      <p style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>你可以在原续写要求基础上修改，只影响这次候选版本生成。</p>
                      <textarea
                        className="prompt-input"
                        value={rewritePrompt}
                        onChange={(e) => setRewritePrompt(e.target.value)}
                        placeholder="这次想怎么重写？"
                        rows={4}
                        style={{ marginBottom: 8 }}
                      />
                      <PromptPreviewPanel
                        taskType="novel.rewriteChapter"
                        projectDetails={projectDetails}
                        userPrompt={enhancedRewritePrompt}
                        fileName={readingChapter}
                      />
                      <button className="btn" onClick={handleRegenerate} disabled={regenerating || loading}>
                        {regenerating ? '重写中...' : '生成候选版本'}
                      </button>
                      <GenerationProgress
                        visible={genProgress.visible && genProgress.mode === 'rewrite'}
                        mode="rewrite"
                        status={genProgress.status}
                        errorMessage={genProgress.errorMessage}
                        onComplete={handleGenProgressDone}
                      />
                    </div>
                  )}

                  {/* Editor room: desktop always, mobile only in editor view */}
                  {(!isMobile || mobileView === 'editor') && (
                  <div className="editor-room">
                    <div className="editor-room-header">
                      <h3>编辑室</h3>
                      <div className="editor-room-tabs">
                        <button
                          className={'editor-room-tab' + (editorRoomTab === 'notes' ? ' active' : '')}
                          onClick={() => setEditorRoomTab('notes')}
                        >
                          编辑备注
                        </button>
                        <button
                          className={'editor-room-tab' + (editorRoomTab === 'chat' ? ' active' : '')}
                          onClick={() => setEditorRoomTab('chat')}
                        >
                          编辑对话
                        </button>
                      </div>
                    </div>

                    {editorRoomTab === 'notes' && (
                      <div className="editor-room-notes">
                        <div className="editor-room-toolbar">
                          <button className="btn btn-ai" onClick={handleEditorNote} disabled={editorNoteLoading}>
                            {editorNoteLoading ? '生成中...' : '生成本章编辑备注'}
                          </button>
                        </div>
                        {editorNoteError && <div className="error">{editorNoteError}</div>}
                        {editorNoteLoading && (
                          <div className="editor-note-loading editor-note-loading-inline">
                            <div className="editor-note-loading-spinner"></div>
                            <span>正在生成编辑备注...</span>
                          </div>
                        )}
                        {!editorNoteLoading && editorNoteResult && (
                          <div className="editor-note-draft">
                            <div className="editor-note-text">{editorNoteResult}</div>
                            <button
                              className="btn btn-secondary"
                              disabled={savingEditorNoteId === 'generated-note'}
                              onClick={() => handleSaveEditorNote(editorNoteResult, 'generated-note')}
                            >
                              {savingEditorNoteId === 'generated-note' ? '保存中...' : '保存为备注'}
                            </button>
                          </div>
                        )}
                        <div className="editor-notes-list">
                          {editorNotes.length > 0 ? (
                            editorNotes.map((note, index) => (
                              <div className="editor-note-saved" key={`${readingChapter}-note-${index}`}>
                                {note}
                              </div>
                            ))
                          ) : (
                            <p className="hint">暂无编辑备注。可以生成一条，或从编辑对话中保存编辑回复。</p>
                          )}
                        </div>
                      </div>
                    )}

                    {editorRoomTab === 'chat' && (
                      <div className="editor-room-chat">
                        <div className="editor-chat-toolbar">
                          <button className="btn btn-secondary" onClick={handleClearEditorChats} disabled={editorChatSending || editorChats.length === 0}>
                            清空对话
                          </button>
                        </div>
                        <div className="editor-chat-messages" ref={editorChatListRef}>
                          {editorChats.length > 0 ? (
                            editorChats.map((chat) => (
                              <div className={`editor-chat-row ${chat.role}`} key={chat.id}>
                                <div className="editor-chat-bubble">
                                  <div className="editor-chat-meta">
                                    {chat.role === 'user' ? '你' : '随书编辑'} · {new Date(chat.createdAt).toLocaleString()}
                                  </div>
                                  <div className="editor-chat-content">{chat.content}</div>
                                  {chat.role === 'editor' && (
                                    <button
                                      className="btn btn-secondary editor-chat-save"
                                      disabled={savingEditorNoteId === chat.id}
                                      onClick={() => handleSaveEditorNote(chat.content, chat.id)}
                                    >
                                      {savingEditorNoteId === chat.id ? '保存中...' : '保存为备注'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="hint editor-chat-empty">暂无对话</p>
                          )}
                          {editorChatSending && (
                            <div className="editor-chat-row editor">
                              <div className="editor-chat-bubble">
                                <div className="editor-note-loading editor-note-loading-inline">
                                  <div className="editor-note-loading-spinner"></div>
                                  <span>编辑正在回复...</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {editorChatError && <div className="error">{editorChatError}</div>}
                        <div className="editor-chat-mode-row">
                          <div className="editor-chat-mode-btns">
                            {[
                              { mode: 'light', label: '省 token', desc: '只读摘要，适合闲聊' },
                              { mode: 'normal', label: '标准', desc: '读取章节，适合分析' },
                              { mode: 'full', label: '全量', desc: '读取完整设定，消耗较高' },
                            ].map(({ mode, label }) => (
                              <button
                                key={mode}
                                className={`btn btn-mode${editorChatContextMode === mode ? ' active' : ''}`}
                                disabled={editorChatSending}
                                onClick={() => setEditorChatContextMode(mode)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <span className="editor-chat-mode-hint">
                            {editorChatContextMode === 'light' ? '只读摘要，适合闲聊' : editorChatContextMode === 'normal' ? '读取章节，适合分析' : '读取完整设定，消耗较高'}
                          </span>
                        </div>
                        <div className="editor-chat-input-row">
                          <div className="editor-chat-input-wrap">
                            <textarea
                              value={editorChatInput}
                              onChange={(e) => setEditorChatInput(e.target.value)}
                              onKeyDown={handleEditorChatKeyDown}
                              placeholder="和随书编辑聊聊这一章……"
                              rows={3}
                              disabled={editorChatSending}
                            />
                              </div>
                          <button className="btn" onClick={handleSendEditorChat} disabled={editorChatSending || !editorChatInput.trim()}>
                            {editorChatSending ? '发送中...' : '发送'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Chapter bottom navigation */}
                  {(() => {
                    if (!projectDetails?.chapters) return null;
                    const chapters = projectDetails.chapters;
                    const idx = chapters.findIndex((ch) => (ch.fileName || ch.filename) === readingChapter);
                    if (idx === -1) return null;
                    const prev = idx > 0 ? chapters[idx - 1] : null;
                    const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
                    const prevFn = prev ? (prev.fileName || prev.filename) : null;
                    const nextFn = next ? (next.fileName || next.filename) : null;
                    return (
                      <div className="chapter-bottom-nav">
                        <button className="btn" disabled={!prev} onClick={() => { if (prevFn) { handleReadChapter(prevFn); setMobileGenerateOpen(false); setMobileVariantsOpen(false); } }}>
                          上一章
                        </button>
                        <button className="btn btn-secondary" onClick={() => { if (isMobile) { onBackClick(); } else { window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>
                          {isMobile ? '目录' : '回目录'}
                        </button>
                        <button className="btn" disabled={!next} onClick={() => { if (nextFn) { handleReadChapter(nextFn); setMobileGenerateOpen(false); setMobileVariantsOpen(false); } }}>
                          下一章
                        </button>
                      </div>
                    );
                  })()}

                  {/* Mobile: simple edit button */}
                  {isMobile && !showMobileEdit && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        className="btn"
                        style={{ width: '100%' }}
                        onClick={() => {
                          setMobileEditTitle(readingChapterTitle);
                          setMobileEditContent(readingContent);
                          setShowMobileEdit(true);
                        }}
                      >
                        编辑本文
                      </button>
                    </div>
                  )}

                  {/* Mobile: simple edit form */}
                  {isMobile && showMobileEdit && (
                    <div className="mobile-simple-edit" style={{ marginTop: 12, padding: '12px', border: '1px solid #eee', borderRadius: 8 }}>
                      <h3 style={{ fontSize: 16, marginBottom: 12 }}>编辑本章</h3>
                      <label>标题</label>
                      <input
                        type="text"
                        value={mobileEditTitle}
                        onChange={(e) => setMobileEditTitle(e.target.value)}
                        placeholder="章节标题"
                        style={{ width: '100%', marginBottom: 12 }}
                      />
                      <label>正文</label>
                      <textarea
                        value={mobileEditContent}
                        onChange={(e) => setMobileEditContent(e.target.value)}
                        rows={20}
                        placeholder="章节正文..."
                        style={{ width: '100%', marginBottom: 12 }}
                      />
                      <div className="form-actions">
                        <button className="btn" onClick={handleMobileSaveEdit} disabled={mobileEditSaving}>
                          {mobileEditSaving ? '保存中...' : '保存'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowMobileEdit(false)}>
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Variants list */}
                  {variants.length > 0 && (
                    <>
                      {isMobile && (
                        <button
                          className="mobile-section-toggle"
                          onClick={() => setMobileVariantsOpen(!mobileVariantsOpen)}
                        >
                          候选版本（{variants.length}） {mobileVariantsOpen ? '▲' : '▼'}
                        </button>
                      )}
                      {!(isMobile && !mobileVariantsOpen) && (
                    <div className="variants-section">
                      <div className="panel-header" style={{ marginTop: 16 }}>
                        <h3>候选版本（{variants.length}）</h3>
                      </div>
                      {(() => {
                        const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
                        const activeVersionId = ch?.activeVersionId || 'v-original';
                        return variants.map((v, index) => {
                          const versionLabel = v.id === 'v-original'
                            ? '第一版 / 原始版'
                            : `第${index + 1}版 / 候选版`;
                          const promptSummary = v.userPrompt || '继续写';
                          return (
                          <div key={v.id}>
                            <div className={'variant-item' + (v.id === activeVersionId ? ' active' : '')}>
                              <div className="variant-info">
                                <span className="variant-meta">
                                  {v.id === activeVersionId && <span style={{ color: '#52c41a', fontWeight: 600, marginRight: 8 }}>● 当前主线</span>}
                                  {versionLabel} · {new Date(v.createdAt).toLocaleString()} · {v.model || '原始版'}
                                </span>
                                {v.title && v.title !== ch?.title && (
                                  <span className="variant-instruction" style={{ color: '#4a6cf7' }}>
                                    标题：{v.title.slice(0, 80)}{v.title.length > 80 ? '...' : ''}
                                  </span>
                                )}
                                <span className="variant-instruction">
                                  续写要求：{promptSummary.slice(0, 100)}{promptSummary.length > 100 ? '...' : ''}
                                </span>
                                {v._debugPromptInfo && !v._debugPromptInfo.usedFallback && (
                                  <span className="debug-prompt-info debug-prompt-info-inline">
                                    模板：{v._debugPromptInfo.templateTitle || '未知'}
                                  </span>
                                )}
                              </div>
                              <div className="variant-actions">
                                <button
                                  className={'btn' + (variantPreview?.id === v.id ? ' active' : '')}
                                  onClick={() => {
                                    handlePreviewVariant(v);
                                    if (isMobile) {
                                      setMobileVariantsOpen(false);
                                      requestAnimationFrame(() => {
                                        readingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      });
                                    }
                                  }}
                                >
                                  {variantPreview?.id === v.id ? '关闭正文' : '查看正文'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  disabled={applyingVariant || v.id === activeVersionId}
                                  onClick={() => handleApplyVariant(v.id)}
                                >
                                  {v.id === activeVersionId ? '当前主线' : (applyingVariant ? '应用中...' : '沿此版本继续')}
                                </button>
                              </div>
                            </div>
                          </div>
                          );
                        });
                      })()}
                    </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="hint">请先从左侧选择一个项目，或创建一个新项目。</p>
          )}
            </>
          )}
          </>
          )}
          </div>
          )}

        {/* ===== Mobile: Shelf View ===== */}
        {isMobile && mobileView === 'shelf' && (
          <div className="panel mobile-shelf-view">
            {showCreateForm ? (
              <div className="create-panel">
                <h2>创建新项目</h2>
                <label>项目名</label>
                <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="输入项目名称" />
                <label>世界观设定</label>
                <textarea value={newWorld} onChange={(e) => setNewWorld(e.target.value)} placeholder="描述世界观设定..." rows={4} />
                <label>人物设定</label>
                <textarea value={newCharacters} onChange={(e) => setNewCharacters(e.target.value)} placeholder="描述主要人物..." rows={4} />
                <label>写作规则 / 风格要求</label>
                <textarea value={newStyle} onChange={(e) => setNewStyle(e.target.value)} placeholder="文风要求、篇幅要求、写作规则…" rows={4} />
                <label>剧情摘要（可选）</label>
                <textarea value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="剧情摘要…" rows={3} />
                {createError && <div className="error">{createError}</div>}
                <div className="form-actions">
                  <button className="btn" disabled={creating} onClick={handleCreateProject}>{creating ? '创建中...' : '创建'}</button>
                  <button className="btn btn-secondary" disabled={creating} onClick={() => { setShowCreateForm(false); setCreateError(''); setNewProjectName(''); setNewWorld(''); setNewCharacters(''); setNewStyle(''); setNewSummary(''); }}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="shelf-title">我的书架</h2>
                <p className="shelf-subtitle">选择一个故事继续写</p>
                <div className="bookshelf-grid">
                  {projects.length === 0 && (
                    <p className="hint" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>还没有项目，创建一个吧</p>
                  )}
                  {projects.map((name) => {
                    const count = projectChapterCounts[name];
                    const menuOpen = mobileShelfMenu === name;
                    return (
                    <div key={name} className="book-item" onClick={() => { setMobileShelfMenu(null); handleSelectProject(name); }}>
                      <div className={'book-cover' + (currentProject === name ? ' current' : '')}>
                        <span className="book-cover-char">{name.charAt(0)}</span>
                        <button
                          className="book-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMobileShelfMenu(menuOpen ? null : name);
                          }}
                        >⋯</button>
                        {menuOpen && (
                          <div className="book-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                            <button className="book-menu-delete" onClick={() => handleShelfDeleteProject(name)}>删除</button>
                          </div>
                        )}
                      </div>
                      <div className="book-title">{name}</div>
                      <div className="book-meta">{count != null ? `${count} 章` : ''}</div>
                    </div>
                    );
                  })}
                </div>
                <button className="btn-create-project" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>
                  + 创建新项目
                </button>
              </>
            )}
          </div>
        )}

        {/* ===== Mobile: Project View (chapter list) ===== */}
        {isMobile && mobileView === 'project' && currentProject && (
          <div className="panel mobile-project-view">
            <button className="mobile-back-btn" onClick={onBackClick}>
              ← 返回书架
            </button>
            <h2 className="mobile-project-title">{currentProject}</h2>
            <div className="mobile-project-tools">
              <button className="btn" onClick={handleExport} disabled={exportStatus === 'exporting'}>
                {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
              </button>
              <button className="btn btn-secondary" onClick={handleBackup}>导出备份</button>
              <button className="btn btn-secondary" onClick={handleOpenSettings}>编辑设定</button>
              <button className="btn btn-secondary" onClick={handleRefresh}>刷新</button>
            </div>

            {/* Settings Editor — mobile project view */}
            {showSettings && (
              <div className="settings-panel">
                <h3>项目设定</h3>
                <label>世界观设定</label>
                <textarea className="settings-input" value={editWorld} onChange={(e) => setEditWorld(e.target.value)} rows={3} placeholder="世界观设定..." />
                <label>人物设定</label>
                <textarea className="settings-input" value={editCharacters} onChange={(e) => setEditCharacters(e.target.value)} rows={3} placeholder="人物设定..." />
                <label>写作规则</label>
                <textarea className="settings-input" value={editStyle} onChange={(e) => setEditStyle(e.target.value)} rows={5} placeholder="写作规则、文风要求..." />
                <label>剧情摘要</label>
                <textarea className="settings-input" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={5} placeholder="剧情摘要..." />
                <label>项目编辑记忆</label>
                <div className="settings-hint">记录跨章节人物关系、伏笔、长期写作风险和编辑判断。不同于剧情摘要：摘要记录剧情事实，这里记录编辑分析。</div>
                <textarea className="settings-input" value={editEditorialMemory} onChange={(e) => setEditEditorialMemory(e.target.value)} rows={6} placeholder="项目编辑记忆..." />
                <div className="form-actions">
                  <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>{savingSettings ? '保存中...' : '保存设定'}</button>
                  <button className="btn btn-secondary" disabled={savingSettings} onClick={() => setShowSettings(false)}>关闭</button>
                </div>
              </div>
            )}

            {/* Outline Editor — mobile */}
            {showOutline && (
              <div className="settings-panel">
                <h3>章节规划</h3>
                <p className="hint" style={{ marginBottom: 8, fontSize: 12 }}>
                  JSON 数组，每项：number、goal、keyEvents、characterChanges、status。
                </p>
                <textarea
                  className="settings-input"
                  value={outlineText}
                  onChange={(e) => { setOutlineText(e.target.value); setOutlineError(''); }}
                  rows={10}
                  placeholder={`[\n  {\n    "number": 1,\n    "goal": "本章目标",\n    "keyEvents": ["事件1"],\n    "characterChanges": "人物变化",\n    "status": "planned"\n  }\n]`}
                />
                {outlineError && (
                  <div className={outlineError === '已保存' ? '' : 'error'} style={outlineError === '已保存' ? { color: '#52c41a', marginTop: 4, fontSize: 13 } : { marginTop: 4 }}>
                    {outlineError}
                  </div>
                )}
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={handleSaveOutline} disabled={outlineSaving}>
                    {outlineSaving ? '保存中...' : '保存规划'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setShowOutline(false); setOutlineError(''); }}>
                    关闭
                  </button>
                </div>
              </div>
            )}

            {!showSettings && (projectDetails?.chapters && projectDetails.chapters.length > 0 ? (
              <ul className="mobile-chapter-list">
                {projectDetails.chapters.map((ch, index) => {
                  const cf = ch.fileName || ch.filename;
                  const key = cf || `chapter-${index}`;
                  const menuOpen = mobileChapterMenu === cf;
                  return (
                    <li
                      key={key}
                      className={'mobile-chapter-item' + (cf && readingChapter === cf ? ' active' : '') + (!cf ? ' disabled' : '')}
                      onClick={() => {
                        if (cf && !menuOpen) {
                          handleReadChapter(cf);
                          navigateTo('chapter');
                          setMobileGenerateOpen(false);
                          setMobileVariantsOpen(false);
                        }
                      }}
                    >
                      <span className="mobile-chapter-index">{cf ? cf.slice(0, 3) : '--'}</span>
                      <span className="mobile-chapter-title">{cf ? (ch.title || cf.replace(/\.txt$/, '')) : '无效章节'}</span>
                      {ch.staleAfterRewrite && <span className="chapter-stale-badge">待检查</span>}
                      {cf && (
                        <>
                          <button
                            className="mobile-chapter-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileChapterMenu(menuOpen ? null : cf);
                            }}
                          >⋯</button>
                          {menuOpen && (
                            <div className="mobile-chapter-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="mobile-chapter-menu-delete"
                                onClick={() => handleMobileDeleteChapter(cf)}
                              >删除章节</button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mobile-chapter-empty">
                <p className="hint">暂无章节</p>
                <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { navigateTo('chapter'); setMobileGenerateOpen(true); }}>
                  开始写第一章
                </button>
              </div>
            ))}
          </div>
        )}

        </div>

      {notification && (
        <div className="notification-card">
          <div className="notification-header">
            <span className="notification-title">{notification.title}</span>
            <button className="notification-close" onClick={() => setNotification(null)}>×</button>
          </div>
          <div className="notification-body">{notification.message}</div>
        </div>
      )}
    </div>
  );
}

export default App;
