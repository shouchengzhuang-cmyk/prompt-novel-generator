module.exports = {
  apps: [
    {
      name: 'xiaomoxia',
      script: './server/index.js',
      cwd: '/opt/xiaomoxia/prompt-novel-generator',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        NOVELS_DIR: '/data/xiaomoxia/novels',
        SESSION_SECRET: '请替换为 openssl rand -hex 32 的输出',
        CORS_ORIGIN: 'https://xiaomoxia.yourdomain.com'
      }
    }
  ]
}
