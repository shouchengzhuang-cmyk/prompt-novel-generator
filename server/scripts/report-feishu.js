/**
 * Generic task completion report script for Feishu notification.
 *
 * Usage (recommended):
 *   node server/scripts/report-feishu.js "构建通过，测试通过，部署完成。"
 *
 * Usage (stdin pipe — Windows PowerShell 注意编码问题，见下方说明):
 *   echo "构建通过" | node server/scripts/report-feishu.js
 *   Get-Content report.txt -Raw | node server/scripts/report-feishu.js
 *
 * Prerequisites:
 *   Set XMX_FEISHU_WEBHOOK and XMX_FEISHU_SECRET in server/.env
 *
 * Windows PowerShell stdin 编码说明:
 *   PowerShell 5.1 管道输出到外部程序时默认使用 $OutputEncoding，
 *   PowerShell 5.1 下 $OutputEncoding 可能无法正确处理中文字符。
 *   推荐做法：
 *   - 优先用命令行参数传中文（本脚本首选方式）
 *   - 如果必须用 stdin，执行前置命令：
 *     $OutputEncoding = [Console]::OutputEncoding
 *     然后 | node server/scripts/report-feishu.js
 *   - 或在 Windows Terminal / VS Code 终端（UTF-8 环境）中执行
 */
const path = require('path');
const childProcess = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendFeishuMessage, checkConfig, formatReportMessage } = require('../services/feishuNotifier');

function detectWindowsCodePage() {
  try {
    const buf = childProcess.execSync('chcp', { encoding: 'buffer', timeout: 2000 });
    const out = buf.toString('ascii');
    const m = out.match(/(\d+)/);
    if (!m) return null;
    const cp = parseInt(m[1], 10);
    const map = {
      936: 'gbk',
      950: 'big5',
      932: 'shift-jis',
      949: 'euc-kr',
      65001: 'utf-8',
    };
    return map[cp] || null;
  } catch {
    return null;
  }
}

/**
 * Detect Windows PowerShell 5.1 encoding corruption:
 * PowerShell prepends UTF-8 BOM to piped output, but $OutputEncoding
 * (default US-ASCII) replaces non-ASCII characters with `?` before the
 * data reaches the external process. The result is BOM + ASCII content
 * with `?` where Chinese characters should be.
 */
function looksLikePowerShellEncodingCorruption(buf) {
  if (buf.length < 4) return false;
  // Check: starts with UTF-8 BOM (EF BB BF)
  if (buf[0] !== 0xEF || buf[1] !== 0xBB || buf[2] !== 0xBF) return false;
  // Check: remaining content is entirely ASCII (no bytes 0x80-0xFF)
  for (let i = 3; i < buf.length; i++) {
    if (buf[i] > 0x7F) return false;
  }
  return true;
}

function decodeStdinBuffer(buf) {
  if (buf.length === 0) return '';

  // BOM detection
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le', 2);
  }
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    // UTF-8 BOM — check for PowerShell pipe encoding corruption
    const corrupted = looksLikePowerShellEncodingCorruption(buf);
    const text = buf.toString('utf8', 3);
    if (corrupted && text.includes('?')) {
      console.error('⚠ PowerShell 管道编码警告: $OutputEncoding 默认不支持中文。');
      console.error('   推荐改用命令行参数方式:');
      console.error('     node server/scripts/report-feishu.js "中文报告内容"');
      console.error('   或在管道前设置编码:');
      console.error('     $OutputEncoding = [Console]::OutputEncoding');
      console.error('   然后重新执行管道命令。');
    }
    return text;
  }

  // Strict UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {}

  // Windows: try system code page
  if (process.platform === 'win32') {
    const cpLabel = detectWindowsCodePage();
    if (cpLabel) {
      try {
        return new TextDecoder(cpLabel, { fatal: true }).decode(buf);
      } catch {}
    }
  }

  // Non-fatal UTF-8 as last resort (may show replacement chars)
  return buf.toString('utf8');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return decodeStdinBuffer(Buffer.concat(chunks)).trim();
}

async function main() {
  const config = checkConfig();
  if (!config.ok) {
    console.error(config.error);
    console.error('请在 server/.env 中配置后重试：');
    console.error('  XMX_FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...');
    console.error('  XMX_FEISHU_SECRET=...');
    process.exit(1);
  }

  // Read message from CLI argument (preferred), or from stdin
  let content;
  if (process.argv[2]) {
    content = process.argv.slice(2).join(' ');
  } else if (!process.stdin.isTTY) {
    content = await readStdin();
  } else {
    console.error('');
    console.error('用法: node server/scripts/report-feishu.js <报告内容>');
    console.error('  或: echo "报告内容" | node server/scripts/report-feishu.js');
    console.error('');
    console.error('提示: 中文消息推荐使用命令行参数方式，避免 Windows 管道编码问题。');
    process.exit(1);
  }

  if (!content) {
    console.error('错误: 报告内容不能为空');
    process.exit(1);
  }

  const message = formatReportMessage(content);

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
