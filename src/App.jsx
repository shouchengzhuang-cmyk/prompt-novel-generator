import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import { apiFetch, safeJsonFetch, setOnAuthExpired } from './api';
import ProjectWorkspacePage from './pages/ProjectWorkspacePage';
import HomePage from './pages/HomePage';
import MobileAllProjectsPage from './pages/mobile/MobileAllProjectsPage';
import MobileOutlinePage from './pages/mobile/MobileOutlinePage';
import MobileProjectPage from './pages/mobile/MobileProjectPage';
import MobileReaderEditorPage from './pages/mobile/MobileReaderEditorPage';
import MobileSearchOverlay from './pages/mobile/MobileSearchOverlay';
import MobileShell from './pages/mobile/MobileShell';
import MobileWritingPage from './pages/mobile/MobileWritingPage';
import ProjectList from './components/project/ProjectList';
import * as ProjectsApi from './api/projectsApi';

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
  const [desktopEditorTab, setDesktopEditorTab] = useState('writing');
  const [desktopChapterQuery, setDesktopChapterQuery] = useState('');
  const [desktopAiMode, setDesktopAiMode] = useState('continue');
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

  /** 记住最近打开的项目（存 localStorage） */
  const rememberLastProject = useCallback((projectName) => {
    if (!projectName) return;
    localStorage.setItem('xiaomoxia-last-project', projectName);
    setLastProjectName(projectName);
  }, []);

  // ========== 认证处理 ==========
  /** 登录：验证 4 位 PIN 码 */
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

  // ---- 移动端视图导航 ----
  /** 切换移动端视图（shelf / project / chapter / writing / outline 等） */
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

  // ========== 项目列表 ==========
  /** 获取项目列表（登录后自动调用） */
  const fetchProjects = async () => {
    try {
      const data = await ProjectsApi.fetchProjects();
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

  // ---- 进入项目（加载详情和章节列表） ----
  /** 选中并加载一个项目，请求后端获取章节列表和最近内容 */
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
      const data = await ProjectsApi.fetchProjectDetails(name);
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

  // ---- 新建项目 ----
  /** 创建新项目：校验项目名（禁止特殊字符），POST 到后端，成功后自动选中 */
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
      await ProjectsApi.createProject({
        projectName: name,
        world: newWorld,
        characters: newCharacters,
        style: newStyle,
        summary: newSummary,
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

  // ---- 生成下一章（流式 + 非流式回退） ----
  /**
   * 生成下一章。优先使用流式接口（/api/generate-stream），
   * 实时在阅读区显示生成内容；如果流式失败则回退到普通 POST /api/generate。
   * 生成前会检查最后一章是否 staleAfterRewrite。
   */
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
    } else {
      setNotification({ title: '这一章写好了', message: `新章节已保存（${fileName}）` });
    }

    setLoading(false);
    generatingRef.current = false;
  };

  // ---- 阅读章节 ----
  /** 读取指定章节内容，同时加载该章节的候选版本和编辑室数据 */
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
      const data = await ProjectsApi.getChapterContent(projectName, filename);
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

  // ---- 删除章节 ----
  /** 删除指定章节，删除后自动刷新项目详情，如果正在阅读被删章节则关闭阅读 */
  const handleDeleteChapter = async (filename, e) => {
    e.stopPropagation();
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === filename);
    const label = ch?.title || filename;
    if (!confirm(`确定删除章节【${label}】吗？此操作不可恢复。`)) return;
    setError('');
    try {
      await ProjectsApi.deleteChapter(currentProject, filename);
      // Refresh chapter list
      const refreshData = await ProjectsApi.fetchProjectDetails(currentProject);
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

  // ---- 删除项目（含确认弹窗） ----
  /** 删除整个项目和所有章节，不可恢复。如果删除的是当前项目，清空所有相关状态 */
  const handleDeleteProject = async (name, e) => {
    e.stopPropagation();
    if (!confirm(`确定删除项目【${name}】吗？这会删除该项目的所有章节和设定，且不可恢复。`)) return false;
    setError('');
    try {
      await ProjectsApi.deleteProject(name);
      // If deleting the current project, clear all state and go back to project library
      if (currentProject === name) {
        setCurrentProject(null);
        setProjectDetails(null);
        if (!isMobile) setDesktopView('projects');
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

  // ---- 重命名项目 ----
  const handleRenameProject = async (name, newName) => {
    if (!name || !newName || !newName.trim()) {
      setNotification({ title: '重命名失败', message: '新项目名不能为空。' });
      return false;
    }
    const trimmed = newName.trim();
    if (/[/\\:*?"<>|]/.test(trimmed)) {
      setNotification({ title: '重命名失败', message: '项目名包含非法字符（/ \\ : * ? " < > |）。' });
      return false;
    }
    // Check for duplicate names in the loaded project list
    if (projects.some((p) => p.name === trimmed && p.name !== name)) {
      setNotification({ title: '重命名失败', message: `项目「${trimmed}」已存在。` });
      return false;
    }
    try {
      const data = await ProjectsApi.renameProject(name, trimmed);
      // Update local state
      const isCurrent = currentProject === name;
      if (isCurrent) {
        setCurrentProject(trimmed);
      }
      // Refresh project list
      await fetchProjects();
      setNotification({ title: '重命名成功', message: `「${name}」→「${trimmed}」` });
      return data;
    } catch (err) {
      setError(err.message);
      setNotification({ title: '重命名失败', message: err.message });
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

  // ---- 复制全文 ----
  /** 将全部生成内容（displayContent）复制到剪贴板 */
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

  // ---- 编辑项目设定（世界观/人物/风格/摘要/编辑记忆） ----
  /** 打开项目设定编辑器，支持自动聚焦到指定字段（world/characters/summary） */
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
    setDesktopEditorTab('settings');
    openSettingsEditor(projectDetails, currentProject);
  };

  // ---- 保存项目设定 ----
  /** 将世界观/人物/风格/摘要/编辑记忆保存到后端 */
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
      const data = await ProjectsApi.updateProjectSettings(currentProject, {
        world: editWorld,
        characters: editCharacters,
        style: editStyle,
        summary: editSummary,
        editorialMemory: editEditorialMemory,
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

  // ---- 大纲（章节规划） ----
  /** 加载项目大纲（JSON 格式的章节规划） */
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

  // ---- 生成章节大纲 ----
  /** 调用 AI 根据当前项目设定和已有章节生成章节大纲 */
  const handleGenerateOutline = async () => {
    if (!currentProject) return;
    setOutlineSaving(true);
    setOutlineError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/outline/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      setOutline(data.outline);
      setOutlineText(JSON.stringify(data.outline, null, 2));
      setOutlineError('已生成');
      setTimeout(() => setOutlineError(''), 3000);
    } catch (err) {
      setOutlineError(err.message);
    } finally {
      setOutlineSaving(false);
    }
  };

  // ---- 刷新项目列表和当前项目 ----
  /** 手动刷新项目列表和当前选中的项目详情 */
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
      const details = await ProjectsApi.fetchProjectDetails(projectName);
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
          : await ProjectsApi.fetchProjectDetails(project.name);
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
      setDesktopEditorTab('writing');
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
      const view = label === '世界观' ? 'world' : label === '人物' ? 'characters' : 'settings';
      setDesktopView(view);
      setDesktopEditorTab('settings');
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
      setDesktopEditorTab('writing');
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
      // Refresh project details to update word counts
      try {
        const refreshData = await ProjectsApi.fetchProjectDetails(currentProject);
        if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
        setProjectDetails(refreshData);
      } catch { /* non-critical refresh */ }
      setNotification({ title: '已保存', message: '当前章节正文已保存。' });
    } catch (err) {
      setError(err.message);
    } finally {
      setDesktopSavingContent(false);
    }
  };

  const prepareDesktopMode = (mode) => {
    setDesktopAiMode(mode);
    if (mode === 'continue') {
      setShowRewriteInput(false);
      return;
    }
    if (!readingChapter || readingChapter === '_streaming') {
      setNotification({ title: '请先打开章节', message: '改写需要先选择一个已有章节。' });
      return;
    }
    handleLoadRewritePrompt();
    const prompts = {
      rewrite: '改写选中段落，保持剧情事实不变，优化动作与情绪递进。',
    };
    setRewritePrompt((prev) => prev || prompts[mode] || '继续写');
  };

  const handleDesktopGenerateByMode = async () => {
    if (desktopAiMode === 'continue') {
      await handleGenerate();
      return;
    }
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
  const desktopTotalWords = desktopChapters.reduce((sum, ch) => sum + (Number(ch.wordCount) || Number(ch.words) || 0), 0);
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
          {/* 进入：调用认证登录接口校验 PIN，成功后切换到已登录状态。 */}
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
        {/* 退出：调用认证退出接口并清理本地登录状态，随后回到登录页。 */}
        <span className="logout-link" onClick={handleLogout}>退出</span>
      </h1>
      {/* 新桌面工作台：桌面端会先渲染 ProjectWorkspacePage，后续旧 app-shell 仍需单独确认是否重复显示。 */}
      {!isMobile && (
        <ProjectWorkspacePage
          desktopView={desktopView}
          desktopEditorTab={desktopEditorTab}
          showCreateForm={showCreateForm}
          currentProject={currentProject}
          projectDetails={projectDetails}
          readingChapter={readingChapter}
          readingChapterTitle={readingChapterTitle}
          readingContent={readingContent}
          showRewriteInput={showRewriteInput}
          rewritePrompt={rewritePrompt}
          variants={variants}
          variantPreview={variantPreview}
          editingTitle={editingTitle}
          editTitleValue={editTitleValue}
          exportStatus={exportStatus}
          error={error}
          loading={loading}
          regenerating={regenerating}
          model={model}
          writingPrefs={writingPrefs}
          userPrompt={userPrompt}
          editWorld={editWorld}
          editCharacters={editCharacters}
          editStyle={editStyle}
          editSummary={editSummary}
          editEditorialMemory={editEditorialMemory}
          editingProjectName={editingProjectName}
          showSettings={showSettings}
          showOutline={showOutline}
          outlineSaving={outlineSaving}
          outlineError={outlineError}
          desktopAiMode={desktopAiMode}
          desktopEditorContent={desktopEditorContent}
          desktopSavingContent={desktopSavingContent}
          desktopChapterQuery={desktopChapterQuery}
          debugPromptInfo={debugPromptInfo}
          genProgress={genProgress}
          copied={copied}
          savingSettings={savingSettings}
          applyingVariant={applyingVariant}
          readingContentRef={readingContentRef}
          readingSectionRef={readingSectionRef}
          creating={creating}
          newProjectName={newProjectName}
          newWorld={newWorld}
          newCharacters={newCharacters}
          newStyle={newStyle}
          newSummary={newSummary}
          createError={createError}
          desktopChapters={desktopChapters}
          filteredDesktopChapters={filteredDesktopChapters}
          desktopCurrentChapter={desktopCurrentChapter}
          desktopChapterNumber={desktopChapterNumber}
          desktopChapterWords={desktopChapterWords}
          desktopTotalWords={desktopTotalWords}
          desktopLastSaved={desktopLastSaved}
          sortedProjects={sortedProjects}
          enhancedPrompt={enhancedPrompt}
          enhancedRewritePrompt={enhancedRewritePrompt}
          outline={outline}
          outlineText={outlineText}
          readingChapterRecord={readingChapterRecord}
          onDesktopNav={handleDesktopNav}
          onSelectProject={handleSelectProject}
          onReadChapter={handleReadChapter}
          onGenerate={handleGenerate}
          onRegenerate={handleRegenerate}
          onDesktopSaveContent={handleDesktopSaveContent}
          onDesktopGenerateByMode={handleDesktopGenerateByMode}
          onPrepareDesktopMode={prepareDesktopMode}
          onOpenSettings={handleOpenSettings}
          onSaveSettings={handleSaveSettings}
          onLoadRewritePrompt={handleLoadRewritePrompt}
          onStartEditTitle={handleStartEditTitle}
          onSaveTitle={handleSaveTitle}
          onCancelEditTitle={handleCancelEditTitle}
          onExport={handleExport}
          onBackup={handleBackup}
          onRebuildIndex={handleRebuildIndex}
          onConfirmKeepChapter={handleConfirmKeepChapter}
          onPreviewVariant={handlePreviewVariant}
          onDesktopApplyVariant={handleDesktopApplyVariant}
          onApplyVariant={handleApplyVariant}
          onGenProgressDone={handleGenProgressDone}
          onCopyChapter={handleCopyChapter}
          onCopyFull={handleCopyFull}
          onSetRewritePrompt={setRewritePrompt}
          onSetShowRewriteInput={setShowRewriteInput}
          onSetShowCreateForm={setShowCreateForm}
          onSetCreateError={setCreateError}
          onSetDesktopView={setDesktopView}
          onSetDesktopEditorTab={setDesktopEditorTab}
          onCreateProject={handleCreateProject}
          onLoadOutline={handleLoadOutline}
          onSaveOutline={handleSaveOutline}
          onSetOutlineText={setOutlineText}
          onSetOutlineError={setOutlineError}
          onSetEditWorld={setEditWorld}
          onSetEditCharacters={setEditCharacters}
          onSetEditStyle={setEditStyle}
          onSetEditSummary={setEditSummary}
          onSetEditEditorialMemory={setEditEditorialMemory}
          onSetShowOutline={setShowOutline}
          onSetShowSettings={setShowSettings}
          onSetModel={setModel}
          onSetWritingPrefs={setWritingPrefs}
          onSetUserPrompt={setUserPrompt}
          onSetDesktopAiMode={setDesktopAiMode}
          onSetDesktopEditorContent={setDesktopEditorContent}
          onSetDesktopChapterQuery={setDesktopChapterQuery}
          onSetEditTitleValue={setEditTitleValue}
          onSetNewProjectName={setNewProjectName}
          onSetNewWorld={setNewWorld}
          onSetNewCharacters={setNewCharacters}
          onSetNewStyle={setNewStyle}
          onSetNewSummary={setNewSummary}
          onHandleLogout={handleLogout}
          onHandleSelectProject={handleSelectProject}
          onHandleGenerate={handleGenerate}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onGenerateOutline={handleGenerateOutline}
          formatProjectUpdatedAt={formatProjectUpdatedAt}
          getProjectChapterCount={getProjectChapterCount}
        />
      )}
      {isMobile && showMobileSearch && (
        <MobileSearchOverlay
          inputRef={mobileSearchInputRef}
          query={mobileSearchQuery}
          onQueryChange={setMobileSearchQuery}
          loading={mobileSearchLoading}
          results={mobileSearchResults}
          onClose={closeMobileSearch}
          onResultClick={handleMobileSearchResultClick}
        />
      )}
      {isMobile && (
      <MobileShell isSidebarCollapsed={isSidebarCollapsed}>
        {/* ===== Left Panel: Projects (desktop only) ===== */}
        {!isMobile && (isSidebarCollapsed ? (
          /* 展开旧侧栏：只切换旧桌面侧栏折叠状态，不请求后端。 */
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
            /* 收起旧侧栏：只切换旧桌面侧栏折叠状态，不保存内容。 */
            <button
              className="sidebar-collapsed-toggle sidebar-collapse-button"
              onClick={() => setIsSidebarCollapsed(true)}
              title="收起侧栏"
            >
              ‹
            </button>
            )}

            <ProjectList
              projects={sortedProjects}
              currentProject={currentProject}
              projectSort={projectSort}
              isCollapsed={isProjectsCollapsed}
              onSortChange={setProjectSort}
              onSelect={handleSelectProject}
              onDelete={handleDeleteProject}
              onCreate={() => { setShowCreateForm(true); setCreateError(''); }}
              onRefresh={handleRefresh}
              onToggle={() => setIsProjectsCollapsed((prev) => !prev)}
            />

            {projectDetails && (
              <section className="sidebar-section chapters-list">
                <div className="sidebar-section-header">
                  <h3>章节列表</h3>
                  <div className="sidebar-section-actions">
                    {!isChaptersCollapsed && (
                      <>
                        {/* 导出全文：调用后端导出接口生成当前项目全文，不修改项目内容。 */}
                        <button className="btn" onClick={handleExport} disabled={exportStatus === 'exporting'}>
                          {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
                        </button>
                        <details className="project-tools">
                          <summary className="project-tools-summary">项目工具</summary>
                          <div className="project-tools-body">
                            {/* 重建索引：调用后端重建当前项目章节索引，可能更新章节元数据。 */}
                            <button className="btn" onClick={handleRebuildIndex}>重建索引</button>
                            {/* 导出项目备份：调用后端备份接口下载当前项目数据，不修改服务器内容。 */}
                            <button className="btn btn-secondary" onClick={handleBackup}>
                              导出项目备份
                            </button>
                          </div>
                        </details>
                      </>
                    )}
                    {/* 折叠章节区：只切换旧侧栏章节列表显示状态，不请求后端。 */}
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
                            {/* 删除章节：调用后端删除当前章节文件；handler 内应有确认，避免误删正文。 */}
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

        {mobileView === 'writing' && (
          <MobileWritingPage
            currentProject={currentProject}
            mobileWritingTarget={mobileWritingTarget}
            mobileWritingKind={mobileWritingKind}
            mobileWritingPrompt={mobileWritingPrompt}
            onMobileWritingPromptChange={handleMobileWritingPromptChange}
            model={model}
            onSetModel={setModel}
            writingPrefs={writingPrefs}
            onSetWritingPrefs={setWritingPrefs}
            loading={loading}
            regenerating={regenerating}
            onMobileWritingGenerate={handleMobileWritingGenerate}
            mobileWritingError={mobileWritingError}
            error={error}
            mobileWritingOutput={mobileWritingOutput}
            readingChapter={readingChapter}
            readingContent={readingContent}
            navigateTo={navigateTo}
            onSetMobileWritingOutput={setMobileWritingOutput}
            onBackClick={onBackClick}
          />
        )}{mobileView === 'outline' && currentProject && (
          <MobileOutlinePage
            currentProject={currentProject}
            projectDetails={projectDetails}
            outline={outline}
            formatOutlinePlan={formatOutlinePlan}
            openSettingsEditor={openSettingsEditor}
            navigateTo={navigateTo}
            onSetShowOutline={setShowOutline}
            onBackClick={onBackClick}
          />
        )}{mobileView === 'allProjects' && (
          <MobileAllProjectsPage
            sortedProjects={sortedProjects}
            allProjectDetails={allProjectDetails}
            getProjectIntro={getProjectIntro}
            formatProjectUpdatedAt={formatProjectUpdatedAt}
            getProjectChapterCount={getProjectChapterCount}
            onHomeProjectOpen={handleHomeProjectOpen}
            onBackClick={onBackClick}
          />
        )}

        <MobileReaderEditorPage
          isMobile={isMobile}
          mobileView={mobileView}
          readingChapter={readingChapter}
          onBackClick={onBackClick}
          readingChapterTitle={readingChapterTitle}
          editorRoomTab={editorRoomTab}
          setEditorRoomTab={setEditorRoomTab}
          handleClearEditorChats={handleClearEditorChats}
          editorChatSending={editorChatSending}
          editorChats={editorChats}
          editorNoteLoading={editorNoteLoading}
          handleEditorNote={handleEditorNote}
          editorNoteError={editorNoteError}
          editorNoteResult={editorNoteResult}
          savingEditorNoteId={savingEditorNoteId}
          handleSaveEditorNote={handleSaveEditorNote}
          editorChatListRef={editorChatListRef}
          editorChatError={editorChatError}
          editorChatContextMode={editorChatContextMode}
          setEditorChatContextMode={setEditorChatContextMode}
          editorChatInput={editorChatInput}
          setEditorChatInput={setEditorChatInput}
          handleEditorChatKeyDown={handleEditorChatKeyDown}
          handleSendEditorChat={handleSendEditorChat}
          showCreateForm={showCreateForm}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          newWorld={newWorld}
          setNewWorld={setNewWorld}
          newCharacters={newCharacters}
          setNewCharacters={setNewCharacters}
          newStyle={newStyle}
          setNewStyle={setNewStyle}
          newSummary={newSummary}
          setNewSummary={setNewSummary}
          createError={createError}
          creating={creating}
          handleCreateProject={handleCreateProject}
          setShowCreateForm={setShowCreateForm}
          setCreateError={setCreateError}
          currentProject={currentProject}
          handleOpenSettings={handleOpenSettings}
          showOutline={showOutline}
          setShowOutline={setShowOutline}
          handleLoadOutline={handleLoadOutline}
          showSettings={showSettings}
          mobileWorldRef={mobileWorldRef}
          editWorld={editWorld}
          setEditWorld={setEditWorld}
          mobileCharactersRef={mobileCharactersRef}
          editCharacters={editCharacters}
          setEditCharacters={setEditCharacters}
          editStyle={editStyle}
          setEditStyle={setEditStyle}
          mobileSummaryRef={mobileSummaryRef}
          editSummary={editSummary}
          setEditSummary={setEditSummary}
          editEditorialMemory={editEditorialMemory}
          setEditEditorialMemory={setEditEditorialMemory}
          enhancedPrompt={enhancedPrompt}
          projectDetails={projectDetails}
          savingSettings={savingSettings}
          handleSaveSettings={handleSaveSettings}
          outlineText={outlineText}
          setOutlineText={setOutlineText}
          setOutlineError={setOutlineError}
          outlineError={outlineError}
          handleSaveOutline={handleSaveOutline}
          outlineSaving={outlineSaving}
          mobileGenerateOpen={mobileGenerateOpen}
          setMobileGenerateOpen={setMobileGenerateOpen}
          userPrompt={userPrompt}
          setUserPrompt={setUserPrompt}
          model={model}
          setModel={setModel}
          writingPrefs={writingPrefs}
          setWritingPrefs={setWritingPrefs}
          handleGenerate={handleGenerate}
          loading={loading}
          regenerating={regenerating}
          genProgress={genProgress}
          handleGenProgressDone={handleGenProgressDone}
          error={error}
          readingSectionRef={readingSectionRef}
          editingTitle={editingTitle}
          editTitleValue={editTitleValue}
          setEditTitleValue={setEditTitleValue}
          handleSaveTitle={handleSaveTitle}
          handleCancelEditTitle={handleCancelEditTitle}
          handleStartEditTitle={handleStartEditTitle}
          showRewriteInput={showRewriteInput}
          setShowRewriteInput={setShowRewriteInput}
          setRewritePrompt={setRewritePrompt}
          handleLoadRewritePrompt={handleLoadRewritePrompt}
          copied={copied}
          handleCopyChapter={handleCopyChapter}
          displayContent={displayContent}
          handleCopyFull={handleCopyFull}
          enhancedRewritePrompt={enhancedRewritePrompt}
          handleRegenerate={handleRegenerate}
          readingChapterRecord={readingChapterRecord}
          handleConfirmKeepChapter={handleConfirmKeepChapter}
          mobileReadingSettingsOpen={mobileReadingSettingsOpen}
          setMobileReadingSettingsOpen={setMobileReadingSettingsOpen}
          readingTheme={readingTheme}
          setReadingTheme={setReadingTheme}
          readingFontSize={readingFontSize}
          setReadingFontSize={setReadingFontSize}
          variantPreview={variantPreview}
          readingContentRef={readingContentRef}
          handleReadingContentScroll={handleReadingContentScroll}
          readingContent={readingContent}
          showScrollTop={showScrollTop}
          handleScrollToTop={handleScrollToTop}
          handleOpenMobileWriting={handleOpenMobileWriting}
          showMobileEdit={showMobileEdit}
          setMobileEditTitle={setMobileEditTitle}
          setMobileEditContent={setMobileEditContent}
          mobileEditTitle={mobileEditTitle}
          mobileEditContent={mobileEditContent}
          handleMobileSaveEdit={handleMobileSaveEdit}
          mobileEditSaving={mobileEditSaving}
          variants={variants}
          mobileVariantsOpen={mobileVariantsOpen}
          setMobileVariantsOpen={setMobileVariantsOpen}
          handlePreviewVariant={handlePreviewVariant}
          handleApplyVariant={handleApplyVariant}
          applyingVariant={applyingVariant}
          resetEditorRoom={resetEditorRoom}
        />

        {/* ===== Mobile: Shelf View ===== */}
        {mobileView === 'shelf' && (
          <HomePage
            showCreateForm={showCreateForm}
            creating={creating}
            newProjectName={newProjectName}
            newWorld={newWorld}
            newCharacters={newCharacters}
            newStyle={newStyle}
            newSummary={newSummary}
            createError={createError}
            featuredProject={featuredProject}
            featuredChapterLabel={featuredChapterLabel}
            featuredUpdatedLabel={featuredUpdatedLabel}
            recentHomeProjects={recentHomeProjects}
            hasHomeProjects={hasHomeProjects}
            fallbackRecentProjects={fallbackRecentProjects}
            onNavigate={navigateTo}
            onHomeProjectOpen={handleHomeProjectOpen}
            onOpenAllProjects={handleOpenAllProjects}
            onMobileQuickAction={handleMobileQuickAction}
            onOpenMobileSearch={openMobileSearch}
            onCreateProject={handleCreateProject}
            onCancelCreate={() => { setShowCreateForm(false); setCreateError(''); setNewProjectName(''); setNewWorld(''); setNewCharacters(''); setNewStyle(''); setNewSummary(''); }}
            onOpenCreate={() => { setShowCreateForm(true); setCreateError(''); }}
            onNewProjectNameChange={setNewProjectName}
            onNewWorldChange={setNewWorld}
            onNewCharactersChange={setNewCharacters}
            onNewStyleChange={setNewStyle}
            onNewSummaryChange={setNewSummary}
            formatProjectUpdatedAt={formatProjectUpdatedAt}
            getProjectChapterCount={getProjectChapterCount}
          />
        )}

        {/* ===== Mobile: Project View (chapter list) ===== */}
        {mobileView === 'project' && currentProject && (
          <MobileProjectPage
            currentProject={currentProject}
            projectDetails={projectDetails}
            readingChapter={readingChapter}
            exportStatus={exportStatus}
            mobileMaterialsOpen={mobileMaterialsOpen}
            showSettings={showSettings}
            showOutline={showOutline}
            savingSettings={savingSettings}
            editWorld={editWorld}
            editCharacters={editCharacters}
            editStyle={editStyle}
            editSummary={editSummary}
            editEditorialMemory={editEditorialMemory}
            outlineText={outlineText}
            outlineError={outlineError}
            outlineSaving={outlineSaving}
            mobileChapterMenu={mobileChapterMenu}
            mobileWorldRef={mobileWorldRef}
            mobileCharactersRef={mobileCharactersRef}
            mobileSummaryRef={mobileSummaryRef}
            onBackClick={onBackClick}
            onExport={handleExport}
            onBackup={handleBackup}
            onOpenSettings={handleOpenSettings}
            onRefresh={handleRefresh}
            onSetMobileMaterialsOpen={setMobileMaterialsOpen}
            onSetEditWorld={setEditWorld}
            onSetEditCharacters={setEditCharacters}
            onSetEditStyle={setEditStyle}
            onSetEditSummary={setEditSummary}
            onSetEditEditorialMemory={setEditEditorialMemory}
            onSaveSettings={handleSaveSettings}
            onSetShowSettings={setShowSettings}
            onSetOutlineText={setOutlineText}
            onSetOutlineError={setOutlineError}
            onSaveOutline={handleSaveOutline}
            onSetShowOutline={setShowOutline}
            onOpenMobileWriting={handleOpenMobileWriting}
            onReadChapter={handleReadChapter}
            navigateTo={navigateTo}
            onSetMobileGenerateOpen={setMobileGenerateOpen}
            onSetMobileVariantsOpen={setMobileVariantsOpen}
            onSetMobileChapterMenu={setMobileChapterMenu}
            onMobileDeleteChapter={handleMobileDeleteChapter}
          />
        )}
      </MobileShell>
      )}

      {notification && (
        <div className="notification-card">
          <div className="notification-header">
            <span className="notification-title">{notification.title}</span>
            {/* 关闭通知：只清除前端通知状态，不影响项目数据。 */}
            <button className="notification-close" onClick={() => setNotification(null)}>×</button>
          </div>
          <div className="notification-body">{notification.message}</div>
        </div>
      )}
    </div>
  );
}

export default App;
