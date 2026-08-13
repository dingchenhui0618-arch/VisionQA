# ALIYUN_AUTHORIZATION v0.2 版本记录

> 版本：`v0.2`  
> 日期：2026-07-29  
> 状态：`CURRENT`  
> 被替代版本：`v0.1`（`SUPERSEDED`）

## 变更原因

QA 发现 v0.1 的 `ALIYUN-OSS-001` 使用“7 天或 30 天”的可选口径，与冻结的
staging 架构及 OSS 实现不一致。v0.2 将生命周期收敛为唯一值：

- `staging/visionqa/*` 全部当前对象 14 天后永久删除；
- 未完成 Multipart Upload 1 天后中止并清理；
- 不允许按子前缀选择其他保留期；
- 应用运行角色不得修改生命周期。

## 文件差异

| 文件 | v0.1 → v0.2 差异 |
|---|---|
| `README.md` | 版本升级；删除 7/30 天分支；冻结 14 天对象 + 1 天 Multipart；增加替代声明 |
| `authorization_decisions.csv` | `ALIYUN-OSS-001` 改为唯一明确的 14 天 + 1 天授权语句；其余 11 项不变 |
| `ram_permission_matrix.csv` | OSS 资源范围显式绑定 14 天 + 1 天；运行角色显式禁止修改该生命周期 |
| `aliyun_authorization_governance_v0.2.md` | 输出路径、验收项、替代关系和架构表同步 |
| `v0.1/SUPERSEDED.md` 与 `authorization_decisions.csv.SUPERSEDED` | 新增历史版本及旧决策表停用标记；v0.1 原文件未覆盖 |

## SHA-256

| Artifact | v0.1 SHA-256 | v0.2 SHA-256 |
|---|---|---|
| `README.md` | `f61abbd14bb9aeecd63c2b201c7f4769be99bacced65217742c2e0892f3dd7e4` | `0ed3b395b310014a71b4cad77c2f30b291f7cc0da38728920a7f2c21b7ef77ab` |
| `authorization_decisions.csv` | `2d8089b8e42d41c978c1e818b470b6c223f17a9852b74cc969d35c7af60f7db4` | `1bf5fd97ee5f88a27d53dd4f88ada300fd6ada370554ad152bc8eb9b9742fa03` |
| `ram_permission_matrix.csv` | `b3a38411d8658b7ccb2b0b8f07c51efa67ee66a31c0ca56ec993ce85bf3a0466` | `643b5b57803977dc56e983e67fe27b60c4c4aad2907d14a3e1bacc16b95a035f` |
| 治理报告 | `01c97e19822263bb068e76429965d79aa8e2dfc23110475de50ef9fc3fe5ad05` | `93e1628f51523832928a7ce4a586520f06344ff5f0af24efbeedb9cc14254be7` |

## 校验结论

- 决策表：12 行；
- 唯一 `decision_id`：12 个；
- 12 行状态均为 `PENDING`；
- `ALIYUN-OSS-001`：仅包含 14 天对象生命周期和 1 天 Multipart 清理；
- 其他 11 个决策 ID 及决策口径未改；
- v0.2 不再包含 OSS “7 天或 30 天”选项；
- 未创建任何阿里云资源，未产生费用。
