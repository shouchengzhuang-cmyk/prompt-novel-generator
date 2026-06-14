import { useState, useEffect, useCallback } from 'react';
import * as ProjectsApi from '../api/projectsApi';

export function useProjectSelectionState({ setNotification, setError, normalizeChapters, isAuthenticated }) {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectDetails, setProjectDetails] = useState(null);
  const [lastProjectName, setLastProjectName] = useState(() => localStorage.getItem('xiaomoxia-last-project') || '');

  /** 记住最近打开的项目（存 localStorage） */
  const rememberLastProject = useCallback((projectName) => {
    if (!projectName) return;
    localStorage.setItem('xiaomoxia-last-project', projectName);
    setLastProjectName(projectName);
  }, []);

  /** 获取项目列表（登录后自动调用） */
  const fetchProjects = async () => {
    try {
      const data = await ProjectsApi.fetchProjects();
      setProjects(data.projects || []);
      setError(''); // clear any previous error on success
    } catch (err) {
      // 401 is handled globally by api.js (clears auth state)
      // Only show local error for non-auth failures
      if (!err.message.includes('登录已过期')) {
        const msg = '获取项目列表失败，请检查网络连接';
        setError(msg);
        setNotification({ title: '加载失败', message: msg });
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated === true) {
      fetchProjects();
    } else {
      setProjects([]);
    }
  }, [isAuthenticated]);

  /** 加载单个项目详情（请求后端 + 规范化章节字段 + 写入 projectDetails） */
  const loadProjectDetails = async (name) => {
    const data = await ProjectsApi.fetchProjectDetails(name);
    // Normalize: ensure chapters have fileName regardless of backend field name
    if (data.chapters) data.chapters = normalizeChapters(data.chapters);
    setProjectDetails(data);
    return data;
  };

  return {
    projects,
    setProjects,
    currentProject,
    setCurrentProject,
    projectDetails,
    setProjectDetails,
    lastProjectName,
    setLastProjectName,
    rememberLastProject,
    fetchProjects,
    loadProjectDetails,
  };
}
