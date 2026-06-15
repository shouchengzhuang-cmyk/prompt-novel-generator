import { useCallback, useState } from 'react';
import { safeJsonFetch } from '../api';

export function useVariantState() {
  const [variants, setVariants] = useState([]);
  const [variantPreview, setVariantPreview] = useState(null);
  const [applyingVariant, setApplyingVariant] = useState(false);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');

  const handlePreviewVariant = useCallback((variant) => {
    setVariantPreview((prev) => (prev?.id === variant.id ? null : variant));
  }, []);

  const clearVariantState = useCallback(() => {
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
  }, []);

  const handleLoadVariants = useCallback(async (filename, projectName) => {
    if (!filename || !projectName) {
      setVariants([]);
      return;
    }

    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(filename)}/variants`);
      setVariants(data.variants || []);
    } catch {
      setVariants([]);
    }
  }, []);

  return {
    variants,
    setVariants,
    variantPreview,
    setVariantPreview,
    applyingVariant,
    setApplyingVariant,
    showRewriteInput,
    setShowRewriteInput,
    rewritePrompt,
    setRewritePrompt,
    handlePreviewVariant,
    clearVariantState,
    handleLoadVariants,
  };
}
