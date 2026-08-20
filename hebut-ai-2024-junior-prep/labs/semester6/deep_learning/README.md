# 深度学习：上一届题型预制

## 证据等级

**高置信度历史题型，不保证 2024 级原题复用。**

上一届公开仓库明确标注“hebut 大三下深度学习实验”，包含教师版实验要求和两份 notebook。可见内容包括：

- PyTorch 张量、自动求导、梯度与梯度截断；
- 合成回归、二分类、多分类数据；
- MLP 训练与评价；
- K 折交叉验证。

本目录重新实现了两份可运行脚本：

```bash
python labs/semester6/deep_learning/exp01_autograd.py
python labs/semester6/deep_learning/exp02_tabular_nn.py --epochs 30
```

结果写入 `artifacts/deep_learning/`。

## 正式题目到手后核对

- 是否必须 notebook；
- 网络层数、激活函数和优化器；
- 回归/分类数据生成参数；
- K 折数量与指标；
- 是否要求手写反向传播；
- 图表、截图和报告章节。
