import { useCallback, useState } from 'react';

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
  };
}
