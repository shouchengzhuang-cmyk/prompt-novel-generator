# 机器学习系统与平台实践：MNIST 全栈骨架

## 证据等级

**高置信度历史题型，不保证 2024 级原题复用。**

上一届公开项目明确包含：

- MNIST 手写数字识别；
- MLP、CNN、RNN/LSTM 三种模型；
- 训练损失和准确率；
- 模型权重保存；
- 后端推理接口；
- 浏览器手写画板。

本目录按同一任务结构重新设计，修正了常见问题：

- 模型输出统一为 logits，推理时再做 softmax；
- 缺少权重时返回明确错误，不拿随机模型糊弄；
- 像素预处理、模型名和权重路径集中管理；
- 训练结果保存为 JSON，便于报告引用；
- 前端只用原生 HTML/JS，减少安装地狱。

## 目录

```text
ml_system_platform/
├─ backend/
│  ├─ model.py      # MLP / CNN / RNN
│  ├─ train.py      # 训练、评估、保存权重
│  └─ app.py        # FastAPI 推理接口
└─ frontend/
   └─ index.html    # 28×28 手写画板
```

## 训练

```bash
cd hebut-ai-2024-junior-prep/labs/semester6/ml_system_platform/backend
python train.py --model cnn --epochs 5 --download
python train.py --model mlp --epochs 5 --download
python train.py --model rnn --epochs 5 --download
```

权重和指标默认写入仓库根目录下的：

```text
artifacts/ml_system_platform/checkpoints/
artifacts/ml_system_platform/metrics/
```

## 启动后端

```bash
uvicorn app:app --reload --port 8000
```

## 启动前端

在另一个终端：

```bash
cd ../frontend
python -m http.server 8080
```

浏览器打开 `http://localhost:8080`。

## 正式课设适配

- 若老师指定 Flask，把 API 层换掉即可，模型层无需重写；
- 若要求训练可视化，可读取 metrics JSON 画图；
- 若指定不同模型或数据集，先保留统一 `build_model` / `predict` 接口；
- 若要求团队分工，把需求、模块、测试和演示责任写进 `docs/requirements-matrix.md`；
- 不要提交下载的数据集、几十兆权重或 `.venv`。
