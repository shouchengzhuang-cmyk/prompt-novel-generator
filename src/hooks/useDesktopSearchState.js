import { useState, useRef, useCallback } from 'react';
import { searchProjects } from '../api/projectsApi';

export function useDesktopSearchState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDesktopSearch, setShowDesktopSearch] = useState(false);
  const searchInputRef = useRef(null);
  const searchTimerRef = useRef(null);

  const handleSearch = useCallback(async (q) => {
    if (!q || !q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await searchProjects(q.trim(), 50);
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchQueryChange = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => handleSearch(value), 300);
  }, [handleSearch]);

  const openDesktopSearch = useCallback(() => {
    setShowDesktopSearch(true);
    setSearchQuery('');
    setSearchResults([]);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeDesktopSearch = useCallback(() => {
    setShowDesktopSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    searchLoading,
    showDesktopSearch,
    setShowDesktopSearch,
    searchInputRef,
    handleSearchQueryChange,
    openDesktopSearch,
    closeDesktopSearch,
  };
}
