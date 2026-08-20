from __future__ import annotations

import csv
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.metrics import classification_report, confusion_matrix


def load_data(path: Path) -> list[tuple[tuple[float, ...], str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [((float(row["f1"]), float(row["f2"])), row["label"]) for row in rows]


def standardise(
    train: list[tuple[tuple[float, ...], str]],
    test: list[tuple[tuple[float, ...], str]],
) -> tuple[list[tuple[tuple[float, ...], str]], list[tuple[tuple[float, ...], str]]]:
    dimensions = len(train[0][0])
    means = [sum(point[0][d] for point in train) / len(train) for d in range(dimensions)]
    stds = []
    for dimension in range(dimensions):
        variance = sum((point[0][dimension] - means[dimension]) ** 2 for point in train) / len(train)
        stds.append(math.sqrt(variance) or 1.0)

    def transform(dataset: list[tuple[tuple[float, ...], str]]):
        return [
            (tuple((value - means[d]) / stds[d] for d, value in enumerate(features)), label)
            for features, label in dataset
        ]

    return transform(train), transform(test)


def distance(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def knn_predict(
    train: list[tuple[tuple[float, ...], str]], features: tuple[float, ...], k: int = 3
) -> str:
    neighbours = sorted(train, key=lambda sample: distance(sample[0], features))[:k]
    votes = Counter(label for _, label in neighbours)
    return sorted(votes, key=lambda label: (-votes[label], label))[0]


def centroid_predict(
    train: list[tuple[tuple[float, ...], str]], features: tuple[float, ...]
) -> str:
    grouped: defaultdict[str, list[tuple[float, ...]]] = defaultdict(list)
    for point, label in train:
        grouped[label].append(point)
    centroids = {
        label: tuple(sum(point[d] for point in points) / len(points) for d in range(len(features)))
        for label, points in grouped.items()
    }
    return min(centroids, key=lambda label: (distance(centroids[label], features), label))


def main() -> None:
    dataset = load_data(ROOT / "sample_data/tiny_classification.csv")
    # 每个类别最后一个样本做测试，避免随机划分掩盖示例逻辑。
    train, test = [], []
    seen = Counter(label for _, label in dataset)
    remaining = dict(seen)
    for sample in dataset:
        remaining[sample[1]] -= 1
        (test if remaining[sample[1]] == 0 else train).append(sample)
    train, test = standardise(train, test)

    expected = [label for _, label in test]
    for name, predictor in (
        ("KNN(k=3)", lambda features: knn_predict(train, features, 3)),
        ("NearestCentroid", lambda features: centroid_predict(train, features)),
    ):
        predicted = [predictor(features) for features, _ in test]
        labels, matrix = confusion_matrix(expected, predicted)
        report = classification_report(expected, predicted)
        print(f"\n{name}")
        print(f"labels={labels}")
        print(f"confusion_matrix={matrix}")
        print(f"report={report}")


if __name__ == "__main__":
    main()
