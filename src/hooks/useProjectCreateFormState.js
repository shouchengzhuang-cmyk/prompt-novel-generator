import { useState, useCallback } from 'react';

export function useProjectCreateFormState() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newWorld, setNewWorld] = useState('');
  const [newCharacters, setNewCharacters] = useState('');
  const [newStyle, setNewStyle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const resetCreateProjectForm = useCallback(() => {
    setNewProjectName('');
    setNewWorld('');
    setNewCharacters('');
    setNewStyle('');
    setNewSummary('');
    setCreateError('');
    setCreating(false);
  }, []);

  const openCreateProjectForm = useCallback(() => {
    setShowCreateForm(true);
    setCreateError('');
  }, []);

  const closeCreateProjectForm = useCallback(() => {
    setShowCreateForm(false);
    resetCreateProjectForm();
  }, [resetCreateProjectForm]);

  return {
    showCreateForm,
    setShowCreateForm,
    newProjectName,
    setNewProjectName,
    newWorld,
    setNewWorld,
    newCharacters,
    setNewCharacters,
    newStyle,
    setNewStyle,
    newSummary,
    setNewSummary,
    createError,
    setCreateError,
    creating,
    setCreating,
    openCreateProjectForm,
    closeCreateProjectForm,
    resetCreateProjectForm,
  };
}
