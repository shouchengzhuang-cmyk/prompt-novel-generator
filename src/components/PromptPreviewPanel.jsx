import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function PromptPreviewPanel({ taskType, projectDetails, userPrompt, fileName }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [previewData, setPreviewData] = useState(null);

  // Fetch rendered prompt from backend
  const doFetch = () => {
    if (!expanded || !projectDetails?.projectName) return;
    setLoading(true);
    setFetchError('');
    setPreviewData(null);

    const params = new URLSearchParams({ taskType, userPrompt: userPrompt || '' });
    if (fileName) params.set('fileName', fileName);

    apiFetch(`/api/projects/${encodeURIComponent(projectDetails.projectName)}/prompt-preview?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setFetchError(data.error);
        } else {
          setPreviewData(data);
        }
        setLoading(false);
      })
      .catch((e) => {
        setFetchError('获取预览失败: ' + e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    doFetch();
  }, [expanded]);

  // Re-fetch when inputs or project change while expanded
  useEffect(() => {
    if (expanded) doFetch();
  }, [taskType, userPrompt, fileName, projectDetails?.projectName]);

  if (!projectDetails) return null;

  const templateLabel = previewData?.templateTitle
    ? previewData.usedFallback
      ? '内置默认模板'
      : previewData.templateTitle
    : '';

  return (
    <div className="prompt-preview-panel">
      {/* 查看完整 Prompt：展开时会向后端请求渲染后的 prompt 预览，不会触发 AI 生成或保存内容。 */}
      <button
        className="prompt-preview-toggle"
        onClick={() => setExpanded((p) => !p)}
        type="button"
      >
        <span className="prompt-preview-arrow">{expanded ? '▾' : '▸'}</span>
        查看完整 Prompt
        {templateLabel && (
          <span className="prompt-preview-template-name">（{templateLabel}）</span>
        )}
      </button>
      {expanded && (
        <div className="prompt-preview-body">
          {loading && <p className="hint">加载预览...</p>}
          {fetchError && <div className="error" style={{ margin: 0 }}>{fetchError}</div>}
          {previewData && !fetchError && (
            <>
              <div className="prompt-preview-meta">
                模板：{previewData.templateTitle || '内置默认模板'}
                {previewData.usedFallback && '（默认）'}
                ｜任务类型：{previewData.taskType}
              </div>
              <div className="prompt-preview-section">
                <div className="prompt-preview-section-title">完整 System Prompt</div>
                <pre className="prompt-preview-content">{previewData.systemContent}</pre>
              </div>
              <div className="prompt-preview-section">
                <div className="prompt-preview-section-title">完整 User Prompt</div>
                <pre className="prompt-preview-content">{previewData.userContent}</pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
