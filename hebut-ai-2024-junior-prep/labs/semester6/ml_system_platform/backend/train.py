from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from model import build_model

ROOT = Path(__file__).resolve().parents[4]


def require_dependencies():
    try:
        import numpy as np
        import torch
        import torchvision
        import torchvision.transforms as transforms
    except ImportError as exc:
        raise SystemExit("缺少依赖，请安装 numpy torch torchvision") from exc
    return np, torch, torchvision, transforms


def evaluate(model, loader, criterion, device, torch):
    model.eval()
    total_loss = 0.0
    correct = 0
    count = 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            total_loss += float(criterion(logits, labels)) * len(labels)
            correct += int((logits.argmax(dim=1) == labels).sum())
            count += len(labels)
    return total_loss / count, correct / count


def main() -> None:
    parser = argparse.ArgumentParser(description="MNIST MLP/CNN/RNN 训练脚本")
    parser.add_argument("--model", choices=("mlp", "cnn", "rnn"), default="cnn")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, default=0, help="0 表示使用完整训练集")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--data", type=Path, default=ROOT / "data/mnist")
    parser.add_argument(
        "--artifacts", type=Path, default=ROOT / "artifacts/ml_system_platform"
    )
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.learning_rate <= 0 or args.limit < 0:
        raise SystemExit("epochs/batch-size 必须为正，learning-rate >0，limit >=0")

    np, torch, torchvision, transforms = require_dependencies()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    transform = transforms.Compose(
        [transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))]
    )
    train_dataset = torchvision.datasets.MNIST(
        root=args.data, train=True, download=args.download, transform=transform
    )
    test_dataset = torchvision.datasets.MNIST(
        root=args.data, train=False, download=args.download, transform=transform
    )
    if args.limit:
        train_dataset = torch.utils.data.Subset(train_dataset, range(min(args.limit, len(train_dataset))))

    generator = torch.Generator().manual_seed(args.seed)
    train_loader = torch.utils.data.DataLoader(
        train_dataset, batch_size=args.batch_size, shuffle=True, generator=generator
    )
    test_loader = torch.utils.data.DataLoader(
        test_dataset, batch_size=args.batch_size, shuffle=False
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(args.model).to(device)
    criterion = torch.nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        correct = 0
        count = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()
            total_loss += float(loss.detach()) * len(labels)
            correct += int((logits.argmax(dim=1) == labels).sum())
            count += len(labels)

        test_loss, test_accuracy = evaluate(model, test_loader, criterion, device, torch)
        epoch_result = {
            "epoch": epoch,
            "train_loss": total_loss / count,
            "train_accuracy": correct / count,
            "test_loss": test_loss,
            "test_accuracy": test_accuracy,
        }
        history.append(epoch_result)
        print(json.dumps(epoch_result, ensure_ascii=False))

    checkpoint_dir = args.artifacts / "checkpoints"
    metrics_dir = args.artifacts / "metrics"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    metrics_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = checkpoint_dir / f"mnist_{args.model}.pt"
    torch.save(
        {
            "model_name": args.model,
            "state_dict": model.state_dict(),
            "seed": args.seed,
            "normalization": {"mean": 0.1307, "std": 0.3081},
        },
        checkpoint,
    )
    metrics = {
        "model": args.model,
        "device": str(device),
        "seed": args.seed,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "train_size": len(train_dataset),
        "test_size": len(test_dataset),
        "history": history,
        "checkpoint": str(checkpoint),
    }
    metrics_path = metrics_dir / f"mnist_{args.model}.json"
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"权重: {checkpoint}")
    print(f"指标: {metrics_path}")


if __name__ == "__main__":
    main()
