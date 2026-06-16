import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';

import ProjectWorkspacePage from './pages/ProjectWorkspacePage';
import HomePage from './pages/HomePage';
import MobileAllProjectsPage from './pages/mobile/MobileAllProjectsPage';
import MobileOutlinePage from './pages/mobile/MobileOutlinePage';
import MobileProjectPage from './pages/mobile/MobileProjectPage';
import MobileReaderEditorPage from './pages/mobile/MobileReaderEditorPage';
import MobileSearchOverlay from './pages/mobile/MobileSearchOverlay';
import MobileShell from './pages/mobile/MobileShell';
import MobileWritingPage from './pages/mobile/MobileWritingPage';
import LoginScreen from './components/auth/LoginScreen';
import AppNotification from './components/AppNotification';
import { useNotificationState } from './hooks/useNotificationState';
import { useAuthState } from './hooks/useAuthState';
import { useDesktopSearchState } from './hooks/useDesktopSearchState';
import { useProjectCreateFormState } from './hooks/useProjectCreateFormState';
import { useProjectSelectionState } from './hooks/useProjectSelectionState';
import { useChapterSelectionState } from './hooks/useChapterSelectionState';
import { useWorkspaceUiState } from './hooks/useWorkspaceUiState';
import { useProjectSettingsDraftState } from './hooks/useProjectSettingsDraftState';
import * as ProjectsApi from './api/projectsApi';

import { useWritingPrefsState } from './hooks/useWritingPrefsState';
import { useGenerationProgress } from './hooks/useGenerationProgress';
import { useVariantState } from './hooks/useVariantState';
import { useVariantActions } from './hooks/useVariantActions';
import { useGenerationController } from './hooks/useGenerationController';

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) return chapters;
  return chapters.map((ch) => {
    if (!ch.fileName && ch.filename) ch.fileName = ch.filename;
    if (!ch.filename && ch.fileName) ch.filename = ch.fileName;
    return ch;
  });
}

