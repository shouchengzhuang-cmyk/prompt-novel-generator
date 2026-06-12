const express = require('express');

function createChaptersRouter({ chapterService }) {
  const router = express.Router({ mergeParams: true });

  function sendError(res, err, fallbackMessage) {
    return res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
  }

  router.get('/:fileName', async (req, res) => {
    try {
      const chapter = await chapterService.getChapter(req.params.projectName, req.params.fileName);
      res.json(chapter);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/:fileName/stale/confirm', async (req, res) => {
    try {
      const result = await chapterService.confirmStaleChapter(req.params.projectName, req.params.fileName);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/:fileName', async (req, res) => {
    try {
      const result = await chapterService.deleteChapter(req.params.projectName, req.params.fileName);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/:fileName/title', async (req, res) => {
    try {
      const result = await chapterService.saveChapterTitle(
        req.params.projectName,
        req.params.fileName,
        req.body.title,
      );
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/:fileName/content', async (req, res) => {
    try {
      const result = await chapterService.saveChapterContent(
        req.params.projectName,
        req.params.fileName,
        req.body,
      );
      res.json(result);
    } catch (err) {
      sendError(res, err, '保存失败');
    }
  });

  return router;
}

module.exports = createChaptersRouter;
