import GenerationProgress from '../components/GenerationProgress';
import MaterialPanel from '../components/material/MaterialPanel';

export default function ProjectWorkspacePage({
  desktopView,
  desktopEditorTab,
  showCreateForm,
  currentProject,
  projectDetails,
  readingChapter,
  readingChapterTitle,
  readingContent,
  rewritePrompt,
  variants,
  variantPreview,
  editingTitle,
  editTitleValue,
  exportStatus,
  error,
  loading,
  regenerating,
  model,
  writingPrefs,
  userPrompt,
  editWorld,
  editCharacters,
  editStyle,
  editSummary,
  editEditorialMemory,
  editingProjectName,
  showSettings,
  showOutline,
  outlineSaving,
  outlineError,
  outlineText,
  desktopAiMode,
  desktopEditorContent,
  desktopSavingContent,
  desktopChapterQuery,
  debugPromptInfo,
  genProgress,
  copied,
  savingSettings,
  applyingVariant,
  readingContentRef,
  readingSectionRef,
  creating,
  newProjectName,
  newWorld,
  newCharacters,
  newStyle,
  newSummary,
  createError,
  desktopChapters,
  filteredDesktopChapters,
  desktopCurrentChapter,
  desktopChapterNumber,
  desktopChapterWords,
  desktopTotalWords,
  desktopLastSaved,
  sortedProjects,
  enhancedPrompt,
  enhancedRewritePrompt,
  outline,
  readingChapterRecord,
  onDesktopNav,
  onSelectProject,
  onReadChapter,
  onGenerate,
  onRegenerate,
  onDesktopSaveContent,
  onDesktopGenerateByMode,
  onPrepareDesktopMode,
  onOpenSettings,
  onSaveSettings,
  onStartEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onExport,
  onBackup,
  onRebuildIndex,
  onConfirmKeepChapter,
  onPreviewVariant,
  onDesktopApplyVariant,
  onApplyVariant,
  onGenProgressDone,
  onCopyChapter,
  onCopyFull,
  onSetRewritePrompt,
  onSetShowCreateForm,
  onSetCreateError,
  onSetDesktopView,
  onSetDesktopEditorTab,
  onCreateProject,
  onLoadOutline,
  onSaveOutline,
  onSetEditWorld,
  onSetEditCharacters,
  onSetEditStyle,
  onSetEditSummary,
  onSetEditEditorialMemory,
  onSetShowOutline,
  onSetShowSettings,
  onSetModel,
  onSetWritingPrefs,
  onSetUserPrompt,
  onSetDesktopEditorContent,
  onSetDesktopChapterQuery,
  onSetEditTitleValue,
  onSetNewProjectName,
  onSetNewWorld,
  onSetNewCharacters,
  onSetNewStyle,
  onSetNewSummary,
  onSetOutlineText,
  onSetOutlineError,
  onHandleLogout,
  onHandleSelectProject,
  onRenameProject,
  onDeleteProject,
  onGenerateOutline,
  formatProjectUpdatedAt,
  getProjectChapterCount,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchLoading,
  showDesktopSearch,
  onOpenDesktopSearch,
  onCloseDesktopSearch,
  onSearchResultClick,
  searchInputRef,
  onNotify,
}) {
  const handleDesktopNav = onDesktopNav;
  const handleSelectProject = onSelectProject;
  const handleReadChapter = onReadChapter;
  const handleGenerate = onGenerate;
  const handleRegenerate = onRegenerate;
  const handleOpenSettings = onOpenSettings;
  const handleSaveSettings = onSaveSettings;
  const handleStartEditTitle = onStartEditTitle;
  const handleSaveTitle = onSaveTitle;
  const handleCancelEditTitle = onCancelEditTitle;
  const handleExport = onExport;
  const handleBackup = onBackup;
  const handleRebuildIndex = onRebuildIndex;
  const handleConfirmKeepChapter = onConfirmKeepChapter;
  const handlePreviewVariant = onPreviewVariant;
  const handleDesktopApplyVariant = onDesktopApplyVariant;
  const handleApplyVariant = onApplyVariant;
  const handleGenProgressDone = onGenProgressDone;
  const handleCopyChapter = onCopyChapter;
  const handleCopyFull = onCopyFull;
  const prepareDesktopMode = onPrepareDesktopMode;

  const getProjectIntro = (details) => {
    return details?.summary || details?.world || details?.style || '';
  };

  const handleNavigateToChapter = (chapterFileName) => {
    onSetDesktopView('workbench');
    if (chapterFileName && onReadChapter) {
      onReadChapter(chapterFileName);
    }
  };

  return (
    <div className="desktop-workbench">
      <header className="desktop-topbar">
        <div className="desktop-brand">
          <span className="desktop-logo" aria-hidden="true"></span>
          <span>小墨匣</span>
        </div>
        <div className="desktop-search">
          <span>⌕</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onFocus={onOpenDesktopSearch}
            placeholder="搜索项目 / 章节 / 角色 / 世界观"
          />
          <kbd>⌘ K</kbd>
          {showDesktopSearch && (
            <div className="desktop-search-results" onClick={(e) => e.stopPropagation()}>
              {searchLoading ? (
                <div className="desktop-search-status">正在搜索...</div>
              ) : !searchQuery.trim() ? (
                <div className="desktop-search-status">输入关键词搜索项目名、章节、设定</div>
              ) : searchResults.length === 0 ? (
                <div className="desktop-search-status">没有找到匹配结果</div>
              ) : (
                <div className="desktop-search-list">
                  {searchResults.map((r, i) => (
                    <button
                      key={`${r.projectName}-${r.type}-${r.fileName || r.settingKey || i}`}
                      className="desktop-search-result"
                      type="button"
                      onClick={() => onSearchResultClick(r)}
                    >
                      <span className="desktop-search-tag">
                        {r.type === 'project' ? '项目' : r.type === 'chapter' ? '章节' : '设定'}
                      </span>
                      <strong>{r.projectName}{r.title ? ` · ${r.title}` : ''}</strong>
                      {r.snippet && <span className="desktop-search-snippet">{r.snippet}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {showDesktopSearch && <div className="desktop-search-backdrop" onClick={onCloseDesktopSearch} />}
        </div>
        <div className="desktop-top-actions">
          {/* 新建项目：只打开桌面创建表单并清理创建错误，不会立即调用后端。 */}
          <button className="desktop-action primary" type="button" onClick={() => { onSetShowCreateForm(true); onSetCreateError(''); }}>＋ 新建项目</button>
          {/* 退出登录：调用父级退出流程，预期会请求认证退出接口并回到登录状态。 */}
          <button className="desktop-avatar" type="button" onClick={onHandleLogout} title="退出登录">墨</button>
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
            ['◇', '素材'],
            ['☰', '大纲'],
            ['⚙', '设置'],
          ].map(([icon, label]) => {
            const navActive =
              (label === '工作台' && desktopView === 'workbench') ||
              (label === '项目库' && desktopView === 'projects') ||
              (label === '世界观' && desktopView === 'world') ||
              (label === '人物' && desktopView === 'characters') ||
              (label === '章节' && desktopView === 'workbench') ||
              (label === '素材' && desktopView === 'materials') ||
              (label === '大纲' && desktopView === 'outline') ||
              (label === '设置' && desktopView === 'settings');
            return (
            /* 桌面主导航：根据 label 切换前端工作区视图；未实现项只显示开发中提示。 */
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
        </nav>

        <aside className="desktop-project-rail">
          <section className="desktop-card desktop-current-project">
            <div className="desktop-card-head">
              <h2>当前项目</h2>
              {/* 项目设置：切换到设定页签编辑当前项目设定。 */}
              <button type="button" onClick={() => { onSetDesktopEditorTab('settings'); handleOpenSettings(); }}>⚙</button>
            </div>
            {currentProject ? (
              <>
                <div className="desktop-project-cover">
                  <span>{currentProject.slice(0, 1)}</span>
                  <div>
                    <h3>
                      {currentProject}
                      {/* 重命名当前项目：弹窗编辑项目名。 */}
                      <button type="button" className="desktop-project-rename-btn" title="重命名" onClick={(e) => {
                        e.stopPropagation();
                        const newName = window.prompt(`将「${currentProject}」重命名为：`, currentProject);
                        if (newName && newName.trim() !== currentProject) {
                          onRenameProject(currentProject, newName.trim());
                        }
                      }}>✎</button>
                    </h3>
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
            </div>
            <div className="desktop-chapter-search">
              <input
                value={desktopChapterQuery}
                onChange={(e) => onSetDesktopChapterQuery(e.target.value)}
                placeholder="搜索章节标题 / 摘要"
              />
            </div>
            <div className="desktop-chapter-list">
              {filteredDesktopChapters.length > 0 ? filteredDesktopChapters.map((ch, index) => {
                const cf = ch.fileName || ch.filename;
                const isActive = cf && readingChapter === cf;
                const chapterNo = desktopChapters.findIndex((item) => (item.fileName || item.filename) === cf) + 1 || index + 1;
                return (
                  /* 打开章节：读取该章节正文和候选版本，会更新当前阅读/编辑状态。 */
                  <button
                    key={cf || `chapter-${index}`}
                    className={isActive ? 'active' : ''}
                    type="button"
                    disabled={!cf}
                    onClick={() => { if (cf) { handleReadChapter(cf); onSetDesktopEditorTab('writing'); } }}
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

        </aside>

        <main className="desktop-writing-main">
          {showCreateForm ? (
            <section className="desktop-card desktop-create-panel">
              <h2>创建新项目</h2>
              <label>项目名</label>
              <input value={newProjectName} onChange={(e) => onSetNewProjectName(e.target.value)} placeholder="输入项目名称" />
              <label>世界观设定</label>
              <textarea value={newWorld} onChange={(e) => onSetNewWorld(e.target.value)} placeholder="描述世界观设定..." rows={4} />
              <label>人物设定</label>
              <textarea value={newCharacters} onChange={(e) => onSetNewCharacters(e.target.value)} placeholder="描述主要人物..." rows={4} />
              <label>写作规则 / 风格要求</label>
              <textarea value={newStyle} onChange={(e) => onSetNewStyle(e.target.value)} placeholder="文风要求、篇幅要求、写作规则…" rows={5} />
              <label>剧情摘要（可选）</label>
              <textarea value={newSummary} onChange={(e) => onSetNewSummary(e.target.value)} placeholder="剧情摘要…" rows={3} />
              {createError && <div className="error">{createError}</div>}
              <div className="desktop-editor-actions">
                {/* 创建项目：提交桌面创建表单，预期调用后端创建项目接口并刷新项目列表。 */}
                <button className="btn" disabled={creating} onClick={onCreateProject}>{creating ? '创建中...' : '创建项目'}</button>
                {/* 取消创建：只关闭创建表单并清理错误状态，不会保存表单内容。 */}
                <button className="btn btn-secondary" disabled={creating} onClick={() => { onSetShowCreateForm(false); onSetCreateError(''); }}>取消</button>
              </div>
            </section>
          ) : desktopView === 'projects' ? (
            <section className="desktop-card desktop-project-library">
              <div className="desktop-editor-head">
                <div>
                  <h2>项目库</h2>
                  <div className="desktop-tabs">
                    {/* 全部项目标签：当前是静态选中态，不触发请求或切换逻辑。 */}
                    <button className="active" type="button">全部项目</button>
                  </div>
                </div>
                {/* 新建项目：打开创建项目表单并清理错误状态，不会立即请求后端。 */}
                <button className="btn" type="button" onClick={() => { onSetShowCreateForm(true); onSetCreateError(''); }}>新建项目</button>
              </div>
              <div className="desktop-library-list">
                {sortedProjects.length > 0 ? sortedProjects.map((project) => (
                  <div key={project.name} className="desktop-library-item">
                    {/* 打开项目：加载项目详情并切回工作台，会改变当前项目状态。 */}
                    <button
                      type="button"
                      className={"desktop-library-item-main" + (currentProject === project.name ? ' active' : '')}
                      onClick={() => {
                        onHandleSelectProject(project.name);
                        onSetDesktopView('workbench');
                      }}
                    >
                      <strong>{project.name}</strong>
                      <span>{formatProjectUpdatedAt(project.updatedAt)} · {getProjectChapterCount(project)} 章 · {(Number(project.totalWords) || 0).toLocaleString()} 字</span>
                    </button>
                    <div className="desktop-library-item-actions">
                      {/* 重命名项目：弹窗编辑项目名，不会立即请求后端。 */}
                      <button type="button" className="desktop-library-action" title="重命名" onClick={(e) => {
                        e.stopPropagation();
                        const newName = window.prompt(`将「${project.name}」重命名为：`, project.name);
                        if (newName && newName.trim() !== project.name) {
                          onRenameProject(project.name, newName.trim());
                        }
                      }}>✎</button>
                      {/* 删除项目：二次确认后删除，不可恢复。 */}
                      <button type="button" className="desktop-library-action danger" title="删除" onClick={(e) => {
                        onDeleteProject(project.name, e);
                      }}>✕</button>
                    </div>
                  </div>
                )) : (
                  <p className="desktop-empty">暂无项目，请先创建一个小说项目。</p>
                )}
              </div>
            </section>
          ) : desktopView === 'materials' && currentProject ? (
            <section className="desktop-card material-card-wrap">
              <MaterialPanel currentProject={currentProject} onNotify={onNotify} onNavigateToChapter={handleNavigateToChapter} />
            </section>
          ) : currentProject ? (
            <section className="desktop-card desktop-editor-shell">
              <div className="desktop-editor-head">
                <div>
                  {/* 章节标题区：标题旁的编辑按钮只进入编辑状态，实际保存需再点保存。 */}
                  <h2>
                    {readingChapterTitle || desktopCurrentChapter?.title || `第${desktopChapterNumber}章`}
                    {readingChapter !== '_streaming' && readingChapter && <button type="button" onClick={handleStartEditTitle}>✎</button>}
                  </h2>
                  <div className="desktop-tabs">
                    {['总览', '写作', '设定', '版本记录'].map((tab) => {
                      const tabKey = tab === '总览' ? 'overview' : tab === '写作' ? 'writing' : tab === '设定' ? 'settings' : 'versions';
                      return (
                        <button
                          key={tab}
                          className={desktopEditorTab === tabKey ? 'active' : ''}
                          type="button"
                          onClick={() => {
                            onSetDesktopEditorTab(tabKey);
                            if (tabKey === 'settings') handleOpenSettings();
                          }}
                        >
                          {tab}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="desktop-save-state">
                  <strong>本章字数 {desktopChapterWords.toLocaleString()}</strong>
                  <span>{desktopLastSaved} · {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {desktopEditorTab === 'overview' && (
                <div className="desktop-overview-panel">
                  <h3>章节总览</h3>
                  <p>当前项目 {currentProject}，共 {desktopChapters.length} 章，总计 {desktopTotalWords.toLocaleString()} 字。</p>
                  <p>{projectDetails?.summary || '暂无剧情摘要，可在设定页签中补充。'}</p>
                </div>
              )}

              {desktopEditorTab === 'writing' && (
                <>
                  {editingTitle && (
                    <div className="desktop-title-edit">
                      <input value={editTitleValue} onChange={(e) => onSetEditTitleValue(e.target.value)} autoFocus />
                      <button className="btn" onClick={handleSaveTitle}>保存</button>
                      <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                    </div>
                  )}

                  <div className="desktop-editor-toolbar">
                    <span>正文</span>
                    <em>{desktopChapterWords.toLocaleString()} 字</em>
                  </div>

                  <textarea
                    className="desktop-manuscript"
                    ref={readingContentRef}
                    value={desktopEditorContent}
                    onChange={(e) => onSetDesktopEditorContent(e.target.value)}
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
                        <button className="btn" onClick={() => prepareDesktopMode('rewrite')}>重写本章</button>
                      </div>
                    </div>
                  )}

                  <div className="desktop-editor-actions">
                    <button className="btn" onClick={onDesktopGenerateByMode} disabled={loading || regenerating}>{loading ? '生成中...' : '继续生成'}</button>
                    <button className="btn btn-secondary" onClick={() => prepareDesktopMode('rewrite')} disabled={!readingChapter || readingChapter === '_streaming'}>改写</button>
                    <button className="btn btn-secondary" onClick={onDesktopSaveContent} disabled={!readingChapter || readingChapter === '_streaming' || desktopSavingContent || !!variantPreview}>
                      {desktopSavingContent ? '保存中...' : '保存草稿'}
                    </button>
                  </div>

                  <GenerationProgress visible={genProgress.visible} mode={genProgress.mode} status={genProgress.status} errorMessage={genProgress.errorMessage} onComplete={handleGenProgressDone} />
                  {error && <div className="error">{error}</div>}

                  <footer className="desktop-editor-status">
                    <span>自动保存已开启</span>
                    <span>第 {desktopChapterNumber} 章 · {desktopChapterWords.toLocaleString()} 字</span>
                    <span>本书总字数 · {desktopTotalWords.toLocaleString()} 字</span>
                  </footer>
                </>
              )}

              {desktopEditorTab === 'settings' && (
                <div className="desktop-settings-wrapper">
                  <div className="desktop-settings-grid">
                    <div className="desktop-settings-field">
                      <label>世界观设定</label>
                      <textarea className="settings-input" value={editWorld} onChange={(e) => onSetEditWorld(e.target.value)} />
                    </div>
                    <div className="desktop-settings-field">
                      <label>人物设定</label>
                      <textarea className="settings-input" value={editCharacters} onChange={(e) => onSetEditCharacters(e.target.value)} />
                    </div>
                    <div className="desktop-settings-field">
                      <label>写作规则</label>
                      <textarea className="settings-input" value={editStyle} onChange={(e) => onSetEditStyle(e.target.value)} />
                    </div>
                    <div className="desktop-settings-field">
                      <label>剧情摘要</label>
                      <textarea className="settings-input" value={editSummary} onChange={(e) => onSetEditSummary(e.target.value)} />
                    </div>
                  </div>
                  <div className="desktop-settings-footer">
                    <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>{savingSettings ? '保存中...' : '保存设定'}</button>
                  </div>
                </div>
              )}

              {showOutline && (
                <div className="desktop-inline-panels">
                  <section className="settings-panel">
                    <h3>章节大纲</h3>
                    <p className="desktop-outline-hint">
                      每章一条 JSON，字段：number（章节号）, goal（本章目标）, keyEvents（关键事件数组）, characterChanges（人物变化）, status（状态）。该大纲会在续写时自动注入生成上下文。
                    </p>
                    <textarea className="settings-input" value={outlineText} onChange={(e) => { onSetOutlineText(e.target.value); onSetOutlineError(''); }} rows={10} placeholder='[{"number":1,"goal":"本章目标","keyEvents":["事件1","事件2"],"characterChanges":"人物变化","status":"planned"}]' />
                    {outlineError && <div className={outlineError === '已保存' || outlineError === '已生成' ? '' : 'error'}>{outlineError}</div>}
                    <div className="form-actions">
                      <button className="btn" onClick={onSaveOutline} disabled={outlineSaving}>{outlineSaving ? '保存中...' : '保存大纲'}</button>
                      <button className="btn btn-secondary" onClick={onGenerateOutline} disabled={outlineSaving}>生成大纲</button>
                      <button className="btn btn-secondary" onClick={() => { onSetShowOutline(false); onSetOutlineError(''); }}>关闭</button>
                    </div>
                  </section>
                </div>
              )}

              {desktopEditorTab === 'versions' && (
                <div className="desktop-versions-panel">
                  <h3>版本记录</h3>
                  {variants.length > 0 ? (
                    variants.map((v, index) => (
                      <div key={v.id} className="version-item">
                        <strong>候选版本 {index + 1}</strong>
                        <p>{(v.content || '').slice(0, 120)}...</p>
                      </div>
                    ))
                  ) : (
                    <p>暂无版本记录。生成候选版本后会在这里展示。</p>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="desktop-card desktop-empty-main">
              <h2>选择一个项目开始写作</h2>
              <p>小墨匣会把小说项目、章节、人物与世界观设定放在同一个写作工作台里。</p>
              {/* 空态新建项目：只打开创建项目表单并清理错误状态，不会立即请求后端。 */}
              <button className="btn" onClick={() => { onSetShowCreateForm(true); onSetCreateError(''); }}>新建项目</button>
            </section>
          )}
        </main>

        <aside className="desktop-ai-panel">
          <section className="desktop-card desktop-ai-card">
            <div className="desktop-card-head">
              <h2>AI 写作控制台</h2>
            </div>
            <label>创作模式</label>
            <div className="desktop-mode-grid">
              {[
                ['continue', '续写'],
                ['rewrite', '改写'],
              ].map(([mode, label]) => (
                /* 创作模式：只切换本地 AI 模式/预置改写要求，不会立即调用生成接口。 */
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
            <label>模型选择</label>
            <div className="desktop-model-grid">
              {[
                { value: 'deepseek-v4-flash', title: '快速模式', sub: '适合日常续写' },
                { value: 'deepseek-v4-pro', title: '深度模式', sub: '适合复杂伏笔' },
              ].map((item) => (
                <button
                  key={item.value}
                  className={model === item.value ? 'active' : ''}
                  type="button"
                  onClick={() => onSetModel(item.value)}
                >
                  <strong>{item.title}</strong>
                  <small>{item.sub}</small>
                </button>
              ))}
            </div>
            <label>写作参数</label>
            <div className="desktop-param-list">
              <select value={writingPrefs.characterConsistency} onChange={(e) => onSetWritingPrefs({ ...writingPrefs, characterConsistency: e.target.value })}>
                <option value="strict">视角：人物一致</option>
                <option value="natural">视角：自然推进</option>
              </select>
              <select value={writingPrefs.paragraph} onChange={(e) => onSetWritingPrefs({ ...writingPrefs, paragraph: e.target.value })}>
                <option value="short">篇幅：短段</option>
                <option value="normal">篇幅：中等</option>
                <option value="long">篇幅：长段</option>
              </select>
              <select value={writingPrefs.pace} onChange={(e) => onSetWritingPrefs({ ...writingPrefs, pace: e.target.value })}>
                <option value="slow">节奏：慢热</option>
                <option value="normal">节奏：正常</option>
                <option value="fast">节奏：快一点</option>
              </select>
            </div>
            <label>{desktopAiMode === 'continue' ? '本轮要求' : '改写要求'}</label>
            <textarea
              className="prompt-input"
              value={desktopAiMode === 'continue' ? userPrompt : rewritePrompt}
              onChange={(e) => desktopAiMode === 'continue' ? onSetUserPrompt(e.target.value) : onSetRewritePrompt(e.target.value)}
              placeholder={
                desktopAiMode === 'continue' ? '保持克制暧昧的气氛，推进人物试探，不要过快摊牌。'
                : '说明你想怎么改写当前正文，例如：压低文风、增强心理描写、减少直白对白、保留剧情但换表达。'
              }
              rows={5}
            />
            <label>关联设定</label>
            <div className="desktop-linked-settings">
              {/* 关联设定入口：切换到设定页签编辑项目设定。 */}
              <button type="button" onClick={() => { onSetDesktopEditorTab('settings'); handleOpenSettings(); }}>世界观：{projectDetails?.world ? '已挂载' : '待补充'}</button>
              {/* 关联设定入口：切换到设定页签编辑项目设定。 */}
              <button type="button" onClick={() => { onSetDesktopEditorTab('settings'); handleOpenSettings(); }}>人物：{projectDetails?.characters ? '已挂载' : '待补充'}</button>
              {/* 关联设定入口：切换到设定页签编辑项目设定。 */}
              <button type="button" onClick={() => { onSetDesktopEditorTab('settings'); handleOpenSettings(); }}>关系：编辑记忆</button>
              {/* 章节大纲入口：切换到大纲编辑面板。 */}
              <button type="button" onClick={() => { onSetShowOutline(true); onLoadOutline(); }}>章节大纲：{outline.length > 0 ? '已挂载' : '未填写'}</button>
            </div>
            {/* 生成候选：按当前 AI 模式调用生成/改写流程；候选模式不会直接覆盖正文。 */}
            <button className="desktop-generate-btn" type="button" onClick={onDesktopGenerateByMode} disabled={loading || regenerating || !currentProject}>
              {loading || regenerating ? '生成中...' : '生成候选'}
            </button>
            {/* 应用到正文：把当前候选版本写入主线正文，是会改变当前章节内容的危险操作。 */}
            <button className="desktop-apply-btn" type="button" disabled={!variantPreview || applyingVariant} onClick={() => handleDesktopApplyVariant()}>
              {applyingVariant ? '应用中...' : '应用到正文'}
            </button>
          </section>

          <section className="desktop-card desktop-candidates">
            <div className="desktop-card-head">
              <h2>{desktopAiMode === 'continue' ? '候选续写' : '候选改写'}（{variants.length}）</h2>
            </div>
            <div className="desktop-candidate-list">
              {variants.length > 0 ? variants.slice(0, 6).map((v, index) => (
                <article className={variantPreview?.id === v.id ? 'active' : ''} key={v.id}>
                  <strong>候选 {index + 1}{index === 0 ? '（推荐）' : ''}</strong>
                  <p>{(v.content || '').slice(0, 76)}{(v.content || '').length > 76 ? '...' : ''}</p>
                  <div>
                    {/* 采用候选：把指定候选版本应用为当前章节主线内容，会改变正文版本。 */}
                    <button type="button" onClick={() => handleDesktopApplyVariant(v.id)} disabled={applyingVariant}>采用</button>
                    {/* 预览候选：在正文编辑区预览候选版本，不覆盖正文。 */}
                    <button type="button" onClick={() => handlePreviewVariant(v)}>预览</button>
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
  );
}
