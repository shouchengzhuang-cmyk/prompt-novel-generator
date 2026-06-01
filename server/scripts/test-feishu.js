/**
 * Local test entry for Feishu notification.
 *
 * Usage:
 *   node server/scripts/test-feishu.js
 *
 * Prerequisites:
 *   Set XMX_FEISHU_WEBHOOK and XMX_FEISHU_SECRET in server/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendFeishuMessage, checkConfig } = require('../services/feishuNotifier');

async function main() {
  const config = checkConfig();
  if (!config.ok) {
    console.error(config.error);
    console.error('请在 server/.env 中配置后重试：');
    console.error('  XMX_FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...');
    console.error('  XMX_FEISHU_SECRET=...');
    process.exit(1);
  }

  const message = [
    'LILITH_REPORT',
    '小墨匣主理人莉莉丝已接入远程指挥台。',
  ].join('\n');

  console.log('发送测试消息到飞书...');
  const result = await sendFeishuMessage(message);

  if (result.ok) {
    console.log('✓ 飞书测试消息发送成功');
    process.exit(0);
  } else {
    console.error('✗ 发送失败:', result.error);
    process.exit(1);
  }
}

main();
