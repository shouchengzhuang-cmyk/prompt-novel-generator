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

const { sendFeishuMessage, checkConfig, formatReportMessage } = require('../services/feishuNotifier');

async function main() {
  const config = checkConfig();
  if (!config.ok) {
    console.error(config.error);
    console.error('请在 server/.env 中配置后重试：');
    console.error('  XMX_FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...');
    console.error('  XMX_FEISHU_SECRET=...');
    process.exit(1);
  }

  const message = formatReportMessage('小墨匣主理人莉莉丝已接入远程指挥台。', '接入测试');

  console.error('发送测试消息到飞书...');
  const result = await sendFeishuMessage(message);

  if (result.ok) {
    console.error('✓ 飞书测试消息发送成功');
    process.exitCode = 0;
  } else {
    console.error('✗ 发送失败:', result.error);
    process.exitCode = 1;
  }
}

main();
