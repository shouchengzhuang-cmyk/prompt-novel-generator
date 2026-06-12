const fs = require('fs/promises');
const express = require('express');
const materialsService = require('../services/materialsService');

function createMaterialsRouter({ safeProjectDir }) {
  const router = express.Router({ mergeParams: true });

  async function resolveProject(req, res) {
    let projectDir;
    try {
      projectDir = safeProjectDir(req.params.projectName);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return null;
    }

    try {
      await fs.access(projectDir);
      return projectDir;
    } catch {
      res.status(404).json({ error: '项目不存在' });
      return null;
    }
  }

  function sendError(res, err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }

  router.get('/event-cards', async (req, res) => {
    const projectDir = await resolveProject(req, res);
    if (!projectDir) return;
    try {
      const cards = await materialsService.listEventCards(projectDir);
      res.json({ cards });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/event-cards/:cardName', async (req, res) => {
    const projectDir = await resolveProject(req, res);
    if (!projectDir) return;
    try {
      const card = await materialsService.getEventCard(projectDir, req.params.cardName);
      res.json(card);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/event-cards', async (req, res) => {
    const projectDir = await resolveProject(req, res);
    if (!projectDir) return;
    try {
      const card = await materialsService.createEventCard(projectDir, req.body);
      res.status(201).json(card);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/event-cards/:cardName', async (req, res) => {
    const projectDir = await resolveProject(req, res);
    if (!projectDir) return;
    try {
      const card = await materialsService.updateEventCard(
        projectDir,
        req.params.cardName,
        req.body.content,
      );
      res.json(card);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/event-cards/:cardName', async (req, res) => {
    const projectDir = await resolveProject(req, res);
    if (!projectDir) return;
    try {
      const result = await materialsService.deleteEventCard(projectDir, req.params.cardName);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = createMaterialsRouter;
