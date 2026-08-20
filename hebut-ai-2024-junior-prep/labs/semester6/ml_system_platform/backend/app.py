from __future__ import annotations

from pathlib import Path
from typing import Literal

try:
    import torch
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ImportError as exc:
    raise RuntimeError(
        "缺少后端依赖。请安装 fastapi uvicorn pydantic torch"
    ) from exc

from model import build_model, prepare_pixels

ROOT = Path(__file__).resolve().parents[4]
CHECKPOINT_DIR = ROOT / "artifacts/ml_system_platform/checkpoints"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ModelName = Literal["mlp", "cnn", "rnn"]

app = FastAPI(title="HEBUT MNIST Lab API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
MODEL_CACHE: dict[str, torch.nn.Module] = {}


class PredictionRequest(BaseModel):
    model: ModelName = "cnn"
    pixels: list[float] = Field(min_length=784, max_length=784)


class PredictionResponse(BaseModel):
    model: str
    predicted: int
    confidence: float
    probabilities: list[float]


def load_model(name: ModelName):
    if name in MODEL_CACHE:
        return MODEL_CACHE[name]
    checkpoint_path = CHECKPOINT_DIR / f"mnist_{name}.pt"
    if not checkpoint_path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"缺少权重 {checkpoint_path.name}，请先运行 train.py --model {name}",
        )
    checkpoint = torch.load(checkpoint_path, map_location=DEVICE, weights_only=True)
    model = build_model(name).to(DEVICE)
    state_dict = checkpoint.get("state_dict", checkpoint)
    model.load_state_dict(state_dict)
    model.eval()
    MODEL_CACHE[name] = model
    return model


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "device": str(DEVICE),
        "available_checkpoints": sorted(path.stem for path in CHECKPOINT_DIR.glob("*.pt")),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> PredictionResponse:
    try:
        tensor = prepare_pixels(request.pixels).to(DEVICE)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    model = load_model(request.model)
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0]
    predicted = int(probabilities.argmax())
    return PredictionResponse(
        model=request.model,
        predicted=predicted,
        confidence=float(probabilities[predicted]),
        probabilities=[float(value) for value in probabilities.cpu()],
    )
