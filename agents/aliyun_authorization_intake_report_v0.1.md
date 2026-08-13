# VisionQA 阿里云 v0.2 授权接入核验报告

> 核验日期：2026-07-29（Asia/Shanghai）  
> 核验角色：阿里云授权接入 Lead  
> 唯一有效输入：`D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2`  
> 当前结论：`OWNER_DECISIONS_RECEIVED / EVIDENCE_PENDING / NOT_AUTHORIZED_FOR_STAGING_RESOURCE_CREATION`  
> Qwen 网络调用：`DISABLED / fetch=0`

## 1. 结论

授权决定表的结构和 owner 意图有效：

- 12 行、12 个唯一 `decision_id`；
- 12 行决定值都属于各自 `allowed_decisions`；
- owner、日期、条件和 evidence_reference 字段均非空；
- 日期统一为 `2026-07-29`；
- 丁陈辉具名兼任账户 Owner、技术 Owner、预算 Owner、数据 Owner 和安全 Owner，角色声明在各行 `required_owner` 与 `notes` 中可以对应；
- 未读取、未要求、未记录 AccessKey、百炼 API Key、数据库密码或 Token。

但证据门没有闭环：

- 同目录只有 README、VERSION、决定表和 RAM 矩阵，没有新增截图、工单、协议、PDF 或已签署撤销清单；
- 11 行直接写明“截图路径待补”“清单待补”或 `PENDING`；
- `ALIYUN-ACCOUNT-001` 是账号自述，不是可读取的脱敏控制台证据；
- `ALIYUN-BAILIAN-DATA-001` 明确缺少留存、删除 SLA、备份淘汰、人工审核边界和训练使用条款；
- 因此不能将 owner 的 `APPROVE` 等同于已经完成云端配置或证据验收。

按照 v0.2 的组合门，本轮不得标记 `AUTHORIZED_FOR_STAGING_RESOURCE_CREATION`，也不得调用 Qwen。

## 2. 规范化状态

| 分类 | 数量 | 含义 |
|---|---:|---|
| 可立即执行 | 0 | 当前没有一项具备可验证证据，授权接入 Lead 不执行云资源创建 |
| 条件执行 | 10 | owner 已批准，但只能在相应控制台配置完成并补回脱敏证据后转为 VERIFIED |
| 阻塞 | 2 | 百炼 Key 与百炼数据治理逐行阻塞；此外整体 staging resource creation gate 独立保持阻塞 |

逐行状态与精确补充动作见：

- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2\execution_ledger.csv`

其中最关键的硬阻塞是：

1. `ALIYUN-BAILIAN-DATA-001`：必须提供阿里云官方协议或支持工单证据；
2. `ALIYUN-COMPUTE-001`：必须证明稳定出口 IP 已配置，但证据中不写 IP 明文；
3. `ALIYUN-BAILIAN-KEY-001`：只能在前两项、cloud smoke 和 Secret 路径就绪后执行，Key 值不得进入项目文件或聊天。

## 3. Owner 身份分离

允许一人兼任，但台账中保持责任域分离：

| 责任域 | 具名 Owner | 当前核验 |
|---|---|---|
| 账户 Owner | 丁陈辉 | 角色声明有效，控制台证据待补 |
| 技术 Owner | 丁陈辉 | FC 选择有效，运行时/网络证据待补 |
| 预算 Owner | 丁陈辉 | ¥20/5 张/15 请求/并发 1 批准有效，告警证据待补 |
| 数据 Owner | 丁陈辉 | 14 天/1 天和数据治理责任声明有效，配置及服务条款证据待补 |
| 安全 Owner | 丁陈辉 | 日志最小化与 30/90 天责任声明有效，SLS 配置证据待补 |

## 4. Artifact 绑定

机器可读 registry：

- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2\artifact_registry.csv`

| Artifact ID | SHA-256 | 状态 |
|---|---|---|
| `ALIYUN-AUTHZ-V0.2-README` | `0ed3b395b310014a71b4cad77c2f30b291f7cc0da38728920a7f2c21b7ef77ab` | VERIFIED |
| `ALIYUN-AUTHZ-V0.2-VERSION` | `1f4e55ad97e111249cee8faf61fb4eaaf8b6b7baa9c9f6d460c239516eb85d80` | VERIFIED |
| `ALIYUN-AUTHZ-V0.2-RAM-MATRIX` | `643b5b57803977dc56e983e67fe27b60c4c4aad2907d14a3e1bacc16b95a035f` | VERIFIED |
| `ALIYUN-AUTHZ-V0.2-FILLED-DECISIONS` | `1d7b389c42781b90ad69ecd50380086727ccfd6dd94e937749add589b01c272b` | STRUCTURE_VERIFIED_EVIDENCE_PENDING |

`VERSION.md` 中记录的决定表 SHA 是未填写模板的发布基线；owner 回填后的当前文件 SHA 发生变化属于预期。执行时必须绑定上表当前 filled-decisions SHA，不能继续使用模板 SHA。

## 5. 用户精确补充动作

在 `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2\evidence\` 中放置脱敏证据，并将实际相对路径或阿里云工单编号写回决定表 `evidence_reference`。不要提交任何密钥、密码、Token、签名 URL 或 IP 明文。

最低需要：

1. 账号实名认证、内地服务可用和 `cn-beijing` 的脱敏控制台证明；
2. RAM operator 的控制台访问、MFA、无 AccessKey、无管理员权限证明；
3. runtime role 的可信实体和最小权限摘要；
4. OSS 私有、14 天对象删除、1 天分片清理证明；
5. RDS 仅 VPC、无公网、无 `0.0.0.0/0` 证明；
6. FC/VPC/稳定出口“已配置”的证明，不含 IP 明文；
7. 百炼独立 staging 空间和固定模型范围证明；
8. 百炼数据治理协议或支持工单，覆盖保留、删除、备份、人工审核、训练使用；
9. ¥10/¥16/¥20 预算告警证明；
10. SLS 应用日志 30 天、安全审计 90 天和敏感正文禁记证明；
11. 具名撤销清单。

百炼 API Key 的截图与 Secret 注入证明是后置项：前述基础设施和数据治理闭环前不要创建；创建后只证明范围、白名单与 Secret 已配置，绝不交付 Key 值。

## 6. 下一次 Gate

只有当 execution ledger 中所有资源创建必要项转为 `VERIFIED`，并且百炼数据治理证据通过时，授权接入状态才可提升为：

```text
AUTHORIZED_FOR_STAGING_RESOURCE_CREATION
```

该状态仍不等于：

```text
QWEN_CANARY_AUTHORIZED
PRODUCTION_AUTHORIZED
```

Qwen 仍需等待 staging 资源、cloud smoke、Secret、固定出口、预算硬停与撤销机制分别验收。
