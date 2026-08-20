# 河北工业大学人工智能 2024 级：大三课程预制实验库

> 目标：把“老师发作业后从零开工”变成“对照要求、替换数据、重新运行、补充分析”。
>
> 本目录是**预学习与适配工具箱**，不是可直接冒充本人完成情况提交的成品作业。

## 已确认的大三课程

依据河北工业大学人工智能与数据科学学院公开的 2024 级培养方案，大三专业必修与集中实践如下：

| 学期 | 课程 | 实验/实践量 | 本库状态 |
|---|---|---:|---|
| 第 5 学期 | 机器学习与模式识别 | 16 学时实验 | 通用基线与报告骨架 |
| 第 5 学期 | 数据挖掘 | 8 学时实验 | **历届题型高置信度，3 个可运行实验** |
| 第 5 学期 | 计算智能 | 16 学时实验 | GA / PSO 可运行实现 |
| 第 5 学期 | 数值分析与数值优化 | 8 学时实验 | 二分法、牛顿法、梯度下降 |
| 第 5 学期 | 软件设计与编程实践 | 2 周 | 工程脚手架与验收清单 |
| 第 6 学期 | 计算机视觉 | 8 学时实验 | **上一届题型高置信度，车道线与 CIFAR-10 骨架** |
| 第 6 学期 | 深度学习 | 16 学时实验 | **上一届题型高置信度，PyTorch 基础与多任务 MLP** |
| 第 6 学期 | 自然语言处理 | 8 学时实验 | 通用文本分类基线；具体题目待核 |
| 第 6 学期 | 机器学习系统与平台实践 | 2 周 | **上一届题型高置信度，MNIST 全栈骨架** |

课程证据、来源和置信度见 [`docs/evidence-matrix.md`](docs/evidence-matrix.md)。

## 最值得先跑的部分

### 1. 数据挖掘三连

历史公开材料反复出现以下链路：

1. 销售数据预处理：日期补全、负数修正、表合并、字段规整；
2. 商品类别 × 商店 × 日期的 OLAP 数据立方体；
3. 基于交易记录的 Apriori 频繁项集挖掘。

```bash
cd hebut-ai-2024-junior-prep
python labs/semester5/data_mining/lab01_preprocessing.py
python labs/semester5/data_mining/lab02_olap_cube.py
python labs/semester5/data_mining/lab03_apriori.py --min-support 2
```

生成文件写入 `artifacts/`，不会污染样例数据。

### 2. 轻量算法库

```bash
python labs/semester5/ml_pattern_recognition/baseline.py
python labs/semester5/computational_intelligence/demo.py
python labs/semester5/numerical_optimization/demo.py
```

这些模块只依赖 Python 标准库，便于先验证算法逻辑。

### 3. 深度学习 / CV / 平台实践

重型实验依赖放在 `requirements-optional.txt`，默认测试不会下载数据集或训练大模型。

```bash
python -m pip install -r requirements-optional.txt
python labs/semester6/deep_learning/exp01_autograd.py
python labs/semester6/deep_learning/exp02_tabular_nn.py --epochs 30
```

机器学习平台实践的完整说明见：

- [`labs/semester6/ml_system_platform/README.md`](labs/semester6/ml_system_platform/README.md)
- `backend/`：MLP / CNN / RNN、训练脚本、推理 API；
- `frontend/index.html`：手写画板。

## 本地验证

核心模块完全基于标准库：

```bash
python -m unittest discover -s tests -v
python -m compileall -q src labs tests
```

也可执行：

```bash
python scripts/check.py
```

## 老师发正式要求后的正确用法

把要求原文和数据放进新分支，再给 Codex：

```text
阅读老师本次实验要求与 hebut-ai-2024-junior-prep/docs/evidence-matrix.md。
先列出“正式要求 vs 预制实现”的差异，不要直接改代码。
确认数据字段、算法约束、输出格式、报告章节和评分点后：
1. 在独立目录适配本次实验；
2. 重新运行并保存真实输出；
3. 添加可复现命令和测试；
4. 生成报告草稿，但所有结果必须来自本次运行；
5. 标出仍需本人解释、截图或核验的部分。
```

更完整的提示词见 [`docs/codex-playbook.md`](docs/codex-playbook.md)。

## 边界

- 没有复制历届学生的报告、姓名、运行结果或大体量数据；
- 高置信度表示“确有河工大历届公开材料对应”，**不代表 2024 级会原题复用**；
- 课程教师、数据集、格式和评分标准都可能变化；
- 提交前必须按正式要求重新运行、理解并核验。

详见 [`ACADEMIC_INTEGRITY.md`](ACADEMIC_INTEGRITY.md)。
