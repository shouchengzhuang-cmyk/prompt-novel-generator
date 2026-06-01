/**
 * Generic task completion report script for Feishu notification.
 *
 * Usage:
 *   node server/scripts/report-feishu.js <message>
 *   echo "构建完成，全部测试通过" | node server/scripts/report-feishu.js
 *   node server/scripts/report-feishu.js < server/scripts/sample-report.txt
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

  // Read message from CLI argument, or from stdin (pipe / redirect)
  let content;
  if (process.argv[2]) {
    content = process.argv.slice(2).join(' ');
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    content = Buffer.concat(chunks).toString('utf8').trim();
  } else {
    console.error('用法: node server/scripts/report-feishu.js <报告内容>');
    console.error('  或: echo "报告内容" | node server/scripts/report-feishu.js');
    process.exit(1);
  }

  if (!content) {
    console.error('错误: 报告内容不能为空');
    process.exit(1);
  }

  const message = ['LILITH_REPORT', content].join('\n');

  console.error('发送收尾报告到飞书...');
  const result = await sendFeishuMessage(message);

  if (result.ok) {
    console.error('✓ 收尾报告已发送');
    process.exit(0);
  } else {
    console.error('✗ 发送失败:', result.error);
    process.exit(1);
  }
}

main();
