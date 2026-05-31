import GenerationProgress from '../../components/GenerationProgress';
import PromptPreviewPanel from '../../components/PromptPreviewPanel';
import VaultPanel from '../../components/VaultPanel';
import WritingControlPanel from '../../components/WritingControlPanel';

export default function MobileReaderEditorPage(props) {
  const {
    isMobile,
    mobileView,
    readingChapter,
    onBackClick,
    readingChapterTitle,
    editorRoomTab,
    setEditorRoomTab,
    handleClearEditorChats,
    editorChatSending,
    editorChats,
    editorNoteLoading,
    handleEditorNote,
    editorNoteError,
    editorNoteResult,
    savingEditorNoteId,
    handleSaveEditorNote,
    editorChatListRef,
    editorChatError,
    editorChatContextMode,
    setEditorChatContextMode,
    editorChatInput,
    setEditorChatInput,
    handleEditorChatKeyDown,
    handleSendEditorChat,
    showCreateForm,
    newProjectName,
    setNewProjectName,
    newWorld,
    setNewWorld,
    newCharacters,
    setNewCharacters,
    newStyle,
    setNewStyle,
    newSummary,
    setNewSummary,
    createError,
    creating,
    handleCreateProject,
    setShowCreateForm,
    setCreateError,
    currentProject,
    handleOpenSettings,
    showOutline,
    setShowOutline,
    handleLoadOutline,
    showSettings,
    mobileWorldRef,
    editWorld,
    setEditWorld,
    mobileCharactersRef,
    editCharacters,
    setEditCharacters,
    editStyle,
    setEditStyle,
    mobileSummaryRef,
    editSummary,
    setEditSummary,
    editEditorialMemory,
    setEditEditorialMemory,
    enhancedPrompt,
    projectDetails,
    savingSettings,
    handleSaveSettings,
    outlineText,
    setOutlineText,
    setOutlineError,
    outlineError,
    handleSaveOutline,
    outlineSaving,
    mobileGenerateOpen,
    setMobileGenerateOpen,
    userPrompt,
    setUserPrompt,
    model,
    setModel,
    writingPrefs,
    setWritingPrefs,
    handleGenerate,
    loading,
    regenerating,
    genProgress,
    handleGenProgressDone,
    error,
    readingSectionRef,
    editingTitle,
    editTitleValue,
    setEditTitleValue,
    handleSaveTitle,
    handleCancelEditTitle,
    handleStartEditTitle,
    showRewriteInput,
    setShowRewriteInput,
    setRewritePrompt,
    handleLoadRewritePrompt,
    copied,
    handleCopyChapter,
    displayContent,
    handleCopyFull,
    enhancedRewritePrompt,
    debugPromptInfo,
    handleRegenerate,
    readingChapterRecord,
    handleConfirmKeepChapter,
    mobileReadingSettingsOpen,
    setMobileReadingSettingsOpen,
    readingTheme,
    setReadingTheme,
    readingFontSize,
    setReadingFontSize,
    variantPreview,
    readingContentRef,
    handleReadingContentScroll,
    readingContent,
    showScrollTop,
    handleScrollToTop,
    handleOpenMobileWriting,
    showMobileEdit,
    setShowMobileEdit,
    setMobileEditTitle,
    setMobileEditContent,
    mobileEditTitle,
    mobileEditContent,
    handleMobileSaveEdit,
    mobileEditSaving,
    variants,
    mobileVariantsOpen,
    setMobileVariantsOpen,
    handlePreviewVariant,
    handleApplyVariant,
    applyingVariant,
    resetEditorRoom,
    onReadChapter
  } = props;

  return (
    <>
      {/* ===== Main Panel (mobile hidden on shelf/project/writing/outline/allProjects) ===== */}
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
              {/* 创建项目：提交当前表单并调用后端创建项目接口，成功后刷新项目列表。 */}
              <button className="btn" disabled={creating} onClick={handleCreateProject}>
                {creating ? '创建中...' : '创建'}
              </button>
              {/* 取消创建：只关闭表单并清空本地临时输入/错误，不会请求后端。 */}
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
              {/* 编辑设定：打开当前项目设定面板，只切换编辑状态，不会立即保存。 */}
              <button className="btn-link" onClick={handleOpenSettings}>编辑设定</button>
              {!isMobile && (
              /* 章节规划：切换大纲面板；首次打开会请求后端加载当前项目大纲。 */
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
                  {/* 保存设定：把当前项目设定 PUT 到服务器，会覆盖该项目现有设定字段。 */}
                  <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>
                    {savingSettings ? '保存中...' : '保存设定'}
                  </button>
                  {/* 关闭设定：只关闭设定面板，不会自动保存未提交内容。 */}
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
                  {/* 保存规划：把当前大纲 JSON 保存到服务器，会覆盖当前项目的大纲内容。 */}
                  <button className="btn" onClick={handleSaveOutline} disabled={outlineSaving}>
                    {outlineSaving ? '保存中...' : '保存规划'}
                  </button>
                  {/* 关闭规划：只关闭大纲面板并清理错误提示，不会保存文本。 */}
                  <button className="btn btn-secondary" onClick={() => { setShowOutline(false); setOutlineError(''); }}>
                    关闭
                  </button>
                </div>
              </div>
            )}

            {/* 已禁用的移动端生成设置遗留块：条件为 false，不会实际渲染。 */}
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

            {/* 生成下一段：基于当前项目上下文调用后端/AI 生成接口，成功后刷新章节和阅读内容。 */}
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
                        {/* 保存标题：把当前标题保存到服务器上的当前章节标题，不修改正文内容。 */}
                        <button className="btn" onClick={handleSaveTitle}>保存</button>
                        {/* 取消标题编辑：只退出本地标题编辑状态，不会保存输入。 */}
                        <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                      </div>
                    ) : (
                      <h3>
                        {readingChapterTitle || readingChapter}
                        {readingChapter !== '_streaming' && (
                          <span className="reading-filename">{readingChapter}</span>
                        )}
                        {readingChapter !== '_streaming' && (
                          /* 编辑标题入口：只进入标题编辑状态，不会立即保存到后端。 */
                          <button className="btn-link reading-title-edit-btn" onClick={handleStartEditTitle}>编辑标题</button>
                        )}
                      </h3>
                    )}
                  </div>
                  <div className="reading-actions">
                    {readingChapter !== '_streaming' && !isMobile && (
                    /* 重写本章：只打开或关闭重写输入区，不会立即调用生成接口或覆盖正文。 */
                    <button className="btn" onClick={() => { if (showRewriteInput) { setShowRewriteInput(false); setRewritePrompt(''); } else { handleLoadRewritePrompt(); } }}>
                      {showRewriteInput ? '取消重写' : '重写本章'}
                    </button>
                    )}
                    {readingChapter !== '_streaming' && !isMobile && (
                    /* 复制本章：只把当前章节内容写入剪贴板，不请求后端也不修改状态。 */
                    <button className="btn btn-success" onClick={handleCopyChapter}>
                      {copied ? '已复制' : '复制本章'}
                    </button>
                    )}
                    {readingChapter !== '_streaming' && !isMobile && displayContent && (
                      /* 复制全文：只把当前生成/展示全文写入剪贴板，不修改项目内容。 */
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
                    {/* 生成候选版本：调用后端重写接口生成候选，不会直接覆盖当前正文。 */}
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
                      {/* 确认保留：调用后端接口清除当前章节待检查标记，不改写正文。 */}
                      <button className="btn btn-secondary" onClick={handleConfirmKeepChapter}>确认保留</button>
                      {/* 重写本章：只打开重写输入区，不会立即覆盖正文。 */}
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
                  /* 回到开头：只滚动当前阅读容器或移动端页面，不保存或请求后端。 */
                  <button className="scroll-to-top-btn" onClick={handleScrollToTop} title="回到开头" aria-label="回到开头">
                    &uarr;
                  </button>
                )}

                {/* Mobile: rewrite button after content */}
                {readingChapter !== '_streaming' && isMobile && (
                  <div className="mobile-reading-writing-actions" style={{ marginTop: 16 }}>
                    {/* 生成下一段：进入移动端写作页准备续写，不会在点击时立即调用生成接口。 */}
                    <button className="btn" style={{ width: '100%' }} onClick={() => handleOpenMobileWriting(currentProject, { kind: 'generate', fileName: readingChapter })}>
                      生成下一段
                    </button>
                    {/* 重写本章：进入移动端写作页准备重写当前章节，不会在点击时立即覆盖正文。 */}
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
                    {/* 生成候选版本：调用后端重写接口生成候选，不会直接覆盖当前正文。 */}
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
                      {/* 编辑备注标签：只切换本地编辑器房间 tab，不请求后端。 */}
                      <button
                        className={'editor-room-tab' + (editorRoomTab === 'notes' ? ' active' : '')}
                        onClick={() => setEditorRoomTab('notes')}
                      >
                        编辑备注
                      </button>
                      {/* 编辑对话标签：只切换本地编辑器房间 tab，不请求后端。 */}
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
                        {/* 生成编辑备注：调用后端 AI 编辑备注接口，只生成草稿，不会自动保存为备注。 */}
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
                          {/* 保存备注：把生成的编辑备注保存到当前章节备注，不覆盖正文。 */}
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
                      {/* 清空对话：调用后端删除当前章节编辑对话记录；只删除对话，不影响正文和备注。 */}
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
                                  /* 保存备注：把该条编辑回复保存为当前章节备注，不覆盖正文。 */
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
                            /* 对话上下文模式：只切换本地发送参数，影响下一次编辑对话请求的上下文范围。 */
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
                        {/* 发送对话：调用后端编辑对话接口，新增对话记录但不修改正文。 */}
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
                      {/* 上一章：读取上一章正文并关闭移动端生成/候选浮层，会改变当前阅读章节。 */}
                      <button className="btn" disabled={!prev} onClick={() => { if (prevFn) { onReadChapter?.(prevFn); setMobileGenerateOpen(false); setMobileVariantsOpen(false); } }}>
                        上一章
                      </button>
                      {/* 返回目录：移动端走应用内返回；桌面端只滚动到页面顶部，不保存内容。 */}
                      <button className="btn btn-secondary" onClick={() => { if (isMobile) { onBackClick(); } else { window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>
                        {isMobile ? '目录' : '回目录'}
                      </button>
                      {/* 下一章：读取下一章正文并关闭移动端生成/候选浮层，会改变当前阅读章节。 */}
                      <button className="btn" disabled={!next} onClick={() => { if (nextFn) { onReadChapter?.(nextFn); setMobileGenerateOpen(false); setMobileVariantsOpen(false); } }}>
                        下一章
                      </button>
                    </div>
                  );
                })()}

                {/* Mobile: simple edit button */}
                {isMobile && !showMobileEdit && (
                  <div style={{ marginTop: 12 }}>
                    {/* 编辑本文：把当前章节标题和正文复制到移动端临时编辑表单，不会立即保存。 */}
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
                      {/* 保存正文：把移动端编辑表单内容保存到服务器当前章节，会覆盖该章节正文。 */}
                      <button className="btn" onClick={handleMobileSaveEdit} disabled={mobileEditSaving}>
                        {mobileEditSaving ? '保存中...' : '保存'}
                      </button>
                      {/* 取消编辑：只关闭移动端临时编辑表单，不保存输入内容。 */}
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
                      /* 候选版本开关：只切换移动端候选列表显示状态，不请求后端。 */
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
                              {/* 查看正文：只预览/关闭该候选版本正文，不会应用到主线。 */}
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
                              {/* 沿此版本继续：把候选版本应用为当前主线内容，会改变当前章节版本。 */}
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


    </>
  );
}
