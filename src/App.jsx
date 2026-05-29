import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import VaultPanel from './components/VaultPanel';
import PromptPreviewPanel from './components/PromptPreviewPanel';
import WritingControlPanel from './components/WritingControlPanel';
import GenerationProgress from './components/GenerationProgress';
import { apiFetch, safeJsonFetch, setOnAuthExpired } from './api';

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
  const [readingTheme, setReadingTheme] = useState(() => {
    const saved = localStorage.getItem('readingTheme');
    if (saved === 'default' || saved === 'dark') return 'ink';
    if (saved === 'warm') return 'night';
    if (saved === 'gray') return 'paper';
    return saved || 'ink';
  });
  const [readingFontSize, setReadingFontSize] = useState(() => localStorage.getItem('readingFontSize') || 'medium');
  const [mobileReadingSettingsOpen, setMobileReadingSettingsOpen] = useState(false);

  useEffect(() => { localStorage.setItem('readingTheme', readingTheme); }, [readingTheme]);
  useEffect(() => { localStorage.setItem('readingFontSize', readingFontSize); }, [readingFontSize]);

  // Project sort
  const [projectSort, setProjectSort] = useState(() => {
    try {
      const saved = localStorage.getItem('xiaomoxia_project_sort');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { field: 'updatedAt', order: 'desc' };
  });
  useEffect(() => {
    localStorage.setItem('xiaomoxia_project_sort', JSON.stringify(projectSort));
  }, [projectSort]);

  // Sidebar layout
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isChaptersCollapsed, setIsChaptersCollapsed] = useState(false);

  // Mobile view routing: 'shelf' | 'project' | 'chapter' | 'editor' | 'writing'
  const [mobileView, setMobileView] = useState('shelf');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [mobileGenerateOpen, setMobileGenerateOpen] = useState(false);
  const [mobileVariantsOpen, setMobileVariantsOpen] = useState(false);
  const [mobileShelfMenu, setMobileShelfMenu] = useState(null);
  const [mobileChapterMenu, setMobileChapterMenu] = useState(null);
  const [mobileMaterialsOpen, setMobileMaterialsOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileSearchIndex, setMobileSearchIndex] = useState([]);
  const [mobileSearchLoading, setMobileSearchLoading] = useState(false);
  const [lastProjectName, setLastProjectName] = useState(() => localStorage.getItem('xiaomoxia-last-project') || '');
  const [mobileWritingTarget, setMobileWritingTarget] = useState(null);
  const [mobileWritingPrompt, setMobileWritingPrompt] = useState('');
  const [mobileWritingKind, setMobileWritingKind] = useState('generate');
  const [mobileWritingOutput, setMobileWritingOutput] = useState('');
  const [mobileWritingError, setMobileWritingError] = useState('');
  const [allProjectDetails, setAllProjectDetails] = useState({});
  const mobileWorldRef = useRef(null);
  const mobileCharactersRef = useRef(null);
  const mobileSummaryRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

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

  // Desktop workbench state
  const [desktopView, setDesktopView] = useState('workbench');
  const [desktopChapterQuery, setDesktopChapterQuery] = useState('');
  const [desktopAiMode, setDesktopAiMode] = useState('continue');
  const [desktopWritingMode, setDesktopWritingMode] = useState('writing');
  const [desktopEditorContent, setDesktopEditorContent] = useState('');
  const [desktopSavingContent, setDesktopSavingContent] = useState(false);

  // Auth
  const [authenticated, setAuthenticated] = useState(null); // null=checking, true/false=done
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    safeJsonFetch('/api/auth/me')
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));

    // Register global 401 handler — when API calls detect auth expiry,
    // reset to login page
    setOnAuthExpired(() => {
      setAuthenticated(false);
      setLoginPin('');
      setLoginError('登录已过期，请重新输入 PIN');
    });
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    setDesktopEditorContent(variantPreview ? variantPreview.content : readingContent || '');
  }, [readingContent, variantPreview]);

  const rememberLastProject = useCallback((projectName) => {
    if (!projectName) return;
    localStorage.setItem('xiaomoxia-last-project', projectName);
    setLastProjectName(projectName);
  }, []);

  // Auth handlers
  const handleLogin = useCallback(async () => {
    if (loginPin.length !== 4) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      await safeJsonFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: loginPin }),
      });
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err.message || '密码错误');
    } finally {
      setLoginLoading(false);
    }
  }, [loginPin]);

  const handleLogout = useCallback(async () => {
    try {
      await safeJsonFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    setAuthenticated(false);
    setLoginPin('');
  }, []);

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
    if (showMobileSearch) {
      setShowMobileSearch(false);
      setMobileSearchQuery('');
      return 'overlay';
    }
    if (mobileMaterialsOpen) {
      setMobileMaterialsOpen(false);
      return 'overlay';
    }
    if (editingTitle) {
      setEditingTitle(false);
      return 'overlay';
    }

    // 2) View hierarchy: editor → chapter → project → shelf
    if (mobileView === 'allProjects') {
      setMobileView('shelf');
      return 'view';
    }
    if (mobileView === 'outline') {
      setMobileView('project');
      return 'view';
    }
    if (mobileView === 'writing') {
      setMobileView(readingChapter && readingChapter !== '_streaming' ? 'chapter' : 'project');
      return 'view';
    }
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
      setMobileMaterialsOpen(false);
      setMobileView('shelf');
      setMobileWritingTarget(null);
      setMobileWritingOutput('');
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
      setError(''); // clear any previous error on success
    } catch (err) {
      // 401 is handled globally by api.js (clears auth state)
      // Only show local error for non-auth failures
      if (!err.message.includes('登录已过期')) {
        const msg = '获取项目列表失败，请检查网络连接';
        setError(msg);
        setNotification({ title: '加载失败', message: msg });
      }
    }
  };

  useEffect(() => {
    if (authenticated === true) {
      fetchProjects();
    } else {
      setProjects([]);
    }
  }, [authenticated]);

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
    rememberLastProject(name);
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
    setMobileMaterialsOpen(false);
    setMobileWritingTarget(null);
    setMobileWritingOutput('');
    setMobileWritingError('');
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
      return data;
    } catch (err) {
      setError(err.message);
      setProjectDetails(null);
      setDisplayContent('');
      return null;
    }
  };

  // Desktop: auto-select most recent project when projects load and none is selected
  const autoSelectRef = useRef(false);
  useEffect(() => {
    if (isMobile) return;
    if (autoSelectRef.current) return;
    if (projects.length > 0 && currentProject) {
      autoSelectRef.current = true;
      return;
    }
    if (projects.length > 0 && !currentProject) {
      autoSelectRef.current = true;
      const sorted = [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const name = lastProjectName && sorted.some((p) => p.name === lastProjectName) ? lastProjectName : sorted[0].name;
      handleSelectProject(name);
      setNotification({ title: '已打开', message: `自动选中项目 ${name}` });
    }
  }, [projects, currentProject, isMobile, lastProjectName]);

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
      rememberLastProject(name);
      await handleSelectProject(name);
      setDesktopView('workbench');
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
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setLoading(true);
    setMobileWritingError('');
    setMobileWritingOutput('');
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
          setMobileWritingOutput(streamedContent);
        }
      }

      if (!fileName) throw new Error('流式生成未完成');
    } catch (streamErr) {
      console.warn('流式生成失败，回退到普通生成:', streamErr);
      setReadingChapter(null);
      setReadingChapterTitle('');
      setReadingContent('');
      setMobileWritingOutput('');
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
        setMobileWritingError(isNetworkOrTimeout ? '网络异常或请求超时' : err.message);
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
    setMobileWritingOutput(content || '');
    setUserPrompt('');
    setDebugPromptInfo(debugInfo || null);
    resetEditorRoom();
    // 从临时章节转为正式章节
    setReadingChapter(fileName);
    setReadingChapterTitle(title || '');
    setReadingContent(content);
    rememberLastProject(currentProject);

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
  const handleReadChapter = async (filename, projectName = currentProject) => {
    if (!projectName) return null;
    rememberLastProject(projectName);
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
      const url = `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(filename)}`;
      const data = await safeJsonFetch(url);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingChapterTitle(data.title || '');
      setReadingContent(data.content === '' ? '章节为空' : data.content);
      setMobileWritingOutput('');
      setEditorNotes(Array.isArray(data.editorNotes) ? data.editorNotes : []);
      setEditorChats(Array.isArray(data.editorChats) ? data.editorChats : []);
      // Desktop: immediately switch to workbench/writing view
      if (!isMobile) {
        setDesktopView('workbench');
        setDesktopWritingMode('writing');
        setShowSettings(false);
        setShowOutline(false);
      }
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
      handleLoadVariants(data.fileName, projectName);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
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
  const openSettingsEditor = (details = projectDetails, projectName = currentProject, focusTarget = '') => {
    if (!details || !projectName) return;
    setEditWorld(details.world || '');
    setEditCharacters(details.characters || '');
    setEditStyle(details.style || '');
    setEditSummary(details.summary || '');
    setEditEditorialMemory(details.editorialMemory || '');
    setEditingProjectName(projectName);
    setShowSettings(true);
    setShowOutline(false);
    setMobileMaterialsOpen(false);
    setError('');
    if (focusTarget === 'world' || focusTarget === 'characters' || focusTarget === 'summary') {
      requestAnimationFrame(() => {
        const target = focusTarget === 'world'
          ? mobileWorldRef.current
          : focusTarget === 'characters'
            ? mobileCharactersRef.current
            : mobileSummaryRef.current;
        target?.focus();
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };

  const handleOpenSettings = () => {
    openSettingsEditor(projectDetails, currentProject);
  };

  // ---- Save settings ----
  const handleSaveSettings = async () => {
    if (editingProjectName !== currentProject) {
      setError('当前项目已切换，请重新打开编辑设定后再保存。');
      setShowSettings(false);
      return;
    }

    setError('');
    rememberLastProject(currentProject);
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
  const handleLoadOutline = async (projectName = currentProject) => {
    if (!projectName) return;
    setOutlineError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/outline`);
      const list = Array.isArray(data.outline) ? data.outline : [];
      setOutline(list);
      setOutlineText(JSON.stringify(list, null, 2));
    } catch (err) {
      setOutlineError(err.message);
    }
  };

  const handleSaveOutline = async () => {
    if (!currentProject) return;
    rememberLastProject(currentProject);
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
    rememberLastProject(currentProject);
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
    rememberLastProject(currentProject);
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
  const handleLoadVariants = async (filename, projectName = currentProject) => {
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(filename)}/variants`);
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
              setMobileWritingOutput(streamedContent);
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
      setMobileWritingOutput(doneVariant.content || streamedContent);
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
      setMobileWritingError(err.message);
      setGenProgress({ visible: true, mode: 'rewrite', status: 'error', errorMessage: err.message });
      setNotification({ title: '生成失败', message: err.message });
    } finally {
      setRegenerating(false);
    }
  };

  const handleMobileSaveEdit = async () => {
    if (!currentProject || !readingChapter || mobileEditSaving) return;
    rememberLastProject(currentProject);
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

  // Sorted projects list with fallback for legacy string-format items
  const sortedProjects = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const { field, order } = projectSort;

    // Normalize: support both string items and object items
    const normalized = list.map((p) => {
      if (typeof p === 'string') return { name: p, size: 0, updatedAt: 0 };
      return {
        name: p.name ?? '',
        size: p.size ?? 0,
        updatedAt: p.updatedAt ?? 0,
        chapterCount: p.chapterCount ?? 0,
      };
    });

    const sorted = [...normalized].sort((a, b) => {
      let cmp;
      if (field === 'name') {
        cmp = a.name.localeCompare(b.name, 'zh-CN');
      } else if (field === 'size') {
        cmp = a.size - b.size;
      } else {
        cmp = a.updatedAt - b.updatedAt;
      }
      return order === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [projects, projectSort]);

  const formatProjectUpdatedAt = (timestamp) => {
    if (!timestamp) return '更新于 暂无记录';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '更新于 暂无记录';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((startOfToday - startOfTarget) / 86400000);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    if (dayDiff === 0) return `更新于 今天 ${time}`;
    if (dayDiff === 1) return `更新于 昨天 ${time}`;
    if (date.getFullYear() === now.getFullYear()) {
      return `更新于 ${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
    }
    return `更新于 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const getProjectChapterCount = (project) => {
    if (!project?.name) return 0;
    return projectChapterCounts[project.name] ?? project.chapterCount ?? 0;
  };

  const sortedProjectsByRecent = useMemo(() => {
    const last = lastProjectName && sortedProjects.some((p) => p.name === lastProjectName) ? lastProjectName : '';
    const list = [...sortedProjects];
    if (!last) return list;
    return list.sort((a, b) => {
      if (a.name === last) return -1;
      if (b.name === last) return 1;
      return 0;
    });
  }, [sortedProjects, lastProjectName]);

  const recentHomeProjects = sortedProjectsByRecent.slice(0, 3);
  const hasHomeProjects = recentHomeProjects.length > 0;
  const mobileCurrentProject = hasHomeProjects
    ? (sortedProjectsByRecent.find((p) => p.name === lastProjectName) || sortedProjectsByRecent[0])
    : null;
  const featuredProject = mobileCurrentProject || { name: '合欢宗', updatedAt: 0, chapterCount: 18 };
  const featuredChapterCount = hasHomeProjects ? getProjectChapterCount(featuredProject) : 18;
  const featuredChapterLabel = featuredChapterCount > 0 ? `第 ${featuredChapterCount} 章` : '尚未开始';
  const featuredUpdatedLabel = hasHomeProjects ? formatProjectUpdatedAt(featuredProject.updatedAt) : '更新于 今天 08:36';
  const fallbackRecentProjects = [
    { name: '合欢宗重制版', meta: '更新于 今天 08:36 ｜ 第 36 章' },
    { name: '把日子写成小说', meta: '更新于 昨天 22:10 ｜ 第 12 章' },
    { name: '测试', meta: '更新于 5月12日 14:20 ｜ 第 3 章' },
  ];

  const getLatestChapterFile = (details) => {
    const chapters = Array.isArray(details?.chapters) ? details.chapters : [];
    const latest = [...chapters].reverse().find((ch) => ch.fileName || ch.filename);
    return latest ? (latest.fileName || latest.filename) : '';
  };

  const getProjectIntro = (details) => {
    const text = details?.summary || details?.world || details?.style || details?.editorialMemory || '';
    return text ? text.replace(/\s+/g, ' ').trim().slice(0, 48) : '暂无简介';
  };

  const formatOutlinePlan = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map((item, index) => ({
      number: item.number || index + 1,
      title: item.title || item.goal || `第 ${item.number || index + 1} 章`,
      detail: [
        Array.isArray(item.keyEvents) ? item.keyEvents.join('、') : item.keyEvents,
        item.characterChanges,
        item.status,
      ].filter(Boolean).join(' · '),
    }));
  };

  const ensureProjectDetailsCached = async (projectName) => {
    if (!projectName) return null;
    if (currentProject === projectName && projectDetails) return projectDetails;
    if (allProjectDetails[projectName]) return allProjectDetails[projectName];
    try {
      const details = await safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}`);
      if (details.chapters) details.chapters = normalizeChapters(details.chapters);
      setAllProjectDetails((prev) => ({ ...prev, [projectName]: details }));
      return details;
    } catch {
      return null;
    }
  };

  const ensureMobileProjectLoaded = async (projectName) => {
    if (!projectName) return null;
    if (currentProject === projectName && projectDetails) return projectDetails;
    return await handleSelectProject(projectName);
  };

  // Resolve a usable project name from best available source
  const resolveProjectName = (preferredName) => {
    if (preferredName && sortedProjectsByRecent.some((p) => p.name === preferredName)) return preferredName;
    if (currentProject && sortedProjectsByRecent.some((p) => p.name === currentProject)) return currentProject;
    if (sortedProjectsByRecent.length > 0) return sortedProjectsByRecent[0].name;
    if (projects.length > 0) return (typeof projects[0] === 'string' ? projects[0] : projects[0].name);
    return null;
  };

  // Ensure a project is loaded (currentProject + projectDetails) before proceeding.
  // Returns true if ready, false if no project available.
  const ensureMobileProjectReady = async (preferredName) => {
    const name = resolveProjectName(preferredName);
    if (!name) {
      setNotification({ title: '暂无项目', message: '请先创建或选择一个项目' });
      return false;
    }
    if (currentProject === name && projectDetails) return true;
    setNotification({ title: '正在打开', message: `加载项目 ${name}…` });
    const details = await handleSelectProject(name);
    if (!details) {
      setNotification({ title: '打开失败', message: '项目加载失败，请重试' });
      return false;
    }
    return true;
  };

  const handleHomeProjectOpen = async (projectName) => {
    if (!projectName) return;
    setMobileShelfMenu(null);
    setNotification({ title: '正在打开', message: `加载项目 ${projectName}…` });
    await handleSelectProject(projectName);
  };

  const handleHomeOutlineOpen = async (projectName) => {
    await handleMobileQuickAction('outline', projectName);
  };

  const handleOpenMobileOutline = async (projectName) => {
    const name = resolveProjectName(projectName);
    if (!name) {
      setNotification({ title: '暂无项目', message: '请先创建或选择一个项目' });
      return;
    }
    const ready = await ensureMobileProjectReady(name);
    if (!ready) return;
    await handleLoadOutline(name);
    setShowSettings(false);
    setShowOutline(false);
    setMobileMaterialsOpen(false);
    rememberLastProject(name);
    navigateTo('outline');
  };

  const handleOpenAllProjects = async () => {
    if (sortedProjects.length === 0) {
      setNotification({ title: '暂无项目', message: '还没有项目，先创建一个吧' });
      return;
    }
    setNotification({ title: '加载中', message: '正在加载所有项目…' });
    const entries = await Promise.all(sortedProjects.map(async (project) => {
      const details = await ensureProjectDetailsCached(project.name);
      return [project.name, details];
    }));
    setAllProjectDetails((prev) => {
      const next = { ...prev };
      entries.forEach(([name, details]) => {
        if (name && details) next[name] = details;
      });
      return next;
    });
    navigateTo('allProjects');
  };

  const handleMobileQuickAction = async (type, projectName) => {
    const name = resolveProjectName(projectName);
    if (!name) {
      setNotification({ title: '暂无项目', message: '请先创建或选择一个项目' });
      return;
    }

    if (type === 'materials') {
      setNotification({ title: '功能开发中', message: '当前版本暂未接入素材库。' });
      return;
    }

    const ready = await ensureMobileProjectReady(name);
    if (!ready) return;

    const details = projectDetails;

    if (type === 'world') {
      openSettingsEditor(details, name, 'world');
      navigateTo('project');
      return;
    }

    if (type === 'characters') {
      openSettingsEditor(details, name, 'characters');
      navigateTo('project');
      return;
    }

    if (type === 'outline') {
      await handleOpenMobileOutline(name);
      return;
    }

    if (type === 'writing' || type === 'continue') {
      await handleOpenMobileWriting(name, { kind: 'generate' });
    }
  };

  const handleOpenMobileWriting = async (projectName, options = {}) => {
    const name = resolveProjectName(projectName);
    if (!name) {
      setNotification({ title: '暂无项目', message: '请先创建或选择一个项目' });
      return;
    }
    const details = options.details || await ensureMobileProjectLoaded(name);
    if (!details) {
      setNotification({ title: '加载失败', message: '无法加载项目数据，请重试' });
      return;
    }
    rememberLastProject(name);
    setShowSettings(false);
    setShowOutline(false);
    setMobileMaterialsOpen(false);
    setMobileGenerateOpen(false);
    setMobileVariantsOpen(false);
    setShowRewriteInput(false);
    setMobileWritingError('');
    setMobileWritingOutput('');

    const chapters = Array.isArray(details.chapters) ? details.chapters : [];
    const latestFile = options.fileName || getLatestChapterFile(details);
    const latestChapter = chapters.find((ch) => (ch.fileName || ch.filename) === latestFile);
    const nextNumber = latestFile
      ? String(parseInt(latestFile, 10) + 1).padStart(3, '0')
      : '001';
    const kind = options.kind || 'generate';
    setMobileWritingKind(kind);
    setMobileWritingTarget({
      projectName: name,
      fileName: latestFile,
      chapterTitle: latestChapter?.title || latestFile || '',
      nextLabel: kind === 'rewrite' ? '重写当前章节' : `生成第 ${nextNumber} 章`,
    });

    if (kind === 'rewrite') {
      if (latestFile && readingChapter !== latestFile) {
        await handleReadChapter(latestFile, name);
      }
      const saved = latestChapter?.userPrompt || '保留主线，重写这一章';
      setRewritePrompt(saved);
      setMobileWritingPrompt(saved);
    } else {
      const initialPrompt = options.prompt || userPrompt || '继续写';
      setUserPrompt(initialPrompt);
      setMobileWritingPrompt(initialPrompt);
    }

    navigateTo('writing');
  };

  const handleMobileWritingPromptChange = (value) => {
    setMobileWritingPrompt(value);
    if (mobileWritingKind === 'rewrite') {
      setRewritePrompt(value);
    } else {
      setUserPrompt(value);
    }
  };

  const handleMobileWritingGenerate = async () => {
    setMobileWritingError('');
    if (mobileWritingKind === 'rewrite') {
      if (!readingChapter || readingChapter === '_streaming') {
        setMobileWritingError('请先选择要重写的章节');
        return;
      }
      setRewritePrompt(mobileWritingPrompt);
      await handleRegenerate();
      return;
    }
    setUserPrompt(mobileWritingPrompt);
    await handleGenerate();
  };

  const buildMobileSearchIndex = async () => {
    const index = [];
    const list = sortedProjectsByRecent.length ? sortedProjectsByRecent : sortedProjects;
    for (const project of list) {
      if (!project.name) continue;
      try {
        const details = currentProject === project.name && projectDetails
          ? projectDetails
          : await safeJsonFetch(`/api/projects/${encodeURIComponent(project.name)}`);
        const chapters = normalizeChapters(details.chapters || []);
        index.push({
          type: 'project',
          projectName: project.name,
          title: project.name,
          subtitle: `${getProjectChapterCount(project)} 章 · ${formatProjectUpdatedAt(project.updatedAt)}`,
          text: project.name,
        });
        chapters.forEach((chapter) => {
          const fileName = chapter.fileName || chapter.filename;
          index.push({
            type: 'chapter',
            projectName: project.name,
            fileName,
            title: chapter.title || fileName || '未命名章节',
            subtitle: `${project.name} · ${fileName || ''}`,
            text: `${project.name} ${chapter.title || ''} ${fileName || ''} ${chapter.userPrompt || ''}`,
          });
        });
        [
          ['world', '世界观设定', details.world],
          ['characters', '人物设定', details.characters],
          ['style', '写作规则', details.style],
          ['summary', '剧情摘要', details.summary],
          ['editorialMemory', '编辑记忆', details.editorialMemory],
        ].forEach(([field, label, value]) => {
          if (!value) return;
          index.push({
            type: 'setting',
            field,
            projectName: project.name,
            title: label,
            subtitle: project.name,
            text: `${project.name} ${label} ${value}`,
            snippet: String(value).slice(0, 80),
          });
        });
      } catch {
        index.push({
          type: 'project',
          projectName: project.name,
          title: project.name,
          subtitle: '项目详情暂时不可用',
          text: project.name,
        });
      }
    }
    return index;
  };

  const openMobileSearch = async () => {
    setShowMobileSearch(true);
    setMobileSearchQuery('');
    requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
    if (mobileSearchLoading) return;
    setMobileSearchLoading(true);
    try {
      const index = await buildMobileSearchIndex();
      setMobileSearchIndex(index);
    } finally {
      setMobileSearchLoading(false);
      requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
    }
  };

  const closeMobileSearch = () => {
    setShowMobileSearch(false);
    setMobileSearchQuery('');
  };

  const mobileSearchResults = useMemo(() => {
    const q = mobileSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return mobileSearchIndex
      .filter((item) => item.text.toLowerCase().includes(q))
      .slice(0, 30);
  }, [mobileSearchIndex, mobileSearchQuery]);

  const handleMobileSearchResultClick = async (result) => {
    if (!result?.projectName) return;
    closeMobileSearch();
    const details = await ensureMobileProjectLoaded(result.projectName);
    if (!details) return;
    if (result.type === 'chapter' && result.fileName) {
      await handleReadChapter(result.fileName, result.projectName);
      navigateTo('chapter');
      return;
    }
    if (result.type === 'setting') {
      const focusTarget = result.field === 'characters'
        ? 'characters'
        : result.field === 'summary'
          ? 'summary'
          : 'world';
      openSettingsEditor(details, result.projectName, focusTarget);
      navigateTo('project');
      return;
    }
    navigateTo('project');
  };

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

  const notifyDevFeature = useCallback((name = '该功能') => {
    setNotification({ title: '功能开发中', message: `功能开发中：当前版本暂未接入此功能。${name ? `（${name}）` : ''}` });
  }, []);

  const handleDesktopNav = async (label) => {
    if (label === '工作台' || label === '章节') {
      setDesktopView('workbench');
      setShowSettings(false);
      setShowOutline(false);
      return;
    }
    if (label === '项目库') {
      setDesktopView('projects');
      setShowSettings(false);
      setShowOutline(false);
      return;
    }
    if (label === '世界观' || label === '人物' || label === '设置') {
      if (!currentProject) {
        setNotification({ title: '请先选择项目', message: '需要打开一个项目后才能编辑设定。' });
        return;
      }
      setDesktopView(label === '世界观' ? 'world' : label === '人物' ? 'characters' : 'settings');
      openSettingsEditor(projectDetails, currentProject, label === '世界观' ? 'world' : label === '人物' ? 'characters' : '');
      setShowOutline(false);
      return;
    }
    if (label === '大纲') {
      if (!currentProject) {
        setNotification({ title: '请先选择项目', message: '需要打开一个项目后才能编辑大纲。' });
        return;
      }
      setDesktopView('outline');
      setShowSettings(false);
      setShowOutline(true);
      await handleLoadOutline();
      return;
    }
    notifyDevFeature(label);
  };

  const handleDesktopSaveContent = async () => {
    if (!currentProject || !readingChapter || readingChapter === '_streaming') {
      setNotification({ title: '无法保存', message: '请先打开一个可编辑章节。' });
      return;
    }
    setDesktopSavingContent(true);
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: readingChapterTitle, content: desktopEditorContent }),
      });
      setReadingContent(desktopEditorContent);
      setNotification({ title: '已保存', message: '当前章节正文已保存。' });
    } catch (err) {
      setError(err.message);
    } finally {
      setDesktopSavingContent(false);
    }
  };

  const ensureDesktopSelectionForRewrite = (modeLabel) => {
    const editor = readingContentRef.current;
    const textareaSelection = editor && typeof editor.selectionStart === 'number'
      ? desktopEditorContent.slice(editor.selectionStart, editor.selectionEnd).trim()
      : '';
    const selected = textareaSelection || (typeof window !== 'undefined' ? String(window.getSelection?.() || '').trim() : '');
    if (!selected && ['rewrite', 'polish', 'expand'].includes(desktopAiMode)) {
      setNotification({ title: `请先选中文本`, message: `请先选中要${modeLabel}的段落。当前后端只支持整章候选生成，局部处理会作为后续能力接入。` });
      return false;
    }
    return true;
  };

  const prepareDesktopMode = (mode) => {
    setDesktopAiMode(mode);
    if (mode === 'continue') {
      setShowRewriteInput(false);
      return;
    }
    if (!readingChapter || readingChapter === '_streaming') {
      setNotification({ title: '请先打开章节', message: '改写、润色和扩写需要先选择一个已有章节。' });
      return;
    }
    handleLoadRewritePrompt();
    const prompts = {
      rewrite: '改写选中段落，保持剧情事实不变，优化动作与情绪递进。',
      polish: '润色选中段落，保留原剧情，提升语言质感和节奏。',
      expand: '扩写选中段落，增加细节、动作和心理描写。',
    };
    setRewritePrompt((prev) => prev || prompts[mode] || '继续写');
  };

  const handleDesktopGenerateByMode = async () => {
    if (desktopAiMode === 'continue') {
      await handleGenerate();
      return;
    }
    const label = desktopAiMode === 'polish' ? '润色' : desktopAiMode === 'expand' ? '扩写' : '改写';
    if (!ensureDesktopSelectionForRewrite(label)) return;
    await handleRegenerate();
  };

  const handleDesktopApplyVariant = async (variantId = variantPreview?.id) => {
    if (!variantId) {
      setNotification({ title: '请先生成候选', message: '请先生成并选择一个候选版本。' });
      return;
    }
    await handleApplyVariant(variantId);
  };

  const desktopChapters = normalizeChapters(projectDetails?.chapters || []);
  const filteredDesktopChapters = desktopChapterQuery.trim()
    ? desktopChapters.filter((ch) => {
      const q = desktopChapterQuery.trim().toLowerCase();
      return `${ch.title || ''} ${ch.fileName || ch.filename || ''} ${ch.summary || ''} ${ch.userPrompt || ''}`.toLowerCase().includes(q);
    })
    : desktopChapters;
  const desktopCurrentChapter = desktopChapters.find((ch) => (ch.fileName || ch.filename) === readingChapter);
  const desktopChapterIndex = desktopChapters.findIndex((ch) => (ch.fileName || ch.filename) === readingChapter);
  const desktopChapterNumber = desktopChapterIndex >= 0 ? desktopChapterIndex + 1 : desktopChapters.length || 1;
  const desktopChapterWords = (variantPreview ? variantPreview.content : readingContent || '').replace(/\s/g, '').length;
  const desktopProjectWords = desktopChapters.reduce((sum, ch) => sum + (Number(ch.wordCount) || Number(ch.words) || 0), 0);
  const desktopTotalWords = Number(projectDetails?.totalWords) || Number(projectDetails?.wordCount) || desktopProjectWords || desktopChapterWords;
  const desktopRecentProjects = (sortedProjectsByRecent.length ? sortedProjectsByRecent : sortedProjects).slice(0, 3);
  const desktopProgressPercent = Math.min(100, Math.round((desktopChapterWords / 4000) * 100)) || 0;
  const desktopLastSaved = readingChapter === '_streaming'
    ? '正在生成'
    : readingChapter
      ? '已保存'
      : '等待选择章节';

  if (authenticated === null) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-text">小墨匣</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1 className="auth-title">小墨匣</h1>
          <p className="auth-subtitle">请输入访问密码</p>
          <input
            className="auth-pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={loginPin}
            onChange={(e) => {
              setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              setLoginError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && loginPin.length === 4 && !loginLoading) {
                handleLogin();
              }
            }}
            autoFocus
            disabled={loginLoading}
            placeholder="····"
          />
          {loginError && <p className="auth-error">{loginError}</p>}
          <button
            className="auth-btn"
            onClick={handleLogin}
            disabled={loginPin.length !== 4 || loginLoading}
          >
            {loginLoading ? '验证中...' : '进入'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${isMobile ? ' mobile-dark-app' : ''}${isMobile && mobileView === 'chapter' ? ' mobile-chapter-dark' : ''} mobile-reading-${readingTheme}`}>
      <h1>小墨匣
        <span className="logout-link" onClick={handleLogout}>退出</span>
      </h1>
      {!isMobile && (
        <div className="desktop-workbench">
          <header className="desktop-topbar">
            <div className="desktop-brand">
              <span className="desktop-logo" aria-hidden="true"></span>
              <span>小墨匣</span>
            </div>
            <div className="desktop-search">
              <span>⌕</span>
              <input placeholder="搜索项目 / 章节 / 角色 / 世界观" readOnly onFocus={() => notifyDevFeature('全局搜索')} />
              <kbd>⌘ K</kbd>
            </div>
            <div className="desktop-top-actions">
              <button className="desktop-action primary" type="button" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>＋ 新建项目</button>
              <button className="desktop-action" type="button" onClick={() => notifyDevFeature('导入')}>⇩ 导入</button>
              <button className="desktop-action" type="button" onClick={() => notifyDevFeature('同步')}>⟳ 同步</button>
              <button className="desktop-icon-action" type="button" aria-label="通知" onClick={() => notifyDevFeature('通知中心')}>♢<em>3</em></button>
              <button className="desktop-avatar" type="button" onClick={handleLogout} title="退出登录">墨</button>
            </div>
          </header>

          <div className="desktop-layout">
            <nav className="desktop-mainnav" aria-label="主导航">
              {[
                ['⌂', '工作台', true],
                ['▣', '项目库'],
                ['◎', '世界观'],
                ['♙', '人物'],
                ['☷', '章节'],
                ['☰', '大纲'],
                ['◇', '草稿箱'],
                ['✦', '提示词实验室'],
                ['⚙', '设置'],
              ].map(([icon, label]) => {
                const navActive =
                  (label === '工作台' && desktopView === 'workbench') ||
                  (label === '项目库' && desktopView === 'projects') ||
                  (label === '世界观' && desktopView === 'world') ||
                  (label === '人物' && desktopView === 'characters') ||
                  (label === '章节' && desktopView === 'workbench') ||
                  (label === '大纲' && desktopView === 'outline') ||
                  (label === '设置' && desktopView === 'settings');
                return (
                <button
                  key={label}
                  className={navActive ? 'active' : ''}
                  type="button"
                  onClick={() => handleDesktopNav(label)}
                >
                  <span>{icon}</span>
                  {label}
                </button>
                );
              })}
              <div className="desktop-sync-card">
                <span>存储与同步</span>
                <strong>68%</strong>
                <small>68.2 GB / 100 GB</small>
              </div>
            </nav>

            <aside className="desktop-project-rail">
              <section className="desktop-card desktop-current-project">
                <div className="desktop-card-head">
                  <h2>当前项目</h2>
                  <button type="button" onClick={handleOpenSettings}>⚙</button>
                </div>
                {currentProject ? (
                  <>
                    <div className="desktop-project-cover">
                      <span>{currentProject.slice(0, 1)}</span>
                      <div>
                        <h3>{currentProject}</h3>
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

              <section className="desktop-card desktop-chapter-card">
                <div className="desktop-card-head">
                  <h2>章节列表</h2>
                  <div>
                    <button type="button" onClick={() => notifyDevFeature('新建空章节：当前后端还没有创建空章节接口')} disabled={!currentProject}>＋</button>
                  </div>
                </div>
                <div className="desktop-chapter-search">
                  <input
                    value={desktopChapterQuery}
                    onChange={(e) => setDesktopChapterQuery(e.target.value)}
                    placeholder="搜索章节标题 / 摘要"
                  />
                </div>
                <div className="desktop-chapter-list">
                  {filteredDesktopChapters.length > 0 ? filteredDesktopChapters.map((ch, index) => {
                    const cf = ch.fileName || ch.filename;
                    const isActive = cf && readingChapter === cf;
                    const chapterNo = desktopChapters.findIndex((item) => (item.fileName || item.filename) === cf) + 1 || index + 1;
                    return (
                      <button
                        key={cf || `chapter-${index}`}
                        className={isActive ? 'active' : ''}
                        type="button"
                        disabled={!cf}
                        onClick={() => cf && handleReadChapter(cf)}
                      >
                        <strong>第{chapterNo}章　{ch.title || cf?.replace(/\.txt$/, '') || '未命名章节'}</strong>
                        <span>{ch.date || ch.createdAt ? formatProjectUpdatedAt(ch.date || ch.createdAt) : '未记录'} · {(Number(ch.wordCount) || Number(ch.words) || 0).toLocaleString()} 字</span>
                        {ch.staleAfterRewrite && <em>待检查</em>}
                      </button>
                    );
                  }) : (
                    <p className="desktop-empty">{desktopChapterQuery.trim() ? '没有匹配章节。' : '暂无章节，先在右侧控制台生成第一章。'}</p>
                  )}
                </div>
              </section>

              <section className="desktop-card desktop-recent-card">
                <div className="desktop-card-head">
                  <h2>最近项目</h2>
                  <button type="button" onClick={() => setDesktopView('projects')}>查看全部</button>
                </div>
                {desktopRecentProjects.map((project, index) => (
                  <button className="desktop-recent-project" key={project.name} type="button" onClick={() => handleSelectProject(project.name)}>
                    <span>{project.name.slice(0, 1)}</span>
                    <div>
                      <strong>{project.name}</strong>
                      <small>{formatProjectUpdatedAt(project.updatedAt)} · {getProjectChapterCount(project)} 章</small>
                    </div>
                    <em>{index === 0 ? desktopTotalWords.toLocaleString() : ''}</em>
                  </button>
                ))}
              </section>
            </aside>

            <main className="desktop-writing-main">
              {showCreateForm ? (
                <section className="desktop-card desktop-create-panel">
                  <h2>创建新项目</h2>
                  <label>项目名</label>
                  <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="输入项目名称" />
                  <label>世界观设定</label>
                  <textarea value={newWorld} onChange={(e) => setNewWorld(e.target.value)} placeholder="描述世界观设定..." rows={4} />
                  <label>人物设定</label>
                  <textarea value={newCharacters} onChange={(e) => setNewCharacters(e.target.value)} placeholder="描述主要人物..." rows={4} />
                  <label>写作规则 / 风格要求</label>
                  <textarea value={newStyle} onChange={(e) => setNewStyle(e.target.value)} placeholder="文风要求、篇幅要求、写作规则…" rows={5} />
                  <label>剧情摘要（可选）</label>
                  <textarea value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="剧情摘要…" rows={3} />
                  {createError && <div className="error">{createError}</div>}
                  <div className="desktop-editor-actions">
                    <button className="btn" disabled={creating} onClick={handleCreateProject}>{creating ? '创建中...' : '创建项目'}</button>
                    <button className="btn btn-secondary" disabled={creating} onClick={() => { setShowCreateForm(false); setCreateError(''); }}>取消</button>
                  </div>
                </section>
              ) : desktopView === 'projects' ? (
                <section className="desktop-card desktop-project-library">
                  <div className="desktop-editor-head">
                    <div>
                      <h2>项目库</h2>
                      <div className="desktop-tabs">
                        <button className="active" type="button">全部项目</button>
                      </div>
                    </div>
                    <button className="btn" type="button" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>新建项目</button>
                  </div>
                  <div className="desktop-library-list">
                    {sortedProjects.length > 0 ? sortedProjects.map((project) => (
                      <button
                        key={project.name}
                        type="button"
                        className={currentProject === project.name ? 'active' : ''}
                        onClick={() => {
                          handleSelectProject(project.name);
                          setDesktopView('workbench');
                        }}
                      >
                        <strong>{project.name}</strong>
                        <span>{formatProjectUpdatedAt(project.updatedAt)} · {getProjectChapterCount(project)} 章</span>
                      </button>
                    )) : (
                      <p className="desktop-empty">暂无项目，请先创建一个小说项目。</p>
                    )}
                  </div>
                </section>
              ) : currentProject ? (
                <section className="desktop-card desktop-editor-shell">
                  <div className="desktop-editor-head">
                    <div>
                      <h2>
                        {readingChapterTitle || desktopCurrentChapter?.title || `第${desktopChapterNumber}章`}
                        {readingChapter !== '_streaming' && readingChapter && <button type="button" onClick={handleStartEditTitle}>✎</button>}
                      </h2>
                      <div className="desktop-tabs">
                        {['总览', '写作', '设定', '版本记录'].map((tab) => (
                          <button
                            key={tab}
                            className={
                              (tab === '写作' && desktopWritingMode === 'writing') ||
                              (tab === '设定' && desktopWritingMode === 'settings')
                                ? 'active'
                                : ''
                            }
                            type="button"
                            onClick={() => {
                              if (tab === '写作') {
                                setDesktopWritingMode('writing');
                              } else if (tab === '设定') {
                                setDesktopWritingMode('settings');
                                handleOpenSettings();
                              } else {
                                notifyDevFeature(tab);
                              }
                            }}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="desktop-save-state">
                      <strong>本章字数 {desktopChapterWords.toLocaleString()}</strong>
                      <span>{desktopLastSaved} · {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  {editingTitle && (
                    <div className="desktop-title-edit">
                      <input value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)} autoFocus />
                      <button className="btn" onClick={handleSaveTitle}>保存</button>
                      <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                    </div>
                  )}

                  {desktopWritingMode === 'settings' ? (
                    <div className="desktop-inline-panels">
                      <section className="settings-panel">
                        <h3>项目设定</h3>
                        <label>世界观设定</label>
                        <textarea className="settings-input" value={editWorld} onChange={(e) => setEditWorld(e.target.value)} rows={3} />
                        <label>人物设定</label>
                        <textarea className="settings-input" value={editCharacters} onChange={(e) => setEditCharacters(e.target.value)} rows={3} />
                        <label>写作规则</label>
                        <textarea className="settings-input" value={editStyle} onChange={(e) => setEditStyle(e.target.value)} rows={4} />
                        <label>剧情摘要</label>
                        <textarea className="settings-input" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={4} />
                        <div className="form-actions">
                          <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>{savingSettings ? '保存中...' : '保存设定'}</button>
                        </div>
                      </section>
                    </div>
                  ) : (
                    <><div className="desktop-writing-brief">
                    <section>
                      <h3>小节目标</h3>
                      <p>{outline[desktopChapterNumber - 1]?.goal || '推进本章核心冲突，保持人物动机清晰。'}</p>
                    </section>
                    <section>
                      <h3>本章摘要</h3>
                      <p>{desktopCurrentChapter?.summary || projectDetails?.summary?.slice(0, 72) || '等待生成或补充本章摘要。'}</p>
                    </section>
                    <section>
                      <h3>场景标签</h3>
                      <div className="desktop-tags">
                        <span>宗门秘辛</span>
                        <span>试探</span>
                        <span>关系推进</span>
                        <button type="button" onClick={() => notifyDevFeature('场景标签管理')}>＋</button>
                      </div>
                    </section>
                  </div>

                  <div className="desktop-editor-toolbar">
                    <span>正文</span>
                    {['↶', '↷', 'B', 'I', 'U', '☷', '🔗'].map((item) => (
                      <button key={item} type="button" disabled title="编辑器工具开发中">{item}</button>
                    ))}
                    <em>{desktopChapterWords.toLocaleString()} 字</em>
                  </div>

                  <textarea
                    className="desktop-manuscript"
                    ref={readingContentRef}
                    value={desktopEditorContent}
                    onChange={(e) => setDesktopEditorContent(e.target.value)}
                    onScroll={handleReadingContentScroll}
                    readOnly={!!variantPreview || !readingChapter || readingChapter === '_streaming'}
                    placeholder="从左侧选择章节，或在右侧写下本轮要求后生成正文。"
                  />

                  {debugPromptInfo && !debugPromptInfo.usedFallback && (
                    <div className="debug-prompt-info">本次使用模板：{debugPromptInfo.templateTitle || '未知'}</div>
                  )}
                  {readingChapterRecord?.staleAfterRewrite && !variantPreview && (
                    <div className="stale-chapter-notice">
                      <div><strong>这章生成于前文重写之前，可能与当前剧情不连续。</strong></div>
                      <div className="stale-chapter-actions">
                        <button className="btn btn-secondary" onClick={handleConfirmKeepChapter}>确认保留</button>
                        <button className="btn" onClick={() => { if (!showRewriteInput) handleLoadRewritePrompt(); }}>重写本章</button>
                      </div>
                    </div>
                  )}

                  <div className="desktop-editor-actions">
                    <button className="btn" onClick={() => { setDesktopAiMode('continue'); handleGenerate(); }} disabled={loading || regenerating}>{loading ? '生成中...' : '继续生成'}</button>
                    <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('rewrite'); ensureDesktopSelectionForRewrite('改写'); }} disabled={!readingChapter || readingChapter === '_streaming'}>
                      {showRewriteInput ? '取消改写' : '改写选中段落'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('polish'); ensureDesktopSelectionForRewrite('润色'); }}>润色</button>
                    <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('expand'); ensureDesktopSelectionForRewrite('扩写'); }}>扩写</button>
                    <button className="btn btn-secondary" onClick={handleDesktopSaveContent} disabled={!readingChapter || readingChapter === '_streaming' || desktopSavingContent || !!variantPreview}>
                      {desktopSavingContent ? '保存中...' : '保存草稿'}
                    </button>
                  </div>

                  {showRewriteInput && (
                    <div className="rewrite-input-area desktop-rewrite-area">
                      <h3>本次改写要求</h3>
                      <textarea className="prompt-input" value={rewritePrompt} onChange={(e) => setRewritePrompt(e.target.value)} placeholder="这次想怎么改写？" rows={4} />
                      <button className="btn" onClick={handleRegenerate} disabled={regenerating || loading}>{regenerating ? '生成中...' : '生成候选版本'}</button>
                    </div>
                  )}
                    </>  )}

                  <GenerationProgress visible={genProgress.visible} mode={genProgress.mode} status={genProgress.status} errorMessage={genProgress.errorMessage} onComplete={handleGenProgressDone} />
                  {error && <div className="error">{error}</div>}

                  {desktopWritingMode === 'writing' && (
                    <footer className="desktop-editor-status">
                      <span>自动保存已开启</span>
                      <span>第 {desktopChapterNumber} 章 · {desktopChapterWords.toLocaleString()} 字</span>
                      <span>目标 4,000 字</span>
                      <div><i style={{ width: `${desktopProgressPercent}%` }}></i></div>
                      <strong>{desktopProgressPercent}%</strong>
                    </footer>
                  )}
                </section>
              ) : (
                <section className="desktop-card desktop-empty-main">
                  <h2>选择一个项目开始写作</h2>
                  <p>小墨匣会把小说项目、章节、人物与世界观设定放在同一个写作工作台里。</p>
                  <button className="btn" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>新建项目</button>
                </section>
              )}
            </main>

            <aside className="desktop-ai-panel">
              <section className="desktop-card desktop-ai-card">
                <div className="desktop-card-head">
                  <h2>AI 写作控制台</h2>
                  <button type="button" onClick={() => notifyDevFeature('收起 AI 控制台')}>收起</button>
                </div>
                <label>创作模式</label>
                <div className="desktop-mode-grid">
                  {[
                    ['continue', '续写'],
                    ['rewrite', '改写'],
                    ['polish', '润色'],
                    ['expand', '扩写'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      className={desktopAiMode === mode ? 'active' : ''}
                      type="button"
                      onClick={() => prepareDesktopMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label>当前模型</label>
                <div className="desktop-model-grid">
                  {[
                    { value: 'deepseek-v4-flash', title: '快速模式', sub: '适合日常续写' },
                    { value: 'deepseek-v4-pro', title: '深度模式', sub: '适合复杂伏笔' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      className={model === item.value ? 'active' : ''}
                      type="button"
                      onClick={() => { setModel(item.value); setNotification({ title: '已切换', message: `模型已切换为${item.title}` }); }}
                    >
                      {item.title}<br /><small>{item.sub}</small>
                    </button>
                  ))}
                </div>
                <label>写作参数</label>
                <div className="desktop-param-list">
                  <select value={writingPrefs.style} onChange={(e) => setWritingPrefs({ ...writingPrefs, style: e.target.value })}>
                    <option value="">文风：默认</option>
                    <option value="玄幻 · 古典">玄幻 · 古典</option>
                    <option value="冷静克制">冷静克制</option>
                    <option value="轻小说">轻小说</option>
                  </select>
                  <select value={writingPrefs.characterConsistency} onChange={(e) => setWritingPrefs({ ...writingPrefs, characterConsistency: e.target.value })}>
                    <option value="strict">视角：人物一致</option>
                    <option value="natural">视角：自然推进</option>
                  </select>
                  <select value={writingPrefs.paragraph} onChange={(e) => setWritingPrefs({ ...writingPrefs, paragraph: e.target.value })}>
                    <option value="short">篇幅：短段</option>
                    <option value="normal">篇幅：中等</option>
                    <option value="long">篇幅：长段</option>
                  </select>
                  <select value={writingPrefs.pace} onChange={(e) => setWritingPrefs({ ...writingPrefs, pace: e.target.value })}>
                    <option value="slow">节奏：慢热</option>
                    <option value="normal">节奏：正常</option>
                    <option value="fast">节奏：快一点</option>
                  </select>
                  <div className="desktop-range-row"><span>温度</span><input type="range" min="0" max="1" step="0.1" defaultValue="0.7" disabled title="高级参数开发中" /><strong>0.7</strong></div>
                </div>
                <label>本轮要求</label>
                <textarea className="prompt-input" value={showRewriteInput ? rewritePrompt : userPrompt} onChange={(e) => showRewriteInput ? setRewritePrompt(e.target.value) : setUserPrompt(e.target.value)} placeholder="保持克制暧昧的气氛，推进人物试探，不要过快摊牌。" rows={5} />
                <label>关联设定</label>
                <div className="desktop-linked-settings">
                  <button type="button" onClick={() => { setDesktopWritingMode('settings'); handleOpenSettings(); }}>世界观：{projectDetails?.world ? '已挂载' : '待补充'}</button>
                  <button type="button" onClick={() => { setDesktopWritingMode('settings'); handleOpenSettings(); }}>人物：{projectDetails?.characters ? '已挂载' : '待补充'}</button>
                  <button type="button" onClick={() => { setDesktopWritingMode('settings'); handleOpenSettings(); }}>关系：编辑记忆</button>
                </div>
                <button className="desktop-generate-btn" type="button" onClick={handleDesktopGenerateByMode} disabled={loading || regenerating || !currentProject}>
                  {loading || regenerating ? '生成中...' : '生成候选'}
                </button>
                <button className="desktop-apply-btn" type="button" disabled={!variantPreview || applyingVariant} onClick={() => handleDesktopApplyVariant()}>
                  {applyingVariant ? '应用中...' : '应用到正文'}
                </button>
              </section>

              <section className="desktop-card desktop-candidates">
                <div className="desktop-card-head">
                  <h2>候选续写（{variants.length}）</h2>
                  <button type="button" onClick={() => notifyDevFeature('对比模式')}>对比模式</button>
                </div>
                <div className="desktop-candidate-list">
                  {variants.length > 0 ? variants.slice(0, 6).map((v, index) => (
                    <article className={variantPreview?.id === v.id ? 'active' : ''} key={v.id}>
                      <strong>候选 {index + 1}{index === 0 ? '（推荐）' : ''}</strong>
                      <p>{(v.content || '').slice(0, 76)}{(v.content || '').length > 76 ? '...' : ''}</p>
                      <div>
                        <button type="button" onClick={() => handleDesktopApplyVariant(v.id)} disabled={applyingVariant}>采用</button>
                        <button type="button" onClick={() => { handlePreviewVariant(v); notifyDevFeature('对比模式'); }}>对比</button>
                        <button type="button" onClick={handleRegenerate} disabled={regenerating || loading}>再来一版</button>
                      </div>
                    </article>
                  )) : (
                    <p className="desktop-empty">生成后会在这里展示候选版本。</p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
      {isMobile && showMobileSearch && (
        <div className="mobile-search-overlay">
          <div className="mobile-search-panel">
            <div className="mobile-search-bar">
              <input
                ref={mobileSearchInputRef}
                value={mobileSearchQuery}
                onChange={(e) => setMobileSearchQuery(e.target.value)}
                placeholder="搜索项目、章节、设定..."
              />
              <button type="button" onClick={closeMobileSearch}>取消</button>
            </div>
            <div className="mobile-search-body">
              {mobileSearchLoading ? (
                <div className="mobile-search-empty">正在整理搜索索引...</div>
              ) : !mobileSearchQuery.trim() ? (
                <div className="mobile-search-empty">输入关键词，搜索项目名、章节标题和项目设定。</div>
              ) : mobileSearchResults.length === 0 ? (
                <div className="mobile-search-empty">没有找到匹配内容</div>
              ) : (
                <div className="mobile-search-results">
                  {['project', 'chapter', 'setting'].map((type) => {
                    const group = mobileSearchResults.filter((item) => item.type === type);
                    if (group.length === 0) return null;
                    const label = type === 'project' ? '项目' : type === 'chapter' ? '章节' : '设定';
                    return (
                      <section className="mobile-search-group" key={type}>
                        <h3>{label}</h3>
                        {group.map((item, index) => (
                          <button
                            key={`${item.type}-${item.projectName}-${item.fileName || item.field || index}`}
                            className="mobile-search-result"
                            type="button"
                            onClick={() => handleMobileSearchResultClick(item)}
                          >
                            <span>{label}</span>
                            <strong>{item.title}</strong>
                            <em>{item.subtitle}</em>
                            {item.snippet && <small>{item.snippet}</small>}
                          </button>
                        ))}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
                  <div className="project-sort-controls">
                    <select
                      className="project-sort-field"
                      value={projectSort.field}
                      onChange={(e) => setProjectSort((prev) => ({ ...prev, field: e.target.value }))}
                    >
                      <option value="updatedAt">按修改日期</option>
                      <option value="name">按名称</option>
                      <option value="size">按大小</option>
                    </select>
                    <select
                      className="project-sort-order"
                      value={projectSort.order}
                      onChange={(e) => setProjectSort((prev) => ({ ...prev, order: e.target.value }))}
                    >
                      <option value="desc">降序</option>
                      <option value="asc">升序</option>
                    </select>
                  </div>
                  <div className="project-list project-list-scroll">
                    {sortedProjects.length === 0 && (
                      <p className="hint">暂无项目，请创建一个</p>
                    )}
                    {sortedProjects.map((p) => (
                      <div key={p.name} className="project-item-wrap">
                        <div
                          className={'project-item' + (currentProject === p.name ? ' active' : '')}
                          onClick={() => handleSelectProject(p.name)}
                        >
                          <span className="project-name">{p.name}</span>
                        </div>
                        <button className="delete-btn project-delete" onClick={(e) => handleDeleteProject(p.name, e)}>删除</button>
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

        {isMobile && mobileView === 'writing' && (
          <div className="panel panel-main mobile-writing-view">
            <button className="mobile-back-btn" onClick={onBackClick}>
              ← 返回
            </button>
            <header className="mobile-writing-header">
              <span>{currentProject || mobileWritingTarget?.projectName || '当前项目'}</span>
              <h2>{mobileWritingTarget?.nextLabel || '继续写作'}</h2>
              <p>
                {mobileWritingKind === 'rewrite'
                  ? `基于 ${mobileWritingTarget?.chapterTitle || mobileWritingTarget?.fileName || '当前章节'} 生成候选版本`
                  : mobileWritingTarget?.chapterTitle
                    ? `承接 ${mobileWritingTarget.chapterTitle}`
                    : '为这个项目生成下一章'}
              </p>
            </header>

            <section className="mobile-writing-card">
              <label>续写要求</label>
              <textarea
                className="prompt-input mobile-writing-prompt"
                value={mobileWritingPrompt}
                onChange={(e) => handleMobileWritingPromptChange(e.target.value)}
                placeholder="写下这次想推进的剧情、氛围或人物动作……"
                rows={6}
              />

              <div className="mobile-writing-modes">
                {[
                  { value: 'deepseek-v4-flash', title: '快速模式', sub: '适合日常续写' },
                  { value: 'deepseek-v4-pro', title: '深度模式', sub: '适合复杂伏笔' },
                ].map((item) => (
                  <button
                    key={item.value}
                    className={model === item.value ? 'active' : ''}
                    type="button"
                    onClick={() => setModel(item.value)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.sub}</span>
                  </button>
                ))}
              </div>

              <WritingControlPanel prefs={writingPrefs} onChange={setWritingPrefs} />

              <button
                className="btn mobile-writing-generate"
                onClick={handleMobileWritingGenerate}
                disabled={loading || regenerating || !mobileWritingPrompt.trim()}
              >
                {loading || regenerating ? '生成中...' : mobileWritingKind === 'rewrite' ? '生成候选版本' : '开始生成'}
              </button>
              {(mobileWritingError || error) && (
                <div className="error">{mobileWritingError || error}</div>
              )}
            </section>

            <section className="mobile-writing-output">
              <div className="mobile-writing-output-head">
                <h3>流式输出</h3>
                <span>{loading || regenerating ? '正在生成' : mobileWritingOutput || readingContent ? '已生成' : '等待开始'}</span>
              </div>
              <div className="mobile-writing-output-body">
                {mobileWritingOutput || (readingChapter === '_streaming' ? readingContent : '') || '生成内容会实时出现在这里。'}
              </div>
              <div className="mobile-writing-actions">
                <button
                  className="btn"
                  disabled={!readingChapter || readingChapter === '_streaming'}
                  onClick={() => navigateTo('chapter')}
                >
                  返回阅读页
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={loading || regenerating}
                  onClick={() => {
                    setMobileWritingOutput('');
                    handleMobileWritingPromptChange('继续写');
                  }}
                >
                  继续追加
                </button>
                <button className="btn btn-secondary" onClick={onBackClick}>
                  取消
                </button>
              </div>
            </section>
          </div>
        )}

        {isMobile && mobileView === 'outline' && currentProject && (
          <div className="panel panel-main mobile-outline-view">
            <button className="mobile-back-btn" onClick={onBackClick}>
              ← 返回
            </button>
            <header className="mobile-outline-header">
              <span>{currentProject}</span>
              <h2>大纲</h2>
            </header>
            {(() => {
              const sections = [
                ['剧情摘要', projectDetails?.summary],
                ['编辑记忆', projectDetails?.editorialMemory],
                ['世界观', projectDetails?.world],
                ['写作规则', projectDetails?.style],
              ].filter(([, value]) => value && String(value).trim());
              const plan = formatOutlinePlan(outline);
              return (
                <>
                  {sections.length === 0 && plan.length === 0 ? (
                    <div className="mobile-outline-empty">还没有剧情摘要，去编辑设定里补一点。</div>
                  ) : (
                    <div className="mobile-outline-sections">
                      {sections.map(([title, value]) => (
                        <section className="mobile-outline-card" key={title}>
                          <h3>{title}</h3>
                          <p>{value}</p>
                        </section>
                      ))}
                      {plan.length > 0 && (
                        <section className="mobile-outline-card">
                          <h3>章节规划</h3>
                          <div className="mobile-outline-plan">
                            {plan.map((item) => (
                              <div className="mobile-outline-plan-item" key={item.number}>
                                <span>{item.number}</span>
                                <div>
                                  <strong>{item.title}</strong>
                                  {item.detail && <p>{item.detail}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                  <div className="mobile-outline-actions">
                    <button className="btn" onClick={() => { openSettingsEditor(projectDetails, currentProject, 'summary'); navigateTo('project'); }}>
                      编辑剧情摘要
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setShowOutline(true); navigateTo('project'); }}>
                      编辑章节规划
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {isMobile && mobileView === 'allProjects' && (
          <div className="panel panel-main mobile-all-projects-view">
            <button className="mobile-back-btn" onClick={onBackClick}>
              ← 返回
            </button>
            <header className="mobile-outline-header">
              <span>小墨匣</span>
              <h2>全部项目</h2>
            </header>
            {sortedProjects.length === 0 ? (
              <div className="mobile-outline-empty">还没有项目，先创建一个故事吧。</div>
            ) : (
              <div className="mobile-all-projects-list">
                {[...sortedProjects].sort((a, b) => b.updatedAt - a.updatedAt).map((project) => {
                  const details = allProjectDetails[project.name];
                  return (
                    <button
                      className="mobile-all-project-card"
                      key={project.name}
                      type="button"
                      onClick={() => handleHomeProjectOpen(project.name)}
                    >
                      <span className="mobile-project-initial">{project.name.charAt(0)}</span>
                      <div>
                        <strong>{project.name}</strong>
                        <em>{formatProjectUpdatedAt(project.updatedAt)} · 第 {getProjectChapterCount(project)} 章</em>
                        <p>{getProjectIntro(details)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== Main Panel (desktop always, mobile hidden on shelf/project) ===== */}
        {!(isMobile && (mobileView === 'shelf' || mobileView === 'project' || mobileView === 'writing' || mobileView === 'outline' || mobileView === 'allProjects')) && (
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
                    ref={mobileWorldRef}
                    value={editWorld}
                    onChange={(e) => setEditWorld(e.target.value)}
                    rows={3}
                    placeholder="世界观设定..."
                  />
                  <label>人物设定</label>
                  <textarea
                    className="settings-input"
                    ref={mobileCharactersRef}
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
                    ref={mobileSummaryRef}
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

              {/* Desktop: generate settings */}
              {false && isMobile && (
                <button
                  className="mobile-section-toggle"
                  onClick={() => setMobileGenerateOpen(!mobileGenerateOpen)}
                >
                  续写设置 {mobileGenerateOpen ? '▲' : '▼'}
                </button>
              )}
              {!isMobile && (
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
                                { v: 'ink', t: '深墨' },
                                { v: 'night', t: '暖夜' },
                                { v: 'paper', t: '纸张' },
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
                    <div className="mobile-reading-writing-actions" style={{ marginTop: 16 }}>
                      <button className="btn" style={{ width: '100%' }} onClick={() => handleOpenMobileWriting(currentProject, { kind: 'generate', fileName: readingChapter })}>
                        生成下一段
                      </button>
                      <button className="btn" style={{ width: '100%' }} onClick={() => handleOpenMobileWriting(currentProject, { kind: 'rewrite', fileName: readingChapter })}>
                        重写本章
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
                <header className="mobile-home-header">
                  <div>
                    <h2 className="shelf-title">小墨匣</h2>
                    <p className="shelf-subtitle">把灵感写成长篇</p>
                  </div>
                  <div className="mobile-home-actions" aria-label="首页操作">
                    <button className="mobile-icon-btn" type="button" aria-label="搜索项目" data-action="search" onClick={openMobileSearch}>⌕</button>
                    <button
                      className="mobile-icon-btn mobile-icon-btn-primary"
                      type="button"
                      aria-label="新增项目"
                      data-action="create-project"
                      onClick={() => { setShowCreateForm(true); setCreateError(''); }}
                    >
                      +
                    </button>
                  </div>
                </header>

                <section className="mobile-current-card" aria-label="当前项目">
                  <div className="mobile-current-card-glow" />
                  <div className="mobile-current-card-content">
                    <span className="mobile-card-kicker"><i />当前项目</span>
                    <h3>{featuredProject.name}</h3>
                    <p>{featuredChapterLabel}</p>
                    <p className="mobile-current-updated">{featuredUpdatedLabel}</p>
                    <div className="mobile-current-actions">
                      <button
                        className="mobile-primary-action"
                        type="button"
                        data-action="continue-writing"
                        aria-label="继续写作"
                        onClick={() => handleMobileQuickAction('continue', featuredProject.name)}
                      >
                        <span>✎</span>继续写作
                      </button>
                    </div>
                  </div>
                </section>

                <section className="mobile-home-section">
                  <h3 className="mobile-section-title">快捷入口</h3>

                  {/* 写作 - 主卡 */}
                  <button
                    className="mobile-shortcut-card-primary"
                    type="button"
                    data-action="writing"
                    aria-label="打开写作"
                    onClick={() => handleMobileQuickAction('writing', featuredProject.name)}
                  >
                    <span className="mobile-shortcut-primary-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    </span>
                    <span className="mobile-shortcut-primary-copy">
                      <strong>写作</strong>
                      <span>继续章节 · 生成下一段</span>
                    </span>
                    <span className="mobile-shortcut-primary-arrow">›</span>
                  </button>

                  {/* 其余四个 - 2列小卡 */}
                  <div className="mobile-shortcut-subgrid">
                    {[
                      ['world', '世界观', '设定世界、势力、规则', 'world'],
                      ['character', '人物卡', '角色关系与人设', 'characters'],
                      ['outline', '大纲', '剧情摘要与章节规划', 'outline'],
                      ['materials', '素材库', '备份、导入、资料', 'materials'],
                    ].map(([icon, label, desc, type]) => (
                      <button
                        key={label}
                        className="mobile-shortcut-card"
                        type="button"
                        data-action={type}
                        aria-label={label}
                        onClick={() => handleMobileQuickAction(type, featuredProject.name)}
                      >
                        <span className="mobile-shortcut-icon">
                          {icon === 'world' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="2" y1="12" x2="22" y2="12"/>
                              <line x1="12" y1="2" x2="12" y2="22"/>
                              <ellipse cx="12" cy="12" rx="4" ry="10"/>
                            </svg>
                          )}
                          {icon === 'character' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="8" r="4"/>
                              <path d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
                            </svg>
                          )}
                          {icon === 'outline' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="8" y1="6" x2="21" y2="6"/>
                              <line x1="8" y1="12" x2="21" y2="12"/>
                              <line x1="8" y1="18" x2="21" y2="18"/>
                              <line x1="3" y1="6" x2="3.01" y2="6"/>
                              <line x1="3" y1="12" x2="3.01" y2="12"/>
                              <line x1="3" y1="18" x2="3.01" y2="18"/>
                            </svg>
                          )}
                          {icon === 'materials' && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                          )}
                        </span>
                        <span className="mobile-shortcut-card-copy">
                          <strong>{label}</strong>
                          <span>{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="mobile-home-section">
                  <div className="mobile-section-heading">
                    <h3 className="mobile-section-title">最近项目</h3>
                    <button className="mobile-all-projects-btn" type="button" data-action="all-projects" onClick={handleOpenAllProjects}>全部项目 ›</button>
                  </div>
                  <div className="mobile-recent-list">
                    {hasHomeProjects ? recentHomeProjects.map((p, index) => {
                    const count = getProjectChapterCount(p);
                    return (
                    <button key={p.name} className="mobile-recent-item" type="button" data-action="open-project" aria-label={p.name} onClick={() => handleHomeProjectOpen(p.name)}>
                      <span className={`mobile-recent-thumb tone-${(index % 3) + 1}`}>
                        <span>{p.name.charAt(0)}</span>
                      </span>
                      <span className="mobile-recent-copy">
                        <strong>{p.name}</strong>
                        <span>{formatProjectUpdatedAt(p.updatedAt)} ｜ 第 {count || 0} 章</span>
                      </span>
                      <span className="mobile-recent-arrow">›</span>
                    </button>
                    );
                  }) : fallbackRecentProjects.map((p, index) => (
                    <div key={p.name} className="mobile-recent-item mobile-recent-item-fallback">
                      <div className={`mobile-recent-thumb tone-${(index % 3) + 1}`}><span>{p.name.charAt(0)}</span></div>
                      <div className="mobile-recent-copy">
                        <strong>{p.name}</strong>
                        <span>{p.meta}</span>
                      </div>
                      <span className="mobile-recent-arrow">›</span>
                    </div>
                  ))}
                  </div>
                </section>

                <section className="mobile-inspiration-card">
                  <div className="mobile-inspiration-icon">✺</div>
                  <div>
                    <h3>今日灵感</h3>
                    <p>先写最想写的那一幕，故事就会自己长出来。</p>
                  </div>
                </section>

                <nav className="mobile-bottom-nav" aria-label="底部导航">
                  {[
                    ['▣', '项目', 'shelf', null],
                    ['✎', '写作', null, 'writing'],
                    ['▤', '素材', null, 'materials'],
                    ['●', '我的', null, null],
                  ].map(([icon, label, view, type]) => (
                    <button
                      key={label}
                      className={view === 'shelf' ? 'active' : ''}
                      type="button"
                      data-action={type || 'tab-' + label}
                      aria-label={label}
                      onClick={() => {
                        if (view) { navigateTo(view); return; }
                        if (type) handleMobileQuickAction(type, featuredProject.name);
                      }}
                    >
                      <span>{icon}</span>
                      <strong>{label}</strong>
                    </button>
                  ))}
                </nav>
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

            {mobileMaterialsOpen && (
              <div className="mobile-materials-panel">
                <div>
                  <h3>素材与备份</h3>
                  <p>当前版本先接入可用的导出、备份和刷新能力，便于整理项目资料。</p>
                </div>
                <div className="mobile-materials-actions">
                  <button className="btn" onClick={handleBackup}>导出备份</button>
                  <button className="btn btn-secondary" onClick={handleExport} disabled={exportStatus === 'exporting'}>
                    {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
                  </button>
                  <button className="btn btn-secondary" onClick={handleRefresh}>刷新项目</button>
                  <button className="btn btn-secondary" onClick={() => setMobileMaterialsOpen(false)}>关闭</button>
                </div>
              </div>
            )}

            {/* Settings Editor — mobile project view */}
            {showSettings && (
              <div className="settings-panel">
                <h3>项目设定</h3>
                <label>世界观设定</label>
                <textarea className="settings-input" ref={mobileWorldRef} value={editWorld} onChange={(e) => setEditWorld(e.target.value)} rows={3} placeholder="世界观设定..." />
                <label>人物设定</label>
                <textarea className="settings-input" ref={mobileCharactersRef} value={editCharacters} onChange={(e) => setEditCharacters(e.target.value)} rows={3} placeholder="人物设定..." />
                <label>写作规则</label>
                <textarea className="settings-input" value={editStyle} onChange={(e) => setEditStyle(e.target.value)} rows={5} placeholder="写作规则、文风要求..." />
                <label>剧情摘要</label>
                <textarea className="settings-input" ref={mobileSummaryRef} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={5} placeholder="剧情摘要..." />
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

            {!showSettings && !showOutline && !mobileMaterialsOpen && (
              <button
                className="btn mobile-project-write-btn"
                onClick={() => handleOpenMobileWriting(currentProject, { kind: 'generate' })}
              >
                继续写作
              </button>
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
