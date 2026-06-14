import { useCallback, useEffect, useState } from 'react';

export function useWorkspaceUiState() {
  const [desktopView, setDesktopView] = useState('workbench');
  const [desktopEditorTab, setDesktopEditorTab] = useState('writing');
  const [mobileView, setMobileView] = useState('shelf');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [mobileGenerateOpen, setMobileGenerateOpen] = useState(false);
  const [mobileVariantsOpen, setMobileVariantsOpen] = useState(false);
  const [mobileShelfMenu, setMobileShelfMenu] = useState(null);
  const [mobileChapterMenu, setMobileChapterMenu] = useState(null);
  const [mobileMaterialsOpen, setMobileMaterialsOpen] = useState(false);
  const [mobileReadingSettingsOpen, setMobileReadingSettingsOpen] = useState(false);
  const [showMobileEdit, setShowMobileEdit] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handleChange = (event) => setIsMobile(event.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const closeMobileOverlays = useCallback(() => {
    setMobileGenerateOpen(false);
    setMobileVariantsOpen(false);
  }, []);

  const switchMobileView = useCallback((view) => {
    setMobileView(view);
    closeMobileOverlays();
  }, [closeMobileOverlays]);

  const navigateTo = useCallback((view) => {
    window.history.pushState({ mobileView: view }, '', '');
    switchMobileView(view);
    setMobileChapterMenu(null);
    setMobileShelfMenu(null);
  }, [switchMobileView]);

  const resetWorkspaceUi = useCallback(() => {
    setDesktopView('workbench');
    setDesktopEditorTab('writing');
    setMobileView('shelf');
    closeMobileOverlays();
    setMobileChapterMenu(null);
    setMobileShelfMenu(null);
    setMobileMaterialsOpen(false);
    setMobileReadingSettingsOpen(false);
    setShowMobileEdit(false);
  }, [closeMobileOverlays]);

  return {
    desktopView,
    setDesktopView,
    desktopEditorTab,
    setDesktopEditorTab,
    mobileView,
    setMobileView,
    isMobile,
    mobileGenerateOpen,
    setMobileGenerateOpen,
    mobileVariantsOpen,
    setMobileVariantsOpen,
    mobileShelfMenu,
    setMobileShelfMenu,
    mobileChapterMenu,
    setMobileChapterMenu,
    mobileMaterialsOpen,
    setMobileMaterialsOpen,
    mobileReadingSettingsOpen,
    setMobileReadingSettingsOpen,
    showMobileEdit,
    setShowMobileEdit,
    closeMobileOverlays,
    switchMobileView,
    navigateTo,
    resetWorkspaceUi,
  };
}
