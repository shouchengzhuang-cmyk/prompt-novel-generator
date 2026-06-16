import { useState } from 'react';

export function useDesktopUiState() {
  const [desktopChapterQuery, setDesktopChapterQuery] = useState('');
  const [desktopAiMode, setDesktopAiMode] = useState('continue');
  const [desktopEditorContent, setDesktopEditorContent] = useState('');
  const [desktopSavingContent, setDesktopSavingContent] = useState(false);

  return {
    desktopChapterQuery, setDesktopChapterQuery,
    desktopAiMode, setDesktopAiMode,
    desktopEditorContent, setDesktopEditorContent,
    desktopSavingContent, setDesktopSavingContent,
  };
}
