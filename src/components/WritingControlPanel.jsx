export default function WritingControlPanel({ prefs, onChange }) {
  const handleChange = (field, value) => {
    onChange({ ...prefs, [field]: value });
  };

  return (
    <div className="writing-controls">
      <h3 className="writing-controls-title">写作偏好</h3>

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
    </div>
  );
}
