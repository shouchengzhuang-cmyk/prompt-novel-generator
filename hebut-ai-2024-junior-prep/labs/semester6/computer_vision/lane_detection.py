from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class LaneParameters:
    gaussian_kernel: int = 5
    canny_low: int = 50
    canny_high: int = 150
    roi_top: float = 0.60
    hough_threshold: int = 30
    min_line_length: int = 40
    max_line_gap: int = 100


PRESETS = {
    "default": LaneParameters(),
    "strict_canny": LaneParameters(canny_low=100, canny_high=200),
    "large_blur": LaneParameters(gaussian_kernel=11),
    "strict_hough": LaneParameters(
        hough_threshold=80, min_line_length=80, max_line_gap=50
    ),
}


def require_dependencies():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise SystemExit(
            "缺少依赖。请执行: python -m pip install opencv-python numpy"
        ) from exc
    return cv2, np


def read_image(path: Path, cv2, np):
    data = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"无法读取图像: {path}")
    return image


def write_image(path: Path, image, cv2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    success, encoded = cv2.imencode(path.suffix or ".png", image)
    if not success:
        raise ValueError(f"图像编码失败: {path}")
    encoded.tofile(path)


def detect_lane(image_bgr, parameters: LaneParameters, cv2, np) -> dict[str, object]:
    if parameters.gaussian_kernel < 3 or parameters.gaussian_kernel % 2 == 0:
        raise ValueError("gaussian_kernel 必须是 >=3 的奇数")
    if not 0 < parameters.roi_top < 1:
        raise ValueError("roi_top 必须在 (0, 1) 内")

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(
        gray, (parameters.gaussian_kernel, parameters.gaussian_kernel), 0
    )
    edges = cv2.Canny(blurred, parameters.canny_low, parameters.canny_high)

    height, width = edges.shape
    vertices = np.array(
        [[
            (int(width * 0.10), height - 1),
            (int(width * 0.45), int(height * parameters.roi_top)),
            (int(width * 0.55), int(height * parameters.roi_top)),
            (int(width * 0.90), height - 1),
        ]],
        dtype=np.int32,
    )
    mask = np.zeros_like(edges)
    cv2.fillPoly(mask, vertices, 255)
    roi_edges = cv2.bitwise_and(edges, mask)

    lines = cv2.HoughLinesP(
        roi_edges,
        rho=1,
        theta=np.pi / 180,
        threshold=parameters.hough_threshold,
        minLineLength=parameters.min_line_length,
        maxLineGap=parameters.max_line_gap,
    )
    overlay = np.zeros_like(image_bgr)
    line_count = 0
    if lines is not None:
        for segment in lines:
            x1, y1, x2, y2 = segment[0]
            cv2.line(overlay, (x1, y1), (x2, y2), (0, 0, 255), 3)
            line_count += 1
    final = cv2.addWeighted(image_bgr, 0.8, overlay, 1.0, 0)
    return {
        "gray": gray,
        "blurred": blurred,
        "edges": edges,
        "roi_mask": mask,
        "roi_edges": roi_edges,
        "final": final,
        "line_count": line_count,
        "shape": list(image_bgr.shape),
        "pixel_min": int(image_bgr.min()),
        "pixel_max": int(image_bgr.max()),
    }


def collect_images(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    if input_path.is_dir():
        supported = {".jpg", ".jpeg", ".png", ".bmp"}
        return sorted(path for path in input_path.rglob("*") if path.suffix.lower() in supported)
    raise SystemExit(f"输入不存在: {input_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="历史题型：传统车道线检测参数对比")
    parser.add_argument("--input", type=Path, required=True, help="图像文件或目录")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/computer_vision/lane"
    )
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument(
        "--presets", nargs="*", choices=sorted(PRESETS), default=list(PRESETS)
    )
    args = parser.parse_args()
    if args.limit < 1:
        raise SystemExit("limit 必须 >=1")

    cv2, np = require_dependencies()
    images = collect_images(args.input)[: args.limit]
    if not images:
        raise SystemExit("没有找到支持的图像")

    summary = []
    for image_path in images:
        image = read_image(image_path, cv2, np)
        for preset_name in args.presets:
            result = detect_lane(image, PRESETS[preset_name], cv2, np)
            stem = f"{image_path.stem}_{preset_name}"
            preset_dir = args.output / stem
            for stage in ("gray", "edges", "roi_mask", "roi_edges", "final"):
                write_image(preset_dir / f"{stage}.png", result[stage], cv2)
            summary.append(
                {
                    "source": str(image_path),
                    "preset": preset_name,
                    "parameters": asdict(PRESETS[preset_name]),
                    "shape": result["shape"],
                    "pixel_range": [result["pixel_min"], result["pixel_max"]],
                    "line_count": result["line_count"],
                    "output": str(preset_dir),
                }
            )

    args.output.mkdir(parents=True, exist_ok=True)
    summary_path = args.output / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"处理图像: {len(images)}，参数组: {len(args.presets)}")
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
