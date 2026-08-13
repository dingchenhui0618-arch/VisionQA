# Qwen—人工校准偏差报告 v0.1

- 校准集与已调用 Qwen 样本重合：1 张
- 同用途且双方有完整总分：0 张
- 用途不一致或模型为 PARTIAL：1 张

当前不能计算可靠的 MAE、一致率或阈值校准。不能把不同图位的结论当成模型误差。

## 不可比样本

- `gwang/f5ddce3cb4b24e98.jpg`：人工用途 `AESTHETIC_REFERENCE` / 85 / REVIEW；Qwen 用途 `PLATFORM_PROMOTION_MAIN_IMAGE` / PARTIAL / REJECT。

## 下一步

先让模型按这 40 张各自的 `intended_placement` 跑受控校准批次，再计算分项 MAE、Gate 一致率和系统性偏差；31 张 holdout 继续保持锁定。
