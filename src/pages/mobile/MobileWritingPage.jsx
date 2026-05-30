import WritingControlPanel from '../../components/WritingControlPanel';

export default function MobileWritingPage({
  currentProject,
  mobileWritingTarget,
  mobileWritingKind,
  mobileWritingPrompt,
  onMobileWritingPromptChange,
  model,
  onSetModel,
  writingPrefs,
  onSetWritingPrefs,
  loading,
  regenerating,
  onMobileWritingGenerate,
  mobileWritingError,
  error,
  mobileWritingOutput,
  readingChapter,
  readingContent,
  navigateTo,
  onSetMobileWritingOutput,
  onBackClick,
}) {
  return (
    <div className="panel panel-main mobile-writing-view">
      {/* 返回写作来源页：走应用内返回逻辑，不保存当前写作输入或输出。 */}
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
          onChange={(e) => onMobileWritingPromptChange(e.target.value)}
          placeholder="写下这次想推进的剧情、氛围或人物动作..."
          rows={6}
        />

        <div className="mobile-writing-modes">
          {[
            { value: 'deepseek-v4-flash', title: '快速模式', sub: '适合日常续写' },
            { value: 'deepseek-v4-pro', title: '深度模式', sub: '适合复杂伏笔' },
          ].map((item) => (
            /* 模型选择：只切换本地 model 状态，影响下一次生成请求。 */
            <button
              key={item.value}
              className={model === item.value ? 'active' : ''}
              type="button"
              onClick={() => onSetModel(item.value)}
            >
              <strong>{item.title}</strong>
              <span>{item.sub}</span>
            </button>
          ))}
        </div>

        <WritingControlPanel prefs={writingPrefs} onChange={onSetWritingPrefs} />

        {/* 开始生成/生成候选：根据移动端写作类型调用后端 AI 生成接口；候选不会直接覆盖正文。 */}
        <button
          className="btn mobile-writing-generate"
          onClick={onMobileWritingGenerate}
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
          {/* 返回阅读页：只切换到章节阅读视图，不保存写作面板内容。 */}
          <button
            className="btn"
            disabled={!readingChapter || readingChapter === '_streaming'}
            onClick={() => navigateTo('chapter')}
          >
            返回阅读页
          </button>
          {/* 继续追加：清空本地输出并重置续写提示，不会请求后端或保存内容。 */}
          <button
            className="btn btn-secondary"
            disabled={loading || regenerating}
            onClick={() => {
              onSetMobileWritingOutput('');
              onMobileWritingPromptChange('继续写');
            }}
          >
            继续追加
          </button>
          {/* 取消写作：走应用内返回逻辑，不保存当前写作输入。 */}
          <button className="btn btn-secondary" onClick={onBackClick}>
            取消
          </button>
        </div>
      </section>
    </div>
  );
}
