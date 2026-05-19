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
      <div className="writing-controls-header" onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="writing-controls-title" style={{ margin: 0 }}>写作偏好</h3>
        <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {collapsed ? (
        <p className="writing-controls-summary" style={{ fontSize: 12, color: '#888', margin: '6px 0 0 0' }}>
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
              placeholder="轻小说、校园日常、悬疑、古风…"
            />
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">段落</label>
            <div className="writing-controls-options">
              <label className={'writing-controls-option' + (prefs.paragraph === 'short' ? ' active' : '')}>
                <input
                  type="radio" name="paragraph" value="short"
                  checked={prefs.paragraph === 'short'}
                  onChange={() => handleChange('paragraph', 'short')}
                />
                <span>短段</span>
              </label>
              <label className={'writing-controls-option' + (prefs.paragraph === 'normal' ? ' active' : '')}>
                <input
                  type="radio" name="paragraph" value="normal"
                  checked={prefs.paragraph === 'normal'}
                  onChange={() => handleChange('paragraph', 'normal')}
                />
                <span>自然段</span>
              </label>
              <label className={'writing-controls-option' + (prefs.paragraph === 'long' ? ' active' : '')}>
                <input
                  type="radio" name="paragraph" value="long"
                  checked={prefs.paragraph === 'long'}
                  onChange={() => handleChange('paragraph', 'long')}
                />
                <span>长段</span>
              </label>
            </div>
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">剧情推进</label>
            <div className="writing-controls-options">
              <label className={'writing-controls-option' + (prefs.pace === 'slow' ? ' active' : '')}>
                <input
                  type="radio" name="pace" value="slow"
                  checked={prefs.pace === 'slow'}
                  onChange={() => handleChange('pace', 'slow')}
                />
                <span>慢热</span>
              </label>
              <label className={'writing-controls-option' + (prefs.pace === 'normal' ? ' active' : '')}>
                <input
                  type="radio" name="pace" value="normal"
                  checked={prefs.pace === 'normal'}
                  onChange={() => handleChange('pace', 'normal')}
                />
                <span>正常</span>
              </label>
              <label className={'writing-controls-option' + (prefs.pace === 'fast' ? ' active' : '')}>
                <input
                  type="radio" name="pace" value="fast"
                  checked={prefs.pace === 'fast'}
                  onChange={() => handleChange('pace', 'fast')}
                />
                <span>快一点</span>
              </label>
            </div>
          </div>

          <div className="writing-controls-row">
            <label className="writing-controls-label">人设</label>
            <div className="writing-controls-options">
              <label className={'writing-controls-option' + (prefs.characterConsistency === 'strict' ? ' active' : '')}>
                <input
                  type="radio" name="characterConsistency" value="strict"
                  checked={prefs.characterConsistency === 'strict'}
                  onChange={() => handleChange('characterConsistency', 'strict')}
                />
                <span>严格保持</span>
              </label>
              <label className={'writing-controls-option' + (prefs.characterConsistency === 'natural' ? ' active' : '')}>
                <input
                  type="radio" name="characterConsistency" value="natural"
                  checked={prefs.characterConsistency === 'natural'}
                  onChange={() => handleChange('characterConsistency', 'natural')}
                />
                <span>允许自然发展</span>
              </label>
            </div>
          </div>

          <p className="writing-controls-hint">写作偏好将自动加入本次生成要求，不影响项目设定。</p>
        </>
      )}
    </div>
  );
}
