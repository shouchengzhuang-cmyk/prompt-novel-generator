function createAuthRouter({ pin }) {
  const router = require('express').Router();

  router.post('/auth/login', (req, res) => {
    const { pin: inputPin } = req.body;

    if (!pin) {
      return res.status(500).json({ error: 'PIN 未配置' });
    }

    if (inputPin !== pin) {
      return res.status(401).json({ error: '密码错误' });
    }

    req.session.authenticated = true;
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ authenticated: !!req.session?.authenticated });
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '退出失败' });
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  return router;
}

module.exports = { createAuthRouter };
