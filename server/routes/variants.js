const express = require('express');

function createVariantsRouter({ variantService }) {
  const router = express.Router({ mergeParams: true });

  function sendError(res, err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  router.get('/', async (req, res) => {
    try {
      const result = await variantService.listVariants(
        req.params.projectName,
        req.params.fileName,
      );
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/:variantId/apply', async (req, res) => {
    try {
      const result = await variantService.applyVariant(
        req.params.projectName,
        req.params.fileName,
        req.params.variantId,
      );
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = createVariantsRouter;
