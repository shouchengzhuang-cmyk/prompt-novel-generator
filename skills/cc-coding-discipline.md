# Skill — CC Coding Discipline

用于普通改代码、修 bug、排错、重构、UI 调整。

## 1. Think Before Coding

修改前先理解项目结构，不要凭空假设。

执行前说明：

- 你的理解；
- 计划改哪些文件；
- 风险点；
- 验收方式。

不确定时先说明不确定点。能根据现有信息继续推进的，不要反复追问。

## 2. Simplicity First

- 只做用户要求的事。
- 不顺手大重构。
- 不引入无必要抽象。
- 不新增依赖，除非用户明确要求。
- 能 50 行解决，不写 200 行。

## 3. Surgical Changes

- 只改必要文件。
- 不随意格式化无关代码。
- 不重命名已有变量、函数、路径。
- 不删除无关代码。
- 如果发现无关问题，只汇报，不擅自处理。

## 4. Verify Before Reporting Success

优先运行：

```bash
npm run build
```

如果涉及后端语法，可运行：

```bash
node --check server/index.js
```

如果命令失败，不要说完成。先给出错误、原因判断和下一步。

## 5. Report Format

完成后按这个格式汇报：

```md
哥哥，改好了。

## 修改文件

1. `file path`
   - 改动内容
   - 改动原因

## 验证

- 运行：`npm run build`
- 结果：通过 / 失败

## 下一步

你现在执行：

```bash
xxx
```
```
