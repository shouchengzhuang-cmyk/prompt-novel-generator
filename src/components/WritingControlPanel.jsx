import { useState } from 'react';

const labelMap = {
  paragraph: { short: '短段', normal: '自然段', long: '长段' },
  pace: { slow: '慢热', normal: '正常', fast: '快一点' },
  characterConsistency: { strict: '严格保持', natural: '允许自然发展' },
};

function summaryParts(prefs) {
  const parts = [];
  if (prefs.style) parts.push(prefs.style);
  if (prefs.paragraph) parts.push(labelMap.paragraph[prefs.paragraph] || prefs.paragraph);
  if (prefs.pace) parts.push(labelMap.pace[prefs.pace] || prefs.pace);
  if (prefs.characterConsistency) parts.push(labelMap.characterConsistency[prefs.characterConsistency] || prefs.characterConsistency);
  return parts;
}

export default function WritingControlPanel({ prefs, onChange }) {
  const [collapsed, setCollapsed] = useState(true);
  const handleChange = (field, value) => {
    onChange({ ...prefs, [field]: value });
  };

  return (
    <div className="writing-controls">
      <button
        className="writing-controls-header"
        type="button"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="writing-controls-title">写作偏好</span>
        <span className="writing-controls-arrow">{collapsed ? '▶' : '▼'}</span>
      </button>

      {collapsed ? (
        <p className="writing-controls-summary">
          {summaryParts(prefs).join(' / ') || '未设置'}
        </p>
      ) : (
        <>
          <div className="writing-controls-row">
            <label className="writing-controls-label">文风</label>
            <input
              className="writing-controls-input"
              value={prefs.style}
              onChange={(e) => handleChange('style', e.target.value)}
              placeholder="轻小说、日常、悬疑、古风..."
            />
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">段落</label>
            <div className="writing-controls-options">
              {[
                ['short', '短段'],
                ['normal', '自然段'],
                ['long', '长段'],
              ].map(([value, label]) => (
                <label key={value} className={'writing-controls-option' + (prefs.paragraph === value ? ' active' : '')}>
                  <input
                    type="radio"
                    name="paragraph"
                    value={value}
                    checked={prefs.paragraph === value}
                    onChange={() => handleChange('paragraph', value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">剧情推进</label>
            <div className="writing-controls-options">
              {[
                ['slow', '慢热'],
                ['normal', '正常'],
                ['fast', '快一点'],
              ].map(([value, label]) => (
                <label key={value} className={'writing-controls-option' + (prefs.pace === value ? ' active' : '')}>
                  <input
                    type="radio"
                    name="pace"
                    value={value}
                    checked={prefs.pace === value}
                    onChange={() => handleChange('pace', value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">人设</label>
            <div className="writing-controls-options">
              {[
                ['strict', '严格保持'],
                ['natural', '允许自然发展'],
              ].map(([value, label]) => (
                <label key={value} className={'writing-controls-option' + (prefs.characterConsistency === value ? ' active' : '')}>
                  <input
                    type="radio"
                    name="characterConsistency"
                    value={value}
                    checked={prefs.characterConsistency === value}
                    onChange={() => handleChange('characterConsistency', value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="writing-controls-hint">写作偏好将自动加入本次生成要求，不影响项目设定。</p>
        </>
      )}
    </div>
  );
}
