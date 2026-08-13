# VisionQA 国产 Provider 最小外审 / 管理员证明包 v0.1

> 日期：2026-07-29  
> 目的：把用户已经确认的“改用国产模型”路线，转换为可审计、但不会越权激活真实调用的执行决定。  
> 安全边界：本包不需要、也不得填写 API Key、AccessKey、SecretKey、Token、Cookie 或完整签名 URL。

## 已经确定的事项

- 用户已授权：VisionQA 的真实模型路线从 OpenAI 改为国产多模态模型。
- 首选候选：阿里云百炼，华北 2（北京），固定模型 `qwen3-vl-plus-2025-12-19`。
- 备用候选：智谱 BigModel，模型 `glm-4.6v`。
- HOLD：火山方舟 / 豆包、百度千帆。未补齐企业级数据治理证据前不得发送 commercial-seed。
- 原 OpenAI 四项外审决定保留历史，但统一标记为 `SUPERSEDED_NOT_ACTIVATED`；实际 OpenAI 网络调用为 0。
- 模型只返回观察草稿。最终评分、Gate、Blocker 和 Repair Prompt 仍由 VisionQA 本地确定性规则产生。

以上决定不等于批准 Qwen 真实调用，也不等于 production Go。

## 外部审查者只需决定的四项

请填写同目录的 `provider_activation_decisions.csv`：

1. 是否接受“Qwen 首选、GLM 备用、豆包/千帆 HOLD”的路线；
2. 是否接受华北 2（北京）与固定快照 `qwen3-vl-plus-2025-12-19`；
3. 是否批准首轮 staging canary 的人民币预算硬上限；
4. 在管理员证据全部补齐后，是否允许最多 5 张已授权 commercial-seed 进入 canary。

建议首轮预算：**20 元人民币硬停**；5 张、每张最多 3 次、共最多 15 次请求；并发 1。此建议必须由预算责任人批准，不能继承原 OpenAI 的 50 USD 决定。

## 只有阿里云账户管理员 / 合同或工单能够证明的事项

请账户管理员提供非敏感证据引用或脱敏截图，不要把凭据写入本包。

| 证明项 | 当前公开证据 | 管理员必须补充的证明 | 未证明时 |
|---|---|---|---|
| 北京地域 | 官方文档支持华北 2（北京），各地域 Endpoint、Key、模型列表隔离 | 业务空间、Endpoint 与 Key 均为 `cn-beijing`；推理、审核、日志、备份和灾备不出中国内地 | `NETWORK_REQUEST_COUNT=0` |
| 固定模型 | 官方模型页存在 `qwen3-vl-plus-2025-12-19` | 账户可调用该精确快照；不使用 `latest`/浮动别名；记录实际返回 model 字段 | `NETWORK_REQUEST_COUNT=0` |
| API 数据不训练 | 百炼官方隐私说明公开称调用数据不用于模型训练 | 账户/合同没有另行开启日志回流、评测集、训练集或质量改进授权 | `NETWORK_REQUEST_COUNT=0` |
| 保存时长 | 官方同时说明会依法存储调用数据；公开页没有可依赖的精确天数 | 分别列出图片、Prompt、响应、审核副本、故障日志和备份的精确保留天数 | `NETWORK_REQUEST_COUNT=0` |
| 删除 SLA | 公开资料不足 | 删除请求覆盖范围、完成时限、备份淘汰期和可取得的删除证明 | `NETWORK_REQUEST_COUNT=0` |
| 人工审核 | 平台存在内容安全与可选观测能力 | 是否人工查看；可访问角色、触发条件、访问审计和是否可关闭 | `NETWORK_REQUEST_COUNT=0` |
| 私网 / 短期 URL | 业务空间可做租户隔离；普通视觉推理 PrivateLink 能力未证实 | PrivateLink/VPC/专属推理是否适用于该模型；若不能，确认项目私有 R2 的 GET-only、单对象、随机路径、TTL≤15分钟签名 URL 路径 | `NETWORK_REQUEST_COUNT=0` |
| 预算硬上限 | 官方支持费用查询和告警，但告警不等于硬停 | 账户余额/配额限制证据；VisionQA 代码侧 20 元人民币预扣与 fetch 前硬停测试 | `NETWORK_REQUEST_COUNT=0` |
| 日志回流 | 官方说明推理日志回流需显式开启 | 日志回流、应用观测、历史记录保持关闭的脱敏截图 | `NETWORK_REQUEST_COUNT=0` |
| 最小权限 | 官方支持业务空间、模型权限和 IP 白名单 | 独立 staging 空间、仅允许固定模型和固定来源 IP；默认全网白名单已关闭 | `NETWORK_REQUEST_COUNT=0` |

## 证据回填格式

账户管理员可另附一份不含敏感值的 Markdown 或 PDF，逐项填写：

```text
evidence_id:
provider: aliyun-bailian
account_scope: 独立 staging 业务空间
region: cn-beijing
model_id: qwen3-vl-plus-2025-12-19
evidence_type: 控制台脱敏截图 / 合同条款 / 阿里云工单
evidence_date:
evidence_owner:
evidence_ref:
confirmed_value:
```

凭据、Cookie、完整签名 URL 和 Authorization Header 必须遮蔽。

## 激活门

只有以下条件全部形成证据，Provider Activation Agent 才能申请 canary：

```text
国产路线外审通过
+ 北京地域与固定模型通过
+ API 数据不训练通过
+ 精确保留期与删除 SLA 通过
+ 人工审核/内容安全访问边界通过
+ 私网或短期私有 URL 路径通过
+ 独立 staging D1/R2 验收通过
+ secret manager、模型/IP allowlist 通过
+ 20 元人民币成本硬停实测通过
+ 本次运行显式批准
= 最多 5 张 staging canary
```

任意一项未知时：`NETWORK_REQUEST_COUNT=0`。

## 证据来源

- `D:\VisionQA\agents\domestic_model_selection_report_v0.1.md`
- `D:\VisionQA\agents\domestic_model_data_governance_v0.1.md`
- `D:\VisionQA\agents\domestic_adapter_architecture_v0.1.md`
- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.1\external_review_decisions.csv`
- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.1\execution_ledger.csv`

