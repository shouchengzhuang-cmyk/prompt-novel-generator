import { useRef, useState } from 'react';

export function useMobileUiState() {
  // Search overlay
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileSearchIndex, setMobileSearchIndex] = useState([]);
  const [mobileSearchLoading, setMobileSearchLoading] = useState(false);

  // Writing panel
  const [mobileWritingTarget, setMobileWritingTarget] = useState(null);
  const [mobileWritingPrompt, setMobileWritingPrompt] = useState('');
  const [mobileWritingKind, setMobileWritingKind] = useState('generate');
  const [mobileWritingOutput, setMobileWritingOutput] = useState('');
  const [mobileWritingError, setMobileWritingError] = useState('');

  // Settings editor focus refs
  const mobileWorldRef = useRef(null);
  const mobileCharactersRef = useRef(null);
  const mobileSummaryRef = useRef(null);

  // Search input ref
  const mobileSearchInputRef = useRef(null);

  // Inline chapter edit
  const [mobileEditTitle, setMobileEditTitle] = useState('');
  const [mobileEditContent, setMobileEditContent] = useState('');
  const [mobileEditSaving, setMobileEditSaving] = useState(false);

  return {
    showMobileSearch, setShowMobileSearch,
    mobileSearchQuery, setMobileSearchQuery,
    mobileSearchIndex, setMobileSearchIndex,
    mobileSearchLoading, setMobileSearchLoading,
    mobileWritingTarget, setMobileWritingTarget,
    mobileWritingPrompt, setMobileWritingPrompt,
    mobileWritingKind, setMobileWritingKind,
    mobileWritingOutput, setMobileWritingOutput,
    mobileWritingError, setMobileWritingError,
    mobileWorldRef,
    mobileCharactersRef,
    mobileSummaryRef,
    mobileSearchInputRef,
    mobileEditTitle, setMobileEditTitle,
    mobileEditContent, setMobileEditContent,
    mobileEditSaving, setMobileEditSaving,
  };
}
