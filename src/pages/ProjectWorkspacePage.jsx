import GenerationProgress from '../components/GenerationProgress';
import DesktopEditorTabs from '../components/desktop/DesktopEditorTabs';
import DesktopMainNav from '../components/desktop/DesktopMainNav';
import DesktopProjectLibrary from '../components/desktop/DesktopProjectLibrary';
import DesktopProjectRail from '../components/desktop/DesktopProjectRail';
import DesktopTopBar from '../components/desktop/DesktopTopBar';
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

  const handleNavigateToChapter = (chapterFileName) => {
    onSetDesktopView('workbench');
    if (chapterFileName && onReadChapter) {
      onReadChapter(chapterFileName);
    }
  };

  return (
    <div className="desktop-workbench">
      <DesktopTopBar
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        searchLoading={searchLoading}
        searchResults={searchResults}
        showDesktopSearch={showDesktopSearch}
        onSearchQueryChange={onSearchQueryChange}
        onOpenDesktopSearch={onOpenDesktopSearch}
        onCloseDesktopSearch={onCloseDesktopSearch}
        onSearchResultClick={onSearchResultClick}
        onSetShowCreateForm={onSetShowCreateForm}
        onSetCreateError={onSetCreateError}
        onHandleLogout={onHandleLogout}
      />

      <div className="desktop-layout">
        <DesktopMainNav desktopView={desktopView} onDesktopNav={handleDesktopNav} />

        <DesktopProjectRail
          currentProject={currentProject}
          projectDetails={projectDetails}
          desktopTotalWords={desktopTotalWords}
          desktopChapters={desktopChapters}
          sortedProjects={sortedProjects}
          desktopChapterQuery={desktopChapterQuery}
          filteredDesktopChapters={filteredDesktopChapters}
          readingChapter={readingChapter}
          onSetDesktopEditorTab={onSetDesktopEditorTab}
          onOpenSettings={onOpenSettings}
          onRenameProject={onRenameProject}
          onSetDesktopChapterQuery={onSetDesktopChapterQuery}
          onReadChapter={onReadChapter}
          formatProjectUpdatedAt={formatProjectUpdatedAt}
        />

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
            <DesktopProjectLibrary
              sortedProjects={sortedProjects}
              currentProject={currentProject}
              onHandleSelectProject={onHandleSelectProject}
              onSetDesktopView={onSetDesktopView}
              onSetShowCreateForm={onSetShowCreateForm}
              onSetCreateError={onSetCreateError}
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
              formatProjectUpdatedAt={formatProjectUpdatedAt}
              getProjectChapterCount={getProjectChapterCount}
            />
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
                  <DesktopEditorTabs
                    desktopEditorTab={desktopEditorTab}
                    onSetDesktopEditorTab={onSetDesktopEditorTab}
                    onOpenSettings={onOpenSettings}
                  />
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
