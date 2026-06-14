import { useMemo, useState } from 'react';

function buildEnhancedPrompt(basePrompt, prefs) {
  const lines = [];
  const paragraphMap = { short: '短段，加快叙事节奏', normal: '自然段', long: '长段，展开细节描写' };
  lines.push(`- 段落：${paragraphMap[prefs.paragraph] || paragraphMap.normal}`);

  const paceMap = { slow: '慢热，铺垫细节', normal: '正常推进', fast: '快一点，减少冗余描写' };
  lines.push(`- 剧情推进：${paceMap[prefs.pace] || paceMap.normal}`);

  const charMap = { strict: '严格保持既有人物性格和关系', natural: '允许人物自然发展' };
  lines.push(`- 人设：${charMap[prefs.characterConsistency] || charMap.strict}`);

  return basePrompt + '\n\n【本次写作偏好】\n' + lines.join('\n');
}

export function useWritingPrefsState({ userPrompt, rewritePrompt } = {}) {
  const [model, setModel] = useState('deepseek-v4-flash');
  const [writingPrefs, setWritingPrefs] = useState({
    style: '',
    paragraph: 'normal',
    pace: 'normal',
    characterConsistency: 'strict',
  });

  const enhancedPrompt = useMemo(() => buildEnhancedPrompt(userPrompt.trim(), writingPrefs), [userPrompt, writingPrefs]);
  const enhancedRewritePrompt = useMemo(() => buildEnhancedPrompt((rewritePrompt || '').trim(), writingPrefs), [rewritePrompt, writingPrefs]);

  return {
    model,
    setModel,
    writingPrefs,
    setWritingPrefs,
    enhancedPrompt,
    enhancedRewritePrompt,
  };
}
