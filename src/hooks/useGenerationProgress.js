import { useCallback, useState } from 'react';

export function useGenerationProgress() {
  const [debugPromptInfo, setDebugPromptInfo] = useState(null);
  const [genProgress, setGenProgress] = useState({
    visible: false,
    mode: 'generate',
    status: 'running',
    errorMessage: '',
  });
  const [streamingChapterNum, setStreamingChapterNum] = useState('');

  const handleGenProgressDone = useCallback(() => {
    setGenProgress({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });
  }, []);

  return {
    debugPromptInfo,
    setDebugPromptInfo,
    genProgress,
    setGenProgress,
    streamingChapterNum,
    setStreamingChapterNum,
    handleGenProgressDone,
  };
}
