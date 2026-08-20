from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CLASS_NAMES = ["airplane", "automobile", "bird", "cat", "deer", "dog", "frog", "horse", "ship", "truck"]


def require_common():
    try:
        import numpy as np
        import torch
        import torchvision
        import torchvision.transforms as transforms
        from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
    except ImportError as exc:
        raise SystemExit(
            "缺少依赖。请执行: python -m pip install numpy torch torchvision scikit-learn"
        ) from exc
    return np, torch, torchvision, transforms, accuracy_score, confusion_matrix, f1_score


def save_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_traditional(train_dataset, test_dataset, train_limit: int, test_limit: int, output: Path):
    try:
        import numpy as np
        from sklearn.neighbors import KNeighborsClassifier
        from sklearn.svm import LinearSVC
        from skimage.color import rgb2gray
        from skimage.feature import hog
        from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
    except ImportError as exc:
        raise SystemExit(
            "传统方法缺少依赖。请安装 scikit-image scikit-learn numpy"
        ) from exc

    x_train = train_dataset.data[:train_limit]
    y_train = np.asarray(train_dataset.targets[:train_limit])
    x_test = test_dataset.data[:test_limit]
    y_test = np.asarray(test_dataset.targets[:test_limit])

    def hog_features(images):
        return np.asarray(
            [
                hog(
                    rgb2gray(image),
                    orientations=9,
                    pixels_per_cell=(8, 8),
                    cells_per_block=(2, 2),
                )
                for image in images
            ]
        )

    def colour_histograms(images):
        features = []
        for image in images:
            channel_features = [
                np.histogram(image[:, :, channel], bins=8, range=(0, 256), density=True)[0]
                for channel in range(3)
            ]
            features.append(np.concatenate(channel_features))
        return np.asarray(features)

    train_hog, test_hog = hog_features(x_train), hog_features(x_test)
    train_colour, test_colour = colour_histograms(x_train), colour_histograms(x_test)
    train_combined = np.concatenate([train_hog, train_colour], axis=1)
    test_combined = np.concatenate([test_hog, test_colour], axis=1)

    pipelines = {
        "hog_linear_svm": (train_hog, test_hog, LinearSVC(max_iter=5_000, dual="auto")),
        "colour_knn": (train_colour, test_colour, KNeighborsClassifier(n_neighbors=5)),
        "combined_linear_svm": (
            train_combined,
            test_combined,
            LinearSVC(max_iter=5_000, dual="auto"),
        ),
    }
    results = {}
    for name, (x_tr, x_te, model) in pipelines.items():
        model.fit(x_tr, y_train)
        predictions = model.predict(x_te)
        results[name] = {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "macro_f1": float(f1_score(y_test, predictions, average="macro")),
            "confusion_matrix": confusion_matrix(y_test, predictions, labels=list(range(10))).tolist(),
        }
    save_json(output / "traditional_results.json", results)
    return results


def run_cnn(
    torch,
    transforms,
    train_dataset,
    test_dataset,
    train_limit: int,
    test_limit: int,
    epochs: int,
    output: Path,
    seed: int,
):
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

    transform = transforms.Compose(
        [transforms.ToTensor(), transforms.Normalize((0.5,) * 3, (0.5,) * 3)]
    )
    train_dataset.transform = transform
    test_dataset.transform = transform
    generator = torch.Generator().manual_seed(seed)
    train_subset = torch.utils.data.Subset(train_dataset, range(train_limit))
    test_subset = torch.utils.data.Subset(test_dataset, range(test_limit))
    train_loader = torch.utils.data.DataLoader(
        train_subset, batch_size=64, shuffle=True, generator=generator
    )
    test_loader = torch.utils.data.DataLoader(test_subset, batch_size=64, shuffle=False)

    class SmallCNN(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.features = torch.nn.Sequential(
                torch.nn.Conv2d(3, 32, 3, padding=1),
                torch.nn.ReLU(),
                torch.nn.MaxPool2d(2),
                torch.nn.Conv2d(32, 64, 3, padding=1),
                torch.nn.ReLU(),
                torch.nn.MaxPool2d(2),
            )
            self.classifier = torch.nn.Sequential(
                torch.nn.Flatten(),
                torch.nn.Linear(64 * 8 * 8, 128),
                torch.nn.ReLU(),
                torch.nn.Linear(128, 10),
            )

        def forward(self, inputs):
            return self.classifier(self.features(inputs))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SmallCNN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = torch.nn.CrossEntropyLoss()
    loss_history = []
    for _ in range(epochs):
        model.train()
        total_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach()) * len(labels)
        loss_history.append(total_loss / len(train_subset))

    expected, predicted = [], []
    error_samples = []
    model.eval()
    with torch.no_grad():
        for images, labels in test_loader:
            logits = model(images.to(device))
            batch_predictions = logits.argmax(dim=1).cpu()
            expected.extend(labels.tolist())
            predicted.extend(batch_predictions.tolist())
            for image, expected_label, predicted_label in zip(images, labels, batch_predictions):
                if expected_label != predicted_label and len(error_samples) < 6:
                    error_samples.append(
                        {
                            "expected": CLASS_NAMES[int(expected_label)],
                            "predicted": CLASS_NAMES[int(predicted_label)],
                            "tensor_min": float(image.min()),
                            "tensor_max": float(image.max()),
                        }
                    )

    results = {
        "device": str(device),
        "epochs": epochs,
        "loss_history": loss_history,
        "accuracy": float(accuracy_score(expected, predicted)),
        "macro_f1": float(f1_score(expected, predicted, average="macro")),
        "confusion_matrix": confusion_matrix(expected, predicted, labels=list(range(10))).tolist(),
        "first_six_error_samples": error_samples,
    }
    output.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), output / "cnn_state_dict.pt")
    save_json(output / "cnn_results.json", results)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="历史题型：CIFAR-10 传统方法与 CNN 对比")
    parser.add_argument("--mode", choices=("traditional", "cnn", "both"), default="both")
    parser.add_argument("--data", type=Path, default=ROOT / "data/cifar10")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/computer_vision/cifar10")
    parser.add_argument("--train-limit", type=int, default=5_000)
    parser.add_argument("--test-limit", type=int, default=1_000)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    if min(args.train_limit, args.test_limit, args.epochs) < 1:
        raise SystemExit("train-limit、test-limit、epochs 必须 >=1")

    np, torch, torchvision, transforms, *_ = require_common()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    train_dataset = torchvision.datasets.CIFAR10(
        root=args.data, train=True, download=args.download
    )
    test_dataset = torchvision.datasets.CIFAR10(
        root=args.data, train=False, download=args.download
    )
    args.train_limit = min(args.train_limit, len(train_dataset))
    args.test_limit = min(args.test_limit, len(test_dataset))

    summary = {"seed": args.seed, "train_limit": args.train_limit, "test_limit": args.test_limit}
    if args.mode in {"traditional", "both"}:
        summary["traditional"] = run_traditional(
            train_dataset, test_dataset, args.train_limit, args.test_limit, args.output
        )
    if args.mode in {"cnn", "both"}:
        summary["cnn"] = run_cnn(
            torch,
            transforms,
            train_dataset,
            test_dataset,
            args.train_limit,
            args.test_limit,
            args.epochs,
            args.output,
            args.seed,
        )
    save_json(args.output / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
