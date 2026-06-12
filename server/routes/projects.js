const express = require('express');

function createProjectsRouter({ projectService }) {
  const router = express.Router();

  function sendError(res, err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  router.get('/', async (_req, res) => {
    try {
      const projects = await projectService.listProjects();
      res.json({ projects });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const result = await projectService.createProject(req.body);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/:projectName', async (req, res) => {
    try {
      const project = await projectService.getProject(req.params.projectName);
      res.json(project);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/:projectName', async (req, res) => {
    try {
      const result = await projectService.deleteProject(req.params.projectName);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/:projectName/rename', async (req, res) => {
    try {
      const result = await projectService.renameProject(req.params.projectName, req.body.newName);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/:projectName', async (req, res) => {
    try {
      const result = await projectService.saveProject(req.params.projectName, req.body);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = createProjectsRouter;
