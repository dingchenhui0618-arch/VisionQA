# VisionQA 当前下一步 v0.1

> 日期：2026-07-29
> 当前主路径：阿里云 v0.2 授权 → cn-beijing 资源创建 → 云端 smoke → Qwen 5 张 canary
> 迁移代码：`CODE_GO`
> 真实 staging / Qwen canary / Production：`NO-GO`

## 你现在只需要完成 3 件事

### 1. 阅读唯一有效的 v0.2 授权说明

- [ALIYUN_AUTHORIZATION_v0.2 / README](./ALIYUN_AUTHORIZATION_v0.2/README.md)

`ALIYUN_AUTHORIZATION_v0.1` 已被替代，只能用于历史审计，不得继续填写、签署或作为资源配置依据。

### 2. 回填 v0.2 的 12 项授权决定

- [authorization_decisions.csv](./ALIYUN_AUTHORIZATION_v0.2/authorization_decisions.csv)

请填写全部 12 行的：

- `owner_decision`
- `owner_name`
- `decision_date`
- `evidence_reference`
- 必要时填写 `notes`

可以由不同 owner 分工完成，例如：

- 账户 / 阿里云管理员；
- 预算 owner；
- 安全或数据 owner；
- 技术负责人。

同一个人可以兼任多个 owner，但每一行都必须明确写出实际姓名，不得只写角色名称。

### 3. 完成后回传

请把已填写的 `authorization_decisions.csv` 和其中引用的非敏感证明材料路径回传给项目组。

不要提供或粘贴：

- AccessKey ID / AccessKey Secret；
- Qwen API Key；
- STS Token；
- 数据库密码；
- Cookie、OAuth Token；
- 完整签名 URL；
- 任何其他账户凭据。

这些凭据不应进入聊天、CSV、Markdown、代码仓库或普通 `.env`。需要注入时，将由后续 Agent 按最小权限经阿里云 Secret / RAM 路径完成。

## 完成授权后由 Agent 自动继续

| 顺序 | 触发 Agent 工作 | 验收目标 |
|---:|---|---|
| 1 | 授权接入 | 校验 12/12 决定、owner 权限、证据引用与 v0.2 唯一口径 |
| 2 | 资源创建 | 在 `cn-beijing` 创建私有 OSS、RDS PostgreSQL、FC 及最小权限 RAM/Secret 配置 |
| 3 | 云端 smoke | 验证私有对象、数据库迁移、FC 运行时、审计日志和撤销/成本保护 |
| 4 | Qwen 5 张 canary | 固定 5 张、最多 15 请求、并发 1、20 CNY 硬停并独立 QA |

在 12 项授权未完整接入前，Agent 不得创建真实资源、运行真实 Qwen 请求或推进 production。
