const crypto = require('crypto');

const ENV_WEBHOOK = 'XMX_FEISHU_WEBHOOK';
const ENV_SECRET = 'XMX_FEISHU_SECRET';

/**
 * Build HMAC-SHA256 signature required by Feishu custom bot with signature verification.
 * @param {number} timestamp - Unix timestamp in seconds
 * @param {string} secret - The signing secret
 * @returns {string} Base64-encoded HMAC-SHA256 digest
 */
function sign(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64');
}

/**
 * Check whether environment variables for Feishu notification are configured.
 * @returns {{ ok: boolean, error?: string }}
 */
function checkConfig() {
  if (!process.env[ENV_WEBHOOK]) {
    return { ok: false, error: `环境变量 ${ENV_WEBHOOK} 未设置，飞书通知不可用。` };
  }
  if (!process.env[ENV_SECRET]) {
    return { ok: false, error: `环境变量 ${ENV_SECRET} 未设置，飞书通知不可用。` };
  }
  return { ok: true };
}

/**
 * Send a text message to Feishu group via custom bot webhook.
 *
 * On error, the full webhook URL and secret are never exposed in logs or error messages.
 * Only the origin/host portion of the URL may appear for debugging purposes.
 *
 * @param {string} text - Plain text message content
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendFeishuMessage(text) {
  const config = checkConfig();
  if (!config.ok) {
    return config;
  }

  const webhook = process.env[ENV_WEBHOOK];
  const secret = process.env[ENV_SECRET];

  const timestamp = Math.floor(Date.now() / 1000);
  const signValue = sign(timestamp, secret);

  const payload = {
    timestamp,
    sign: signValue,
    msg_type: 'text',
    content: {
      text,
    },
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.text();

    if (!response.ok) {
      // Redact sensitive parts: only expose HTTP status and response body (which
      // comes from Feishu, not from our config)
      return { ok: false, error: `飞书消息发送失败 (HTTP ${response.status}): ${body}` };
    }

    let result;
    try {
      result = JSON.parse(body);
    } catch {
      return { ok: false, error: `飞书返回异常: ${body}` };
    }

    if (result.code !== 0) {
      return { ok: false, error: `飞书返回错误 (code ${result.code}): ${result.msg || body}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `飞书消息发送异常: ${err.message}` };
  }
}

module.exports = { sendFeishuMessage, checkConfig };
