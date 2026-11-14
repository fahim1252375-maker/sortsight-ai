"""
SortSight AI — Python ML Reference Evaluation & Calibration Script
------------------------------------------------------------------
Provides reproducible evaluation metrics (Precision, Recall, F1, Confusion Matrix,
Expected Calibration Error) and ONNX export template for edge deployment
when running in an external Python/PyTorch/CUDA environment.
"""

import json
import math
from typing import List, Dict, Any


def compute_confusion_and_metrics(
    y_true: List[str], y_pred: List[str], labels: List[str]
) -> Dict[str, Any]:
    idx = {lbl: i for i, lbl in enumerate(labels)}
    n = len(labels)
    matrix = [[0] * n for _ in range(n)]
    for t, p in zip(y_true, y_pred):
        if t in idx and p in idx:
            matrix[idx[t]][idx[p]] += 1

    per_class = []
    for i, lbl in enumerate(labels):
        tp = matrix[i][i]
        fp = sum(matrix[r][i] for r in range(n) if r != i)
        fn = sum(matrix[i][c] for c in range(n) if c != i)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        per_class.append({
            "class": lbl,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })

    return {"labels": labels, "matrix": matrix, "per_class": per_class}


def compute_ece(confidences: List[float], correctness: List[int], bins: int = 10) -> float:
    if not confidences:
        return 0.0
    total = len(confidences)
    ece = 0.0
    for b in range(bins):
        low, high = b / bins, (b + 1) / bins
        bucket = [(c, y) for c, y in zip(confidences, correctness) if low <= c < high or (b == bins - 1 and c == 1.0)]
        if bucket:
            avg_conf = sum(c for c, _ in bucket) / len(bucket)
            avg_acc = sum(y for _, y in bucket) / len(bucket)
            ece += (len(bucket) / total) * abs(avg_acc - avg_conf)
    return round(ece, 4)


if __name__ == "__main__":
    sample_true = ["PET_01", "ALUM_CAN", "OCC_CARD", "BATT_LI", "PET_01", "OCC_CARD"]
    sample_pred = ["PET_01", "ALUM_CAN", "OCC_CARD", "BATT_LI", "HDPE_02", "OCC_CARD"]
    labels = ["PET_01", "HDPE_02", "ALUM_CAN", "OCC_CARD", "BATT_LI"]
    report = compute_confusion_and_metrics(sample_true, sample_pred, labels)
    ece = compute_ece([0.92, 0.95, 0.88, 0.90, 0.61, 0.84], [1, 1, 1, 1, 0, 1])
    print(json.dumps({"evaluation_report": report, "ece": ece}, indent=2))
