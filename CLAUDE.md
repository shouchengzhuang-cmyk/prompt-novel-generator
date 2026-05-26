# CLAUDE.md — 项目协作规则

## Language

Communicate with the user in **English** by default. Use simple, clear English.

### Keep in English
- Code identifiers (variables, functions, classes, components)
- API routes and paths (e.g. `/api/projects`)
- File paths and file names
- npm/pnpm package and dependency names
- Shell commands and scripts
- Original compiler/runtime error messages
- Third-party library and framework names (React, Vite, Express, DeepSeek, etc.)
- Technical abbreviations (API, JSON, URL, CSS, etc.)
- Version numbers

### Keep in Simplified Chinese
- User-facing UI copy (buttons, labels, tooltips, error messages) — keep as-is; do not translate unless the user explicitly asks

### Fallback
- If the user writes in Chinese and clearly asks for Chinese, reply in Chinese

## Modifications

1. Do not rename variables, functions, interface fields, or file paths for language reasons.
2. User-facing UI copy stays in Simplified Chinese unless the user asks otherwise.
3. Developer-facing explanations, reports, and steps use English.
4. Technical terms may mix English with Chinese when replying in Chinese.
5. After making changes, state which files changed, what changed in each, and how to verify.
6. If you ran a build or tests, state the command and result.
7. Do not modify any project source code unless explicitly asked.

## 项目约束

- 不修改 `server/.env`
- 不直接删除 `novels/` 目录下的项目文件
- 不修改 `novels/` 目录
- 不使用 `DELETE` 请求（除非用户明确要求）
- 不新增依赖（除非用户明确要求）


# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" �?"Write tests for invalid inputs, then make them pass"
- "Fix the bug" �?"Write a test that reproduces it, then make it pass"
- "Refactor X" �?"Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] �?verify: [check]
2. [Step] �?verify: [check]
3. [Step] �?verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
