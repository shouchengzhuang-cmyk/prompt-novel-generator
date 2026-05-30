import GenerationProgress from '../components/GenerationProgress';

export default function ProjectWorkspacePage({
  desktopView,
  showCreateForm,
  currentProject,
  projectDetails,
  readingChapter,
  readingChapterTitle,
  readingContent,
  showRewriteInput,
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
  desktopRecentProjects,
  desktopProgressPercent,
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
  onEnsureDesktopSelectionForRewrite,
  onOpenSettings,
  onSaveSettings,
  onLoadRewritePrompt,
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
  onNotifyDevFeature,
  onSetRewritePrompt,
  onSetShowRewriteInput,
  onSetShowCreateForm,
  onSetCreateError,
  onSetDesktopView,
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
  onSetDesktopAiMode,
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
  onHandleGenerate,
  formatProjectUpdatedAt,
  getProjectChapterCount,
}) {
  const handleDesktopNav = onDesktopNav;
  const handleSelectProject = onSelectProject;
  const handleReadChapter = onReadChapter;
  const handleGenerate = onGenerate;
  const handleRegenerate = onRegenerate;
  const handleOpenSettings = onOpenSettings;
  const handleSaveSettings = onSaveSettings;
  const handleLoadRewritePrompt = onLoadRewritePrompt;
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
  const notifyDevFeature = onNotifyDevFeature;
  const prepareDesktopMode = onPrepareDesktopMode;
  const ensureDesktopSelectionForRewrite = onEnsureDesktopSelectionForRewrite;

  const getProjectIntro = (details) => {
    return details?.summary || details?.world || details?.style || '';
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
          <input placeholder="搜索项目 / 章节 / 角色 / 世界观" readOnly onFocus={() => notifyDevFeature('全局搜索')} />
          <kbd>⌘ K</kbd>
        </div>
        <div className="desktop-top-actions">
          {/* 新建项目：只打开桌面创建表单并清理创建错误，不会立即调用后端。 */}
          <button className="desktop-action primary" type="button" onClick={() => { onSetShowCreateForm(true); onSetCreateError(''); }}>＋ 新建项目</button>
          {/* 导入入口：当前仅触发开发中提示，不会上传文件或修改项目。 */}
          <button className="desktop-action" type="button" onClick={() => notifyDevFeature('导入')}>⇩ 导入</button>
          {/* 同步入口：当前仅触发开发中提示，不会请求后端同步。 */}
          <button className="desktop-action" type="button" onClick={() => notifyDevFeature('同步')}>⟳ 同步</button>
          {/* 通知入口：当前仅触发开发中提示，不会拉取通知数据。 */}
          <button className="desktop-icon-action" type="button" aria-label="通知" onClick={() => notifyDevFeature('通知中心')}>♢<em>3</em></button>
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
              {/* 项目设置：打开当前项目设定编辑面板，只切换编辑状态，不会立即保存。 */}
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
                {/* 新建空章节：当前没有后端接口，仅提示开发中，不会创建文件。 */}
                <button type="button" onClick={() => notifyDevFeature('新建空章节：当前后端还没有创建空章节接口')} disabled={!currentProject}>＋</button>
              </div>
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
              {/* 查看全部项目：只切换到桌面项目库视图，不重新保存当前正文。 */}
              <button type="button" onClick={() => onSetDesktopView('projects')}>查看全部</button>
            </div>
            {desktopRecentProjects.map((project, index) => (
              /* 打开最近项目：加载所选项目详情并更新 currentProject / projectDetails。 */
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
                  /* 打开项目：加载项目详情并切回工作台，会改变当前项目状态。 */
                  <button
                    key={project.name}
                    type="button"
                    className={currentProject === project.name ? 'active' : ''}
                    onClick={() => {
                      onHandleSelectProject(project.name);
                      onSetDesktopView('workbench');
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
                  {/* 章节标题区：标题旁的编辑按钮只进入编辑状态，实际保存需再点保存。 */}
                  <h2>
                    {readingChapterTitle || desktopCurrentChapter?.title || `第${desktopChapterNumber}章`}
                    {readingChapter !== '_streaming' && readingChapter && <button type="button" onClick={handleStartEditTitle}>✎</button>}
                  </h2>
                  <div className="desktop-tabs">
                    {['总览', '写作', '设定', '版本记录'].map((tab) => (
                      <button
                        key={tab}
                        className={tab === '写作' ? 'active' : ''}
                        type="button"
                        onClick={
                          tab === '设定'
                            ? () => { onSetDesktopView('settings'); handleOpenSettings(); }
                            : tab === '写作'
                              ? () => onSetDesktopView('workbench')
                              : () => notifyDevFeature(tab)
                        }
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
                  <input value={editTitleValue} onChange={(e) => onSetEditTitleValue(e.target.value)} autoFocus />
                  {/* 保存标题：把当前标题保存到服务器上的当前章节标题，不修改正文内容。 */}
                  <button className="btn" onClick={handleSaveTitle}>保存</button>
                  {/* 取消标题编辑：只退出本地标题编辑状态，不会保存输入内容。 */}
                  <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                </div>
              )}

              {(showSettings || showOutline) && (
                <div className="desktop-inline-panels">
                  {showSettings && (
                    <section className="settings-panel">
                      <h3>项目设定</h3>
                      <label>世界观设定</label>
                      <textarea className="settings-input" value={editWorld} onChange={(e) => onSetEditWorld(e.target.value)} rows={3} />
                      <label>人物设定</label>
                      <textarea className="settings-input" value={editCharacters} onChange={(e) => onSetEditCharacters(e.target.value)} rows={3} />
                      <label>写作规则</label>
                      <textarea className="settings-input" value={editStyle} onChange={(e) => onSetEditStyle(e.target.value)} rows={4} />
                      <label>剧情摘要</label>
                      <textarea className="settings-input" value={editSummary} onChange={(e) => onSetEditSummary(e.target.value)} rows={4} />
                      <div className="form-actions">
                        {/* 保存设定：把当前项目设定 PUT 到服务器，会覆盖服务器上的项目设定字段。 */}
                        <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>{savingSettings ? '保存中...' : '保存设定'}</button>
                        {/* 关闭设定：只关闭设定面板，不会自动保存未提交内容。 */}
                        <button className="btn btn-secondary" disabled={savingSettings} onClick={() => onSetShowSettings(false)}>关闭</button>
                      </div>
                    </section>
                  )}
                  {showOutline && (
                    <section className="settings-panel">
                      <h3>章节规划</h3>
                      <textarea className="settings-input" value={outlineText} onChange={(e) => { onSetOutlineText(e.target.value); onSetOutlineError(''); }} rows={10} />
                      {outlineError && <div className={outlineError === '已保存' ? '' : 'error'}>{outlineError}</div>}
                      <div className="form-actions">
                        {/* 保存规划：把当前大纲 JSON 保存到服务器，会覆盖当前项目的大纲内容。 */}
                        <button className="btn" onClick={onSaveOutline} disabled={outlineSaving}>{outlineSaving ? '保存中...' : '保存规划'}</button>
                        {/* 关闭规划：只关闭大纲编辑面板并清理错误提示，不会保存文本。 */}
                        <button className="btn btn-secondary" onClick={() => { onSetShowOutline(false); onSetOutlineError(''); }}>关闭</button>
                      </div>
                    </section>
                  )}
                </div>
              )}

              <div className="desktop-writing-brief">
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
                    {/* 确认保留：调用后端接口清除当前章节的待检查标记，不改写正文。 */}
                    <button className="btn btn-secondary" onClick={handleConfirmKeepChapter}>确认保留</button>
                    {/* 重写本章：只打开/加载重写输入，不会立刻覆盖正文。 */}
                    <button className="btn" onClick={() => { if (!showRewriteInput) handleLoadRewritePrompt(); }}>重写本章</button>
                  </div>
                </div>
              )}

              <div className="desktop-editor-actions">
                {/* 继续生成：基于当前项目上下文调用生成接口，成功后刷新章节列表和当前正文。 */}
                <button className="btn" onClick={() => { onSetDesktopAiMode('continue'); onHandleGenerate(); }} disabled={loading || regenerating}>{loading ? '生成中...' : '继续生成'}</button>
                {/* 改写选中段落：只准备改写模式并校验当前选区，不直接调用生成接口或覆盖正文。 */}
                <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('rewrite'); ensureDesktopSelectionForRewrite('改写'); }} disabled={!readingChapter || readingChapter === '_streaming'}>
                  {showRewriteInput ? '取消改写' : '改写选中段落'}
                </button>
                {/* 润色：切换到润色候选生成模式并要求选中文本，不会立即覆盖正文。 */}
                <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('polish'); ensureDesktopSelectionForRewrite('润色'); }}>润色</button>
                {/* 扩写：切换到扩写候选生成模式并要求选中文本，不会立即覆盖正文。 */}
                <button className="btn btn-secondary" onClick={() => { prepareDesktopMode('expand'); ensureDesktopSelectionForRewrite('扩写'); }}>扩写</button>
                {/* 保存草稿：把当前编辑器正文 PUT 到当前章节文件，会覆盖服务器端该章节正文。 */}
                <button className="btn btn-secondary" onClick={onDesktopSaveContent} disabled={!readingChapter || readingChapter === '_streaming' || desktopSavingContent || !!variantPreview}>
                  {desktopSavingContent ? '保存中...' : '保存草稿'}
                </button>
              </div>

              {showRewriteInput && (
                <div className="rewrite-input-area desktop-rewrite-area">
                  <h3>本次改写要求</h3>
                  <textarea className="prompt-input" value={rewritePrompt} onChange={(e) => onSetRewritePrompt(e.target.value)} placeholder="这次想怎么改写？" rows={4} />
                  {/* 生成候选版本：根据当前章节和改写要求调用后端生成接口，只生成候选，不直接覆盖正文。 */}
                  <button className="btn" onClick={handleRegenerate} disabled={regenerating || loading}>{regenerating ? '生成中...' : '生成候选版本'}</button>
                </div>
              )}

              <GenerationProgress visible={genProgress.visible} mode={genProgress.mode} status={genProgress.status} errorMessage={genProgress.errorMessage} onComplete={handleGenProgressDone} />
              {error && <div className="error">{error}</div>}

              <footer className="desktop-editor-status">
                <span>自动保存已开启</span>
                <span>第 {desktopChapterNumber} 章 · {desktopChapterWords.toLocaleString()} 字</span>
                <span>目标 4,000 字</span>
                <div><i style={{ width: `${desktopProgressPercent}%` }}></i></div>
                <strong>{desktopProgressPercent}%</strong>
              </footer>
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
              {/* 收起 AI 控制台：当前仅提示开发中，不会改变生成状态或保存内容。 */}
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
            <label>写作参数</label>
            <div className="desktop-param-list">
              <select value={writingPrefs.style} onChange={(e) => onSetWritingPrefs({ ...writingPrefs, style: e.target.value })}>
                <option value="">文风：默认</option>
                <option value="玄幻 · 古典">玄幻 · 古典</option>
                <option value="冷静克制">冷静克制</option>
                <option value="轻小说">轻小说</option>
              </select>
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
              <div className="desktop-range-row"><span>温度</span><input type="range" min="0" max="1" step="0.1" defaultValue="0.7" disabled title="高级参数开发中" /><strong>0.7</strong></div>
            </div>
            <label>本轮要求</label>
            <textarea className="prompt-input" value={showRewriteInput ? rewritePrompt : userPrompt} onChange={(e) => showRewriteInput ? onSetRewritePrompt(e.target.value) : onSetUserPrompt(e.target.value)} placeholder="保持克制暧昧的气氛，推进人物试探，不要过快摊牌。" rows={5} />
            <label>关联设定</label>
            <div className="desktop-linked-settings">
              {/* 关联设定入口：打开项目设定面板，只切换编辑状态，不立即保存。 */}
              <button type="button" onClick={handleOpenSettings}>世界观：{projectDetails?.world ? '已挂载' : '待补充'}</button>
              {/* 关联设定入口：打开项目设定面板，只切换编辑状态，不立即保存。 */}
              <button type="button" onClick={handleOpenSettings}>人物：{projectDetails?.characters ? '已挂载' : '待补充'}</button>
              {/* 关联设定入口：打开项目设定面板，只切换编辑状态，不立即保存。 */}
              <button type="button" onClick={handleOpenSettings}>关系：编辑记忆</button>
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
              <h2>候选续写（{variants.length}）</h2>
              {/* 对比模式：当前仅触发开发中提示，不会应用候选或修改正文。 */}
              <button type="button" onClick={() => notifyDevFeature('对比模式')}>对比模式</button>
            </div>
            <div className="desktop-candidate-list">
              {variants.length > 0 ? variants.slice(0, 6).map((v, index) => (
                <article className={variantPreview?.id === v.id ? 'active' : ''} key={v.id}>
                  <strong>候选 {index + 1}{index === 0 ? '（推荐）' : ''}</strong>
                  <p>{(v.content || '').slice(0, 76)}{(v.content || '').length > 76 ? '...' : ''}</p>
                  <div>
                    {/* 采用候选：把指定候选版本应用为当前章节主线内容，会改变正文版本。 */}
                    <button type="button" onClick={() => handleDesktopApplyVariant(v.id)} disabled={applyingVariant}>采用</button>
                    {/* 对比候选：只预览候选并提示对比模式开发中，不会应用到正文。 */}
                    <button type="button" onClick={() => { handlePreviewVariant(v); notifyDevFeature('对比模式'); }}>对比</button>
                    {/* 再来一版：再次调用重写/生成候选接口，只新增候选，不直接覆盖正文。 */}
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
  );
}
