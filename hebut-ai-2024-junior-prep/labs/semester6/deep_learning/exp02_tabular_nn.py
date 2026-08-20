from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[3]
TaskKind = Literal["regression", "binary", "multiclass"]


@dataclass(frozen=True)
class TaskData:
    name: str
    kind: TaskKind
    x: object
    y: object
    output_dim: int


def require_dependencies():
    try:
        import numpy as np
        import torch
        from sklearn.datasets import make_blobs, make_moons, make_regression
        from sklearn.model_selection import KFold
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise SystemExit(
            "缺少依赖。请执行: python -m pip install numpy scikit-learn torch"
        ) from exc
    return np, torch, make_blobs, make_moons, make_regression, KFold, StandardScaler


def main() -> None:
    parser = argparse.ArgumentParser(description="深度学习历史题型：多任务 MLP 与 K 折验证")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--folds", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/deep_learning/exp02_results.json"
    )
    args = parser.parse_args()
    if args.epochs < 1 or args.folds < 2:
        raise SystemExit("epochs 必须 >=1，folds 必须 >=2")

    np, torch, make_blobs, make_moons, make_regression, KFold, StandardScaler = require_dependencies()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    x_reg, y_reg = make_regression(
        n_samples=360, n_features=4, noise=12.0, random_state=args.seed
    )
    x_bin, y_bin = make_moons(n_samples=420, noise=0.20, random_state=args.seed)
    x_multi, y_multi = make_blobs(
        n_samples=450, centers=3, n_features=2, cluster_std=1.25, random_state=args.seed
    )
    tasks = [
        TaskData("regression", "regression", x_reg, y_reg.reshape(-1, 1), 1),
        TaskData("binary", "binary", x_bin, y_bin.reshape(-1, 1), 1),
        TaskData("multiclass", "multiclass", x_multi, y_multi, 3),
    ]

    class MLP(torch.nn.Module):
        def __init__(self, input_dim: int, output_dim: int):
            super().__init__()
            self.network = torch.nn.Sequential(
                torch.nn.Linear(input_dim, 32),
                torch.nn.ReLU(),
                torch.nn.Linear(32, 16),
                torch.nn.ReLU(),
                torch.nn.Linear(16, output_dim),
            )

        def forward(self, inputs):
            return self.network(inputs)

    def train_fold(task: TaskData, train_idx, test_idx, fold_seed: int) -> dict[str, object]:
        torch.manual_seed(fold_seed)
        scaler = StandardScaler()
        x_train = scaler.fit_transform(task.x[train_idx]).astype("float32")
        x_test = scaler.transform(task.x[test_idx]).astype("float32")
        x_train_tensor = torch.from_numpy(x_train)
        x_test_tensor = torch.from_numpy(x_test)

        if task.kind == "multiclass":
            y_train_tensor = torch.from_numpy(task.y[train_idx].astype("int64"))
            y_test_tensor = torch.from_numpy(task.y[test_idx].astype("int64"))
            criterion = torch.nn.CrossEntropyLoss()
        else:
            y_train_tensor = torch.from_numpy(task.y[train_idx].astype("float32"))
            y_test_tensor = torch.from_numpy(task.y[test_idx].astype("float32"))
            criterion = torch.nn.MSELoss() if task.kind == "regression" else torch.nn.BCEWithLogitsLoss()

        model = MLP(x_train.shape[1], task.output_dim)
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
        loss_history = []
        model.train()
        for _ in range(args.epochs):
            optimizer.zero_grad()
            logits = model(x_train_tensor)
            loss = criterion(logits, y_train_tensor)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()
            loss_history.append(float(loss.detach()))

        model.eval()
        with torch.no_grad():
            outputs = model(x_test_tensor)
            if task.kind == "regression":
                metric_name = "mse"
                metric = float(torch.mean((outputs - y_test_tensor) ** 2))
            elif task.kind == "binary":
                metric_name = "accuracy"
                predictions = (torch.sigmoid(outputs) >= 0.5).to(torch.int64)
                metric = float((predictions == y_test_tensor.to(torch.int64)).float().mean())
            else:
                metric_name = "accuracy"
                predictions = outputs.argmax(dim=1)
                metric = float((predictions == y_test_tensor).float().mean())
        return {
            "metric_name": metric_name,
            "metric": metric,
            "initial_loss": loss_history[0],
            "final_loss": loss_history[-1],
            "loss_history": loss_history,
        }

    results: dict[str, object] = {
        "seed": args.seed,
        "epochs": args.epochs,
        "folds": args.folds,
        "tasks": {},
    }
    splitter = KFold(n_splits=args.folds, shuffle=True, random_state=args.seed)
    for task in tasks:
        fold_results = [
            train_fold(task, train_idx, test_idx, args.seed + fold_index)
            for fold_index, (train_idx, test_idx) in enumerate(splitter.split(task.x), start=1)
        ]
        average_metric = sum(float(item["metric"]) for item in fold_results) / len(fold_results)
        results["tasks"][task.name] = {
            "metric_name": fold_results[0]["metric_name"],
            "average_metric": average_metric,
            "folds": fold_results,
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
