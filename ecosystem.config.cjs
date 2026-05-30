module.exports = {
  apps: [
    {
      name: 'xiaomoxia',
      script: './server/index.js',
      cwd: '/opt/xiaomoxia/prompt-novel-generator',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        NOVELS_DIR: '/data/xiaomoxia/novels'
      }
    }
  ]
}
