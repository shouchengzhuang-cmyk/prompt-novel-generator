# 结果先行的实验报告流水线

这套工具解决的不是“帮你编一篇看起来像实验报告的文字”，而是把最耗时间的部分固定下来：

1. 把老师要求转成**结果合同**；
2. 运行实验并统一保存表格、图像、日志和模型产物；
3. 用 `result-manifest.json` 记录每个数字来自哪里；
4. 先审计产物是否齐全，再生成 Markdown 报告草稿；
5. 本人只需核对结论、补身份信息、按模板排版并准备答辩。

## 目录角色

- `contracts.json`：按历届题型总结的“最终应出现哪些结果”；
- `example_manifest.json`：完整示例；
- `audit_artifacts.py`：检查文件、指标、证据引用和合同缺项；
- `build_report.py`：从真实结果清单生成报告草稿；
- `../scripts/init_assignment.py`：创建一次新实验的工作目录。

## 收到作业后的推荐命令

```bash
cd hebut-ai-2024-junior-prep

python scripts/init_assignment.py \
  --course "计算机视觉" \
  --experiment "实验二：CIFAR-10 分类" \
  --contract cv-exp2 \
  --output work/2027-cv-exp2
```

生成目录：

```text
work/2027-cv-exp2/
├── teacher/               # 老师原始要求、数据说明、模板
├── artifacts/             # 本次实际运行输出
├── result-manifest.json   # 结果与证据索引
└── README.md              # 操作顺序
```

实验运行完成后：

```bash
python reporting/audit_artifacts.py work/2027-cv-exp2/result-manifest.json
python reporting/build_report.py \
  work/2027-cv-exp2/result-manifest.json \
  --output work/2027-cv-exp2/实验报告草稿.md \
  --allow-warnings
```

## 结果清单的核心规则

- 所有路径必须是相对路径，禁止 `D:\\...` 或 `/home/...`；
- 每个指标都要有 `source`，指向日志或结果文件；
- 每条结论必须引用存在的证据 ID；
- 图表、CSV、模型清单和截图必须真实存在；
- `TODO` 会被列入提交前人工核验；
- 合同中的必需产物缺失时，报告不会生成。

## 为什么不直接生成 Word

当届老师通常会发自己的封面、字号、页边距和章节模板。现在提前锁死 Word 格式反而容易白做。这里先生成结构清晰、证据可追踪的 Markdown；收到正式模板后，再由未来 GPT/Codex 将内容映射进指定 DOCX。

## 合同不是原题承诺

`contracts.json` 分为高、中、低置信度。高置信度表示找到过河工大近届公开实验结构，不表示 2024 级一定原样复用。正式要求永远优先；不匹配时应改合同，而不是硬把老师题目塞进旧答案。
