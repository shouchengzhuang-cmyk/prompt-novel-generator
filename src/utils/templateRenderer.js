/**
 * 将模板中的 {{变量名}} 替换为实际值。
 * @param {string} template - 含 {{var}} 占位符的模板字符串
 * @param {object} variables - { varName: value, ... }
 * @returns {string} 替换后的文本
 */
export function renderTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  return result;
}

/**
 * 从模板文本中提取所有 {{变量名}}。
 * @param {string} template
 * @returns {string[]} 变量名数组
 */
export function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  return [...new Set(matches ? matches.map((m) => m.slice(2, -2)) : [])];
}
