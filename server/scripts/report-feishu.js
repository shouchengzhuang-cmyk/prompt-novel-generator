/**
 * Generic task completion report script for Feishu notification.
 *
 * Usage:
 *   node server/scripts/report-feishu.js "构建通过，测试通过，部署完成。"
 *   node server/scripts/report-feishu.js --file report.md
 *
 * Prerequisites:
 *   Set XMX_FEISHU_WEBHOOK and XMX_FEISHU_SECRET in server/.env
 */
const path = require('path');
const fs = require('fs/promises');
const childProcess = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendFeishuMessage, checkConfig, formatReportMessage } = require('../services/feishuNotifier');

// ---- helpers ----

function detectWindowsCodePage() {
  try {
    const buf = childProcess.execSync('chcp', { encoding: 'buffer', timeout: 2000 });
    const out = buf.toString('ascii');
    const m = out.match(/(\d+)/);
    if (!m) return null;
    const map = {
      936: 'gbk',
      950: 'big5',
      932: 'shift-jis',
      949: 'euc-kr',
      65001: 'utf-8',
    };
    return map[parseInt(m[1], 10)] || null;
  } catch {
    return null;
  }
}

/**
 * Detect Windows PowerShell 5.1 encoding corruption:
 * PowerShell prepends UTF-8 BOM to piped output, but $OutputEncoding
 * (default US-ASCII) replaces non-ASCII characters with `?` before the
 * data reaches the external process. The result is BOM + ASCII-only
 * content with `?` where Chinese characters should be.
 */
function hasEncodingCorruption(buf) {
  if (buf.length < 4) return false;
  if (buf[0] !== 0xEF || buf[1] !== 0xBB || buf[2] !== 0xBF) return false;
  for (let i = 3; i < buf.length; i++) {
    if (buf[i] > 0x7F) return false;
  }
  return true;
}

function decodeStdinBuffer(buf) {
  if (buf.length === 0) return '';

  // UTF-16 BOM
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le', 2);
  }

  // UTF-8 BOM
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    if (hasEncodingCorruption(buf)) {
      return null;
    }
    return buf.toString('utf8', 3);
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

  // Non-fatal UTF-8 as last resort
  return buf.toString('utf8');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  const text = decodeStdinBuffer(buf);
  if (text === null) {
    console.error('');
    console.error('错误: 当前 stdin 内容疑似编码损坏（PowerShell 5.1 $OutputEncoding 默认不支持中文）。');
    console.error('      请改用以下方式：');
    console.error('        node server/scripts/report-feishu.js "中文报告内容"');
    console.error('        node server/scripts/report-feishu.js --file report.md');
    console.error('');
    return null;
  }
  return text.trim();
}

// ---- main ----

async function main() {
  const config = checkConfig();
  if (!config.ok) {
    console.error(config.error);
    console.error('请在 server/.env 中配置后重试：');
    process.exit(1);
  }

  let content;

  if (process.argv[2] === '--file') {
    // --file <path>
    const filePath = process.argv[3];
    if (!filePath) {
      console.error('错误: --file 需要指定文件路径。用法:');
      console.error('  node server/scripts/report-feishu.js --file report.md');
      process.exit(1);
    }
    try {
      const raw = await fs.readFile(path.resolve(filePath), 'utf-8');
      content = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
      content = content.trim();
    } catch (err) {
      console.error(`错误: 无法读取文件 "${filePath}": ${err.message}`);
      process.exit(1);
    }
  } else if (process.argv[2]) {
    // CLI argument
    content = process.argv.slice(2).join(' ');
  } else if (!process.stdin.isTTY) {
    // stdin pipe (not recommended for Chinese)
    content = await readStdin();
    if (content === null) {
      process.exit(1);
    }
  } else {
    console.error('');
    console.error('用法: node server/scripts/report-feishu.js "报告内容"');
    console.error('       node server/scripts/report-feishu.js --file report.md');
    console.error('');
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
    process.exitCode = 0;
  } else {
    console.error('✗ 发送失败:', result.error);
    process.exitCode = 1;
  }
}

main();
