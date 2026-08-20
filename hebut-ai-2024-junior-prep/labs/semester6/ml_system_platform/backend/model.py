from __future__ import annotations

from typing import Literal

ModelName = Literal["mlp", "cnn", "rnn"]


def require_torch():
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("缺少 PyTorch，请安装 torch torchvision") from exc
    return torch


def build_model(name: ModelName):
    torch = require_torch()

    class MLP(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.network = torch.nn.Sequential(
                torch.nn.Flatten(),
                torch.nn.Linear(28 * 28, 256),
                torch.nn.ReLU(),
                torch.nn.Dropout(0.2),
                torch.nn.Linear(256, 128),
                torch.nn.ReLU(),
                torch.nn.Linear(128, 10),
            )

        def forward(self, inputs):
            return self.network(inputs)

    class CNN(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.features = torch.nn.Sequential(
                torch.nn.Conv2d(1, 32, kernel_size=3, padding=1),
                torch.nn.ReLU(),
                torch.nn.MaxPool2d(2),
                torch.nn.Conv2d(32, 64, kernel_size=3, padding=1),
                torch.nn.ReLU(),
                torch.nn.MaxPool2d(2),
            )
            self.classifier = torch.nn.Sequential(
                torch.nn.Flatten(),
                torch.nn.Linear(64 * 7 * 7, 128),
                torch.nn.ReLU(),
                torch.nn.Dropout(0.2),
                torch.nn.Linear(128, 10),
            )

        def forward(self, inputs):
            return self.classifier(self.features(inputs))

    class RNN(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.rnn = torch.nn.LSTM(input_size=28, hidden_size=128, batch_first=True)
            self.classifier = torch.nn.Linear(128, 10)

        def forward(self, inputs):
            sequence = inputs.squeeze(1)
            outputs, _ = self.rnn(sequence)
            return self.classifier(outputs[:, -1, :])

    constructors = {"mlp": MLP, "cnn": CNN, "rnn": RNN}
    try:
        return constructors[name]()
    except KeyError as exc:
        raise ValueError(f"未知模型 {name!r}，可选: {sorted(constructors)}") from exc


def prepare_pixels(pixels: list[float]):
    """Convert 784 digit-intensity values (0 background, 255 stroke) to MNIST tensor."""

    torch = require_torch()
    if len(pixels) != 28 * 28:
        raise ValueError(f"需要 784 个像素，实际收到 {len(pixels)}")
    tensor = torch.tensor(pixels, dtype=torch.float32)
    if not torch.isfinite(tensor).all():
        raise ValueError("像素包含 NaN 或无穷值")
    tensor = tensor.clamp(0, 255).reshape(1, 1, 28, 28) / 255.0
    return (tensor - 0.1307) / 0.3081
