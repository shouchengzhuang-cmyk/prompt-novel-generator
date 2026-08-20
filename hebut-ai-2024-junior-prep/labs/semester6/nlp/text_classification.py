from __future__ import annotations

import csv
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.metrics import classification_report

TOKEN_PATTERN = re.compile(r"[A-Za-z]+|[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text)]


class MultinomialNaiveBayes:
    def fit(self, texts: list[str], labels: list[str]) -> "MultinomialNaiveBayes":
        if len(texts) != len(labels) or not texts:
            raise ValueError("texts and labels must have the same non-zero length")
        self.class_counts = Counter(labels)
        self.word_counts: defaultdict[str, Counter[str]] = defaultdict(Counter)
        self.total_words = Counter()
        self.vocabulary: set[str] = set()
        for text, label in zip(texts, labels):
            tokens = tokenize(text)
            self.word_counts[label].update(tokens)
            self.total_words[label] += len(tokens)
            self.vocabulary.update(tokens)
        self.total_documents = len(texts)
        return self

    def predict_one(self, text: str) -> str:
        tokens = tokenize(text)
        vocabulary_size = max(1, len(self.vocabulary))
        scores: dict[str, float] = {}
        for label in self.class_counts:
            score = math.log(self.class_counts[label] / self.total_documents)
            denominator = self.total_words[label] + vocabulary_size
            for token in tokens:
                score += math.log((self.word_counts[label][token] + 1) / denominator)
            scores[label] = score
        return max(sorted(scores), key=scores.get)


def load_dataset(path: Path) -> tuple[list[str], list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [row["text"] for row in rows], [row["label"] for row in rows]


def main() -> None:
    texts, labels = load_dataset(ROOT / "sample_data/tiny_text.csv")
    predictions = []
    for held_out in range(len(texts)):
        train_texts = [text for index, text in enumerate(texts) if index != held_out]
        train_labels = [label for index, label in enumerate(labels) if index != held_out]
        model = MultinomialNaiveBayes().fit(train_texts, train_labels)
        predictions.append(model.predict_one(texts[held_out]))
    print(classification_report(labels, predictions))
    print("注意：样例很小，仅用于验证流水线，不代表正式实验指标。")


if __name__ == "__main__":
    main()