function App() {
  const [projectChapterCounts, setProjectChapterCounts] = useState({});

  const createForm = useProjectCreateFormState();

  // Generation
  const [userPrompt, setUserPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [lastFilename, setLastFilename] = useState('');
  const [copied, setCopied] = useState(false);

  // Project settings editor
  const [showSettings, setShowSettings] = useState(false);

  // Export
  const [exportStatus, setExportStatus] = useState('');
  const [rebuildingSummary, setRebuildingSummary] = useState(false);

  // Chapter title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Reading settings
  const [readingTheme, setReadingTheme] = useState(() => {
    const saved = localStorage.getItem('readingTheme');
    if (saved === 'default' || saved === 'dark') return 'ink';
    if (saved === 'warm') return 'night';
    if (saved === 'gray') return 'paper';
    return saved || 'ink';
  });
  const [readingFontSize, setReadingFontSize] = useState(() => localStorage.getItem('readingFontSize') || 'medium');

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

  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileSearchIndex, setMobileSearchIndex] = useState([]);
  const [mobileSearchLoading, setMobileSearchLoading] = useState(false);

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

  // Outline (chapter planning)
  const [outline, setOutline] = useState([]);
  const [showOutline, setShowOutline] = useState(false);
  const [outlineText, setOutlineText] = useState('');
  const [outlineSaving, setOutlineSaving] = useState(false);
  const [outlineError, setOutlineError] = useState('');

  // Mobile simple edit
  const [mobileEditTitle, setMobileEditTitle] = useState('');
  const [mobileEditContent, setMobileEditContent] = useState('');
  const [mobileEditSaving, setMobileEditSaving] = useState(false);


  const [desktopChapterQuery, setDesktopChapterQuery] = useState('');
  const [desktopAiMode, setDesktopAiMode] = useState('continue');
  const [desktopEditorContent, setDesktopEditorContent] = useState('');
  const [desktopSavingContent, setDesktopSavingContent] = useState(false);

  const { notification, setNotification, clearNotification } = useNotificationState();
  const settingsDraft = useProjectSettingsDraftState();
  const workspaceUi = useWorkspaceUiState();
  const {
    savingSettings, setSavingSettings,
    editWorld, setEditWorld,
    editCharacters, setEditCharacters,
    editStyle, setEditStyle,
    editSummary, setEditSummary,
    editEditorialMemory, setEditEditorialMemory,
    editingProjectName, setEditingProjectName,
    hydrateSettingsDraft, clearSettingsDraft,
    getSettingsPayload, getSavedSettings,
  } = settingsDraft;
  const {
    desktopView, setDesktopView, desktopEditorTab, setDesktopEditorTab,
    mobileView, setMobileView, isMobile,
    mobileGenerateOpen, setMobileGenerateOpen,
    mobileVariantsOpen, setMobileVariantsOpen,
    mobileShelfMenu, setMobileShelfMenu,
    mobileChapterMenu, setMobileChapterMenu,
    mobileMaterialsOpen, setMobileMaterialsOpen,
    mobileReadingSettingsOpen, setMobileReadingSettingsOpen,
    showMobileEdit, setShowMobileEdit,
    closeMobileOverlays, switchMobileView, navigateTo,
  } = workspaceUi;

  const auth = useAuthState();
  const desktopSearch = useDesktopSearchState();
  const projectSelection = useProjectSelectionState({
    setNotification,
    setError,
    normalizeChapters,
    isAuthenticated: auth.isAuthenticated,
  });
  const {
    projects,
    currentProject,
    setCurrentProject,
    projectDetails,
    setProjectDetails,
    lastProjectName,
    rememberLastProject,
    fetchProjects,
    loadProjectDetails,
  } = projectSelection;
  const chapterSelection = useChapterSelectionState({
    projectDetails,
    setProjectDetails,
    setError,
  });
  const {
    chapters,
    readingChapter,
    setReadingChapter,
    readingChapterTitle,
    setReadingChapterTitle,
    readingContent,
    setReadingContent,
    loadChapterContent,
    clearChapterSelection,
  } = chapterSelection;

  const {
    debugPromptInfo, setDebugPromptInfo,
    genProgress, setGenProgress,
    streamingChapterNum, setStreamingChapterNum,
    handleGenProgressDone,
  } = useGenerationProgress();

  const {
    variants, setVariants,
    variantPreview, setVariantPreview,
    applyingVariant, setApplyingVariant,
    showRewriteInput, setShowRewriteInput,
    rewritePrompt, setRewritePrompt,
    handlePreviewVariant,
    clearVariantState,
    handleLoadVariants,
  } = useVariantState();

  const { model, setModel, writingPrefs, setWritingPrefs, enhancedPrompt, enhancedRewritePrompt } =
    useWritingPrefsState({ userPrompt, rewritePrompt });

  const { handleApplyVariant } = useVariantActions({
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
  });

  useEffect(() => {
    setDesktopEditorContent(variantPreview ? variantPreview.content : readingContent || '');
  }, [readingContent, variantPreview]);

  // Browser title during generation / rewrite
  useEffect(() => {
    const busy = loading || regenerating;
    document.title = busy ? '生成中...' : '小墨匣';
    return () => { document.title = '小墨匣'; };
  }, [loading, regenerating]);

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
    if (createForm.showCreateForm) {
      createForm.closeCreateProjectForm();
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
      clearChapterSelection();
      clearVariantState();
      setDebugPromptInfo(null);
      setMobileView('project');
      return 'view';
    }
    if (mobileView === 'project' || currentProject) {
      setCurrentProject(null);
      setProjectDetails(null);
      setDisplayContent('');
      clearChapterSelection();
      clearVariantState();
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

  const generatingRef = useRef(false);
  const appScrollRef = useRef(null);
  const readingSectionRef = useRef(null);
  const readingContentRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { handleGenerate, handleRegenerate } = useGenerationController({
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
  });

  // 章节内容区域滚动监听（桌面端使用 content div，移动端使用 .app 滚动容器）
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
    const scrollContainer = appScrollRef.current;
    if (!scrollContainer) return;
    const handleScroll = () => setShowScrollTop(scrollContainer.scrollTop > 300);
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isMobile, readingChapter]);

  // 章节切换时重置滚动状态
  useEffect(() => {
    setShowScrollTop(false);
  }, [readingChapter]);

  const handleScrollToTop = () => {
    if (isMobile) {
      appScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      readingContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ---- 进入项目（加载详情和章节列表） ----
  /** 选中并加载一个项目，请求后端获取章节列表和最近内容 */
  const handleSelectProject = async (name) => {
    rememberLastProject(name);
    setCurrentProject(name);
    setError('');
    setLastFilename('');
    setUserPrompt('');
    clearChapterSelection();
    clearVariantState();
    setShowSettings(false);
    clearSettingsDraft();
    setShowOutline(false);
    setMobileMaterialsOpen(false);
    setMobileWritingTarget(null);
    setMobileWritingOutput('');
    setMobileWritingError('');
    setOutline([]);
    setOutlineText('');
    setOutlineError('');
    setDebugPromptInfo(null);
    if (isMobile) navigateTo('project');
    setWritingPrefs({ style: '', paragraph: 'normal', pace: 'normal', characterConsistency: 'strict' });
    try {
      const data = await loadProjectDetails(name);
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
    const name = createForm.newProjectName.trim();

    if (!name) {
      createForm.setCreateError('项目名不能为空');
      return;
    }
    if (ILLEGAL_CHARS.test(name)) {
      createForm.setCreateError('项目名不能包含 / \\ : * ? " < > | 等字符');
      return;
    }

    createForm.setCreateError('');
    createForm.setCreating(true);
    try {
      await ProjectsApi.createProject({
        projectName: name,
        world: createForm.newWorld,
        characters: createForm.newCharacters,
        style: createForm.newStyle,
        summary: createForm.newSummary,
      });

      createForm.closeCreateProjectForm();
      await fetchProjects();
      rememberLastProject(name);
      await handleSelectProject(name);
      setDesktopView('workbench');
    } catch (err) {
      createForm.setCreateError(err.message);
    } finally {
      createForm.setCreating(false);
    }
  };

  // ---- 阅读章节 ----
  /** 读取指定章节内容，同时加载该章节的候选版本 */
  const handleReadChapter = async (filename, projectName = currentProject) => {
    if (!projectName) return null;
    rememberLastProject(projectName);
    setDebugPromptInfo(null);
    // Clear previous chapter state before loading new one
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    const data = await loadChapterContent(projectName, filename);
    if (!data) return null;
    setMobileWritingOutput('');
    // Load variants for this chapter
    handleLoadVariants(data.fileName, projectName);
    return data;
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
        clearVariantState();
        setDebugPromptInfo(null);
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
        clearVariantState();
        setLastFilename('');
        setUserPrompt('');
        setShowSettings(false);
        clearSettingsDraft();
        setDebugPromptInfo(null);
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
      switchMobileView('shelf');
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
    hydrateSettingsDraft(details, projectName);
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
      const data = await ProjectsApi.updateProjectSettings(currentProject, getSettingsPayload());
      // Sync projectDetails
      setProjectDetails((prev) => prev ? {
        ...prev,
        ...getSavedSettings(data.project),
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
      const data = await ProjectsApi.loadOutline(projectName);
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
      const data = await ProjectsApi.saveOutline(currentProject, parsed);
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
      const data = await ProjectsApi.generateOutline(currentProject, model);
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
      const data = await ProjectsApi.exportProject(currentProject);
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
      const response = await ProjectsApi.backupProject(currentProject);
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
      const data = await ProjectsApi.rebuildSummary(currentProject);
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
      const data = await ProjectsApi.rebuildChapterIndex(currentProject);
      // Update projectDetails chapters
      if (data.chapters) data.chapters = normalizeChapters(data.chapters);
      setProjectDetails((prev) => prev ? { ...prev, chapters: data.chapters } : prev);
      // If the reading chapter no longer exists, clear reading
      if (readingChapter && !data.chapters.find((ch) => ch.fileName === readingChapter)) {
        setReadingChapter(null);
        setReadingContent('');
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
      await ProjectsApi.saveChapterTitle(currentProject, readingChapter, trimmed);
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
  const handleLoadRewritePrompt = () => {
    if (!currentProject || !readingChapter) return;
    // Get saved userPrompt from projectDetails, fallback to "继续写"
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
    const saved = ch?.userPrompt || '继续写';
    setRewritePrompt(saved);
    setShowRewriteInput(true);
  };


  const handleMobileSaveEdit = async () => {
    if (!currentProject || !readingChapter || mobileEditSaving) return;
    rememberLastProject(currentProject);
    setMobileEditSaving(true);
    setError('');
    try {
      await ProjectsApi.saveChapterContent(currentProject, readingChapter, { title: mobileEditTitle, content: mobileEditContent });
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

  const handleConfirmKeepChapter = async () => {
    if (!currentProject || !readingChapter) return;
    setError('');
    try {
      const data = await ProjectsApi.confirmKeepChapter(currentProject, readingChapter);
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

  const getProjectIntro = (project, details) => {
    const text = details?.summary || details?.world || details?.style || details?.editorialMemory || project?.intro || '';
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

  const handleOpenAllProjects = () => {
    if (sortedProjects.length === 0) {
      setNotification({ title: '暂无项目', message: '还没有项目，先创建一个吧' });
      return;
    }
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
    closeMobileOverlays();
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

  const openMobileSearch = () => {
    setShowMobileSearch(true);
    setMobileSearchQuery('');
    setMobileSearchIndex([]);
    setMobileSearchLoading(false);
    requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
  };

  const closeMobileSearch = () => {
    setShowMobileSearch(false);
    setMobileSearchQuery('');
    setMobileSearchIndex([]);
  };

  // 移动端搜索：输入变化后延迟调 API
  useEffect(() => {
    if (!mobileSearchQuery.trim()) {
      setMobileSearchIndex([]);
      return;
    }
    const timer = setTimeout(async () => {
      setMobileSearchLoading(true);
      try {
        const data = await ProjectsApi.searchProjects(mobileSearchQuery.trim(), 30);
        setMobileSearchIndex(data.results || []);
      } catch {
        setMobileSearchIndex([]);
      } finally {
        setMobileSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mobileSearchQuery]);

  const mobileSearchResults = useMemo(() => {
    return mobileSearchIndex;
  }, [mobileSearchIndex]);

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
      const focusTarget = result.settingKey === 'characters'
        ? 'characters'
        : result.settingKey === 'summary'
          ? 'summary'
          : result.settingKey === 'outline'
            ? ''
            : 'world';
      openSettingsEditor(details, result.projectName, focusTarget);
      navigateTo('project');
      return;
    }
    navigateTo('project');
  };

  // ---- 全局搜索 ----

  const handleSearchResultClick = async (result) => {
    if (!result?.projectName) return;
    desktopSearch.closeDesktopSearch();
    await handleSelectProject(result.projectName);
    if (result.type === 'chapter' && result.fileName) {
      await handleReadChapter(result.fileName, result.projectName);
      if (isMobile) navigateTo('chapter');
    } else if (result.type === 'setting') {
      const focusTarget = result.settingKey === 'characters'
        ? 'characters'
        : result.settingKey === 'summary'
          ? 'summary'
          : 'world';
      openSettingsEditor(projectDetails, result.projectName, focusTarget);
      if (isMobile) navigateTo('project');
    }
    if (!isMobile) setDesktopView('workbench');
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
    if (label === '素材') {
      if (!currentProject) {
        setNotification({ title: '请先选择项目', message: '需要打开一个项目后才能查看剧情素材。' });
        return;
      }
      setDesktopView('materials');
      setShowSettings(false);
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
      await ProjectsApi.saveChapterContent(currentProject, readingChapter, { title: readingChapterTitle, content: desktopEditorContent });
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

  const desktopChapters = normalizeChapters(chapters);
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

  if (auth.authChecking) {
    return <LoginScreen checkingAuth />;
  }

  if (!auth.isAuthenticated) {
    return (
      <LoginScreen
        loginPassword={auth.password}
        setLoginPassword={auth.setPassword}
        showPassword={auth.showPassword}
        setShowPassword={auth.setShowPassword}
        loginError={auth.loginError}
        setLoginError={auth.setLoginError}
        loggingIn={auth.loginLoading}
        handleLogin={auth.handleLogin}
      />
    );
  }

  return (
    <div ref={appScrollRef} className={`app${isMobile ? ' mobile-dark-app' : ''}${isMobile && mobileView === 'chapter' ? ' mobile-chapter-dark' : ''} mobile-reading-${readingTheme}`}>
      <h1>小墨匣
        {/* 退出：调用认证退出接口并清理本地登录状态，随后回到登录页。 */}
        <span className="logout-link" onClick={auth.handleLogout}>退出</span>
      </h1>
      {/* 新桌面工作台：桌面端会先渲染 ProjectWorkspacePage，后续旧 app-shell 仍需单独确认是否重复显示。 */}
      {!isMobile && (
        <ProjectWorkspacePage
          settingsDraft={settingsDraft}
          workspaceUi={workspaceUi}
          projectSelection={projectSelection}
          chapterSelection={chapterSelection}
          createForm={createForm}
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
          applyingVariant={applyingVariant}
          readingContentRef={readingContentRef}
          readingSectionRef={readingSectionRef}
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
          onCreateProject={handleCreateProject}
          onLoadOutline={handleLoadOutline}
          onSaveOutline={handleSaveOutline}
          onSetOutlineText={setOutlineText}
          onSetOutlineError={setOutlineError}
          onSetShowOutline={setShowOutline}
          onSetShowSettings={setShowSettings}
          onSetModel={setModel}
          onSetWritingPrefs={setWritingPrefs}
          onSetUserPrompt={setUserPrompt}
          onSetDesktopAiMode={setDesktopAiMode}
          onSetDesktopEditorContent={setDesktopEditorContent}
          onSetDesktopChapterQuery={setDesktopChapterQuery}
          onSetEditTitleValue={setEditTitleValue}
          onHandleLogout={auth.handleLogout}
          onHandleSelectProject={handleSelectProject}
          onHandleGenerate={handleGenerate}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onGenerateOutline={handleGenerateOutline}
          formatProjectUpdatedAt={formatProjectUpdatedAt}
          getProjectChapterCount={getProjectChapterCount}
          searchQuery={desktopSearch.searchQuery}
          onSearchQueryChange={desktopSearch.handleSearchQueryChange}
          searchResults={desktopSearch.searchResults}
          searchLoading={desktopSearch.searchLoading}
          showDesktopSearch={desktopSearch.showDesktopSearch}
          onOpenDesktopSearch={desktopSearch.openDesktopSearch}
          onCloseDesktopSearch={desktopSearch.closeDesktopSearch}
          onSearchResultClick={handleSearchResultClick}
          searchInputRef={desktopSearch.searchInputRef}
          onNotify={setNotification}
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
      <MobileShell>
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
          settingsDraft={settingsDraft}
          workspaceUi={workspaceUi}
          projectSelection={projectSelection}
          chapterSelection={chapterSelection}
          onReadChapter={handleReadChapter}
          onBackClick={onBackClick}
          createForm={createForm}
          handleCreateProject={handleCreateProject}
          handleOpenSettings={handleOpenSettings}
          showOutline={showOutline}
          setShowOutline={setShowOutline}
          handleLoadOutline={handleLoadOutline}
          showSettings={showSettings}
          mobileWorldRef={mobileWorldRef}
          mobileCharactersRef={mobileCharactersRef}
          mobileSummaryRef={mobileSummaryRef}
          enhancedPrompt={enhancedPrompt}
          handleSaveSettings={handleSaveSettings}
          outlineText={outlineText}
          setOutlineText={setOutlineText}
          setOutlineError={setOutlineError}
          outlineError={outlineError}
          handleSaveOutline={handleSaveOutline}
          outlineSaving={outlineSaving}
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
          readingTheme={readingTheme}
          setReadingTheme={setReadingTheme}
          readingFontSize={readingFontSize}
          setReadingFontSize={setReadingFontSize}
          variantPreview={variantPreview}
          readingContentRef={readingContentRef}
          handleReadingContentScroll={handleReadingContentScroll}
          showScrollTop={showScrollTop}
          handleScrollToTop={handleScrollToTop}
          debugPromptInfo={debugPromptInfo}
          handleOpenMobileWriting={handleOpenMobileWriting}
          setMobileEditTitle={setMobileEditTitle}
          setMobileEditContent={setMobileEditContent}
          mobileEditTitle={mobileEditTitle}
          mobileEditContent={mobileEditContent}
          handleMobileSaveEdit={handleMobileSaveEdit}
          mobileEditSaving={mobileEditSaving}
          variants={variants}
          handlePreviewVariant={handlePreviewVariant}
          handleApplyVariant={handleApplyVariant}
          applyingVariant={applyingVariant}
        />

        {/* ===== Mobile: Shelf View ===== */}
        {mobileView === 'shelf' && (
          <HomePage
            createForm={createForm}
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

      <AppNotification notification={notification} onClose={clearNotification} />
    </div>
  );
}

export default App;
