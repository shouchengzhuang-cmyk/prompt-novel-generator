from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def require_torch():
    try:
        import torch
    except ImportError as exc:
        raise SystemExit(
            "缺少 PyTorch。请先执行: python -m pip install torch torchvision"
        ) from exc
    return torch


def main() -> None:
    parser = argparse.ArgumentParser(description="深度学习历史题型：自动求导与梯度截断")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/deep_learning/exp01_results.json"
    )
    args = parser.parse_args()
    torch = require_torch()
    torch.manual_seed(42)

    x = torch.tensor([2.0, 3.0], requires_grad=True)
    y = x**2 + 4 * x
    loss = y.sum()
    loss.backward()
    raw_gradient = x.grad.detach().clone()

    raw_norm = float(torch.linalg.vector_norm(x.grad))
    torch.nn.utils.clip_grad_norm_([x], max_norm=1.0)
    clipped_gradient = x.grad.detach().clone()
    clipped_norm = float(torch.linalg.vector_norm(x.grad))

    # 再演示一个可训练参数，避免只会背 backward() 三件套。
    weight = torch.tensor([0.0], requires_grad=True)
    inputs = torch.tensor([1.0, 2.0, 3.0])
    targets = torch.tensor([2.0, 4.0, 6.0])
    optimizer = torch.optim.SGD([weight], lr=0.1)
    history = []
    for _ in range(20):
        optimizer.zero_grad()
        prediction = inputs * weight
        mse = torch.mean((prediction - targets) ** 2)
        mse.backward()
        optimizer.step()
        history.append(float(mse.detach()))

    results = {
        "function": "sum(x^2 + 4x)",
        "x": x.detach().tolist(),
        "expected_gradient": [8.0, 10.0],
        "raw_gradient": raw_gradient.tolist(),
        "raw_norm": raw_norm,
        "clipped_gradient": clipped_gradient.tolist(),
        "clipped_norm": clipped_norm,
        "learned_weight": float(weight.detach()),
        "linear_regression_loss_history": history,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
