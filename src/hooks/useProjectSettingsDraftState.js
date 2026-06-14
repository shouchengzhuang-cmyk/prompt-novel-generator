import { useCallback, useState } from 'react';

export function useProjectSettingsDraftState() {
  const [savingSettings, setSavingSettings] = useState(false);
  const [editWorld, setEditWorld] = useState('');
  const [editCharacters, setEditCharacters] = useState('');
  const [editStyle, setEditStyle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editEditorialMemory, setEditEditorialMemory] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(null);

  const hydrateSettingsDraft = useCallback((details, projectName) => {
    setEditWorld(details?.world || '');
    setEditCharacters(details?.characters || '');
    setEditStyle(details?.style || '');
    setEditSummary(details?.summary || '');
    setEditEditorialMemory(details?.editorialMemory || '');
    setEditingProjectName(projectName || null);
  }, []);

  const clearSettingsDraft = useCallback(() => {
    setEditWorld('');
    setEditCharacters('');
    setEditStyle('');
    setEditSummary('');
    setEditEditorialMemory('');
    setEditingProjectName(null);
  }, []);

  const getSettingsPayload = useCallback(() => ({
    world: editWorld,
    characters: editCharacters,
    style: editStyle,
    summary: editSummary,
    editorialMemory: editEditorialMemory,
  }), [editWorld, editCharacters, editStyle, editSummary, editEditorialMemory]);

  const getSavedSettings = useCallback((project) => ({
    world: project?.world ?? editWorld,
    characters: project?.characters ?? editCharacters,
    style: project?.style ?? editStyle,
    summary: project?.summary ?? editSummary,
    editorialMemory: project?.editorialMemory ?? editEditorialMemory,
  }), [editWorld, editCharacters, editStyle, editSummary, editEditorialMemory]);

  return {
    savingSettings,
    setSavingSettings,
    editWorld,
    setEditWorld,
    editCharacters,
    setEditCharacters,
    editStyle,
    setEditStyle,
    editSummary,
    setEditSummary,
    editEditorialMemory,
    setEditEditorialMemory,
    editingProjectName,
    setEditingProjectName,
    hydrateSettingsDraft,
    clearSettingsDraft,
    getSettingsPayload,
    getSavedSettings,
  };
}
