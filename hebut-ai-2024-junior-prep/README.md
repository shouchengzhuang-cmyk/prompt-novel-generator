# 河北工业大学人工智能 2024 级：大三课程预制实验库

> 目标：把“老师发作业后从零开工”变成“对照要求、批量生成结果、自动审计、映射报告模板”。
>
> 本目录是**预学习、结果生成与适配工具箱**，不是可直接改名提交的历届答案。

## 已确认的大三课程

依据河北工业大学人工智能与数据科学学院公开的 2024 级培养方案：

| 学期 | 课程 | 实验/实践量 | 当前准备状态 |
|---|---|---:|---|
| 第 5 学期 | 机器学习与模式识别 | 16 学时实验 | 通用分类基线与结果合同 |
| 第 5 学期 | 数据挖掘 | 8 学时实验 | **历届五实验序列；前三项可运行** |
| 第 5 学期 | 计算智能 | 16 学时实验 | GA / PSO、多随机种子结果合同 |
| 第 5 学期 | 数值分析与数值优化 | 8 学时实验 | 二分法、牛顿法、梯度下降、迭代合同 |
| 第 5 学期 | 软件设计与编程实践 | 2 周 | 工程脚手架、需求追踪和验收清单 |
| 第 6 学期 | 计算机视觉 | 8 学时实验 | **2026 近届题型：车道线与 CIFAR-10** |
| 第 6 学期 | 深度学习 | 16 学时实验 | **2026 近届题型：自动求导与多任务 FNN** |
| 第 6 学期 | 自然语言处理 | 8 学时实验 | 文本分类基线；情感分类与 KG/RAG 候选合同 |
| 第 6 学期 | 机器学习系统与平台实践 | 2 周 | **同名课程近届 MNIST 全栈骨架** |

证据、来源和不确定性见：

- [`docs/evidence-matrix.md`](docs/evidence-matrix.md)
- [`docs/sources.md`](docs/sources.md)
- [`docs/future-gpt-context.md`](docs/future-gpt-context.md)

## 这次升级真正解决什么

公开近届材料显示，很多作业最费时间的不是算法本身，而是：

- 5 张图 × 4 组参数之类的批量结果；
- 20%/40%/60% 缺失率的完整评估矩阵；
- 模型、参数、随机种子和耗时的统一对比；
- 混淆矩阵、训练曲线、错误样例和界面截图；
- 把每个数字插进最终实验报告；
- 临交前发现少图、少表、路径错、指标没来源。

因此本库现在有两层：

1. **算法与工程骨架**：减少从零编码；
2. **结果合同与报告流水线**：减少跑参、整理、截图、写报告和验收劳动。

## 结果先行流水线

### 1. 初始化一次正式实验

```bash
cd hebut-ai-2024-junior-prep

python scripts/init_assignment.py \
  --course "计算机视觉" \
  --experiment "实验二：CIFAR-10 分类" \
  --contract cv-exp2 \
  --output work/2027-cv-exp2
```

### 2. 运行实验并保存真实产物

统一写入本次目录的 `artifacts/`：

- 指标 JSON；
- 参数扫描 CSV；
- 逐样本预测；
- 图表 PNG/SVG；
- 完整日志；
- 模型/接口/截图产物。

### 3. 审计结果是否齐全

```bash
python reporting/audit_artifacts.py work/2027-cv-exp2/result-manifest.json
```

### 4. 生成报告草稿

```bash
python reporting/build_report.py \
  work/2027-cv-exp2/result-manifest.json \
  --output work/2027-cv-exp2/实验报告草稿.md \
  --allow-warnings
```

收到老师 Word 模板后，再由未来 GPT/Codex 做格式映射，不重新编造结果。

详细说明：

- [`reporting/README.md`](reporting/README.md)
- [`docs/result-contracts.md`](docs/result-contracts.md)
- [`docs/final-report-blueprints.md`](docs/final-report-blueprints.md)
- [`docs/report-template.md`](docs/report-template.md)
- [`docs/codex-playbook.md`](docs/codex-playbook.md)

## 已预制的可运行部分

### 数据挖掘三连

```bash
python labs/semester5/data_mining/lab01_preprocessing.py
python labs/semester5/data_mining/lab02_olap_cube.py
python labs/semester5/data_mining/lab03_apriori.py --min-support 2
```

### 轻量算法库

```bash
python labs/semester5/ml_pattern_recognition/baseline.py
python labs/semester5/computational_intelligence/demo.py
python labs/semester5/numerical_optimization/demo.py
python labs/semester6/nlp/text_classification.py
```

### 深度学习 / CV / 平台实践

重型依赖见 `requirements-optional.txt`：

```bash
python -m pip install -r requirements-optional.txt
python labs/semester6/deep_learning/exp01_autograd.py
python labs/semester6/deep_learning/exp02_tabular_nn.py --epochs 30
```

机器学习平台实践：

- [`labs/semester6/ml_system_platform/README.md`](labs/semester6/ml_system_platform/README.md)
- `backend/`：MLP / CNN / RNN、训练脚本、推理 API；
- `frontend/index.html`：手写画板。

## 本地验证

```bash
python scripts/check.py
```

也可分开执行：

```bash
python -m unittest discover -s tests -v
python -m compileall -q src labs reporting scripts tests
```

## 老师发正式要求后的正确用法

给未来 GPT/Codex 的第一句话不应是“帮我写完”，而是：

```text
阅读 teacher/ 中的老师原始要求、docs/future-gpt-context.md、
docs/evidence-matrix.md 和 reporting/contracts.json。
先提取评分点和最终交付物，输出正式要求与历史合同的差异表。
修订本次结果合同后，再适配代码、批量运行、保存真实产物、
填写 result-manifest.json、通过审计，最后生成报告草稿。
```

这样即使以后套餐降级，模型也不用重新考古整个专业的作业生态。

## 边界

- 不复制历届学生报告、姓名、学号、权重或历史数字；
- 高置信度表示确有河工大公开材料对应，**不表示 2024 级原题复用**；
- 学生公开仓库不是教师官方答案；
- 当届课程教师、数据集、指定框架、图像数量和模板都可能变化；
- 所有正式结果必须在用户自己的环境重新运行；
- 报告必须由本人核验并能够解释。

详见 [`ACADEMIC_INTEGRITY.md`](ACADEMIC_INTEGRITY.md)。
