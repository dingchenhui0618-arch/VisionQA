# VisionQA 阿里云 FC 3.0 运行时实现报告 v0.1

更新时间：2026-07-29  
执行角色：阿里云函数计算 FC 3.0 运行时实现 Agent  
执行结论：**本地骨架验收通过；云资源未创建；live 激活仍为 Fail Closed**

## 1. 职责、输入、输出与验收标准

### 职责

- 建立 Node.js 20 的 FC 3.0 Web Function 与 Task Function 代码骨架。
- 提供健康检查、API 入口、异步任务入口和有界的超时/重试状态。
- 仅通过依赖注入消费 OSS、PostgreSQL 和 Qwen 端口，不修改三者核心。
- 固定北京地域、并发 1，并确保 Secret 不进入配置、代码或日志。
- 提供 SLS 字段脱敏、绑定 Schema、本地验证和部署 Runbook。
- 不创建或部署阿里云资源，不修改生产 Sites。

### 输入

- 现有 OSS 端口：`head`、`presignGet`。
- 现有 PostgreSQL 持久化方向：`persistEvaluation` 及异步任务状态端口。
- 现有 Qwen 治理适配方向：`evaluate`。
- 已批准的阿里云北京地域、私有对象、私有数据库、SLS 与 Secret
  Manager 约束。

### 输出

- 运行时根目录：`D:\VisionQA\web\aliyun-fc`
- Web Function：
  - `GET /healthz`
  - `GET /readyz`
  - `POST /v1/evaluations`
  - `POST /internal/tasks/evaluations`
- Task Function：`src/task.handler`
- 非 Secret 绑定 Schema：`config/fc-bindings.schema.json`
- RAM 最小权限示例：`config/ram-execution-policy.example.json`
- FC 3.0 配置示例：`s.example.yaml`
- 部署与回滚说明：`RUNBOOK.md`
- 测试、Lint、构建与本地 Smoke 脚本。

### 验收标准

| 验收项 | 结果 | 证据 |
|---|---|---|
| 默认 fixture/mock | PASS | 启动文件只装配内存 fixture |
| 缺 OSS/PG/Qwen 治理证据时拒绝 live | PASS | `config.mjs` 启动门与负测 |
| live 核心依赖身份不符时拒绝 | PASS | `ports.mjs` |
| 仓库内不存在可误激活的 live composition root | PASS | `web.mjs` / `task.mjs` 明确拒绝 |
| Secret 不进配置/日志 | PASS | Schema 仅列 Secret 名；SLS 脱敏测试 |
| 静态阿里云 AK 禁止 | PASS | 任一 AK/STS 环境变量存在即启动失败；负测覆盖 |
| 地域固定北京 | PASS | `cn-beijing` 常量及负测 |
| 并发 1 | PASS | 常量、配置门与 `s.example.yaml` |
| 超时/重试有界 | PASS | Web 25s；Task 110s；Task 最多 3 次 |
| 生产 Sites 不变 | PASS | 未调用 Sites，未改部署配置 |
| FC 本地测试 | PASS | 11/11 |
| FC Lint | PASS | 20 个文件，无凭证形态值 |
| FC Build | PASS | 9 个 ESM 模块语法检查 |
| FC Local Smoke | PASS | readiness + fixture evaluation |
| 主仓库 Lint | PASS | `npm run lint` |
| 主仓库 Build | PASS | `npm run build` |
| 主仓库全量测试 | PASS | 52/52 |
| 实际 OSS/PG/Qwen/付费网络调用 | 0 | fixture smoke |

## 2. 运行时设计

### Web Function

采用 FC Web Function 推荐的 HTTP Server 方式，监听 `0.0.0.0:9000`。
`/healthz` 只表示进程存活；`/readyz` 校验依赖端口和 live 依赖身份。
业务入口具有内部 Token 检查、1 MiB 请求体限制、稳定错误结构和
`no-store` 响应。

### Task Function

事件入口为 `src/task.handler`。任务状态遵循：

`RUNNING -> SUCCEEDED | RETRY_PENDING | FAILED`

- FC 内部任务超时 110 秒，低于配置示例的 120 秒函数超时。
- Task 尝试上限为 3 次，包含第一次。
- Qwen 单次请求重试仍由受治理的 Provider Adapter 控制；FC 不新增
  无界重试。
- 实例并发固定为 1。

### 依赖端口

FC 核心没有直接 import OSS SDK、`pg` 或 Qwen 实现，仅要求：

```text
objectStorage.head(input)
objectStorage.presignGet(input)
repository.persistEvaluation(input)
repository.recordJobState(state)
visionProvider.evaluate(input, signal)
```

live 身份必须精确匹配：

- Object Storage：`aliyun_oss`
- Repository：`aliyun_postgresql`
- Vision Provider：`qwen-bailian`

PostgreSQL Agent 已提供 provider-neutral
`createAliyunPostgresPersistencePort`，包含 `persistEvaluation` 与
`recordJobState`。FC 已只消费该公开 adapter 完成 source-level
composition readiness smoke，未查询数据库、未修改 PostgreSQL 核心。
原集成 P1 已关闭；真实 live composition root 仍须单独安全审查。

## 3. Fail-Closed 启动门

live 启动要求下列六项全部显式为 `true`：

- `OSS_GOVERNANCE_EVIDENCE_ACCEPTED`
- `PG_GOVERNANCE_EVIDENCE_ACCEPTED`
- `QWEN_GOVERNANCE_EVIDENCE_ACCEPTED`
- `SECRET_MANAGER_CONFIGURED`
- `PRIVATE_NETWORK_PATH_CONFIRMED`
- `SLS_REDACTION_CONFIRMED`

并要求所有 Secret 仅由运行环境注入、地域为 `cn-beijing`、
`FC_INSTANCE_CONCURRENCY=1`。即便这些字符串全部满足，仓库内的两个
默认启动入口仍不会装配 live 依赖；必须另外经过代码审查的 composition
root 才能激活。这避免误把“环境变量写全”当成“治理证据已经成立”。

## 4. SLS 日志安全

允许的结构化字段：

- `timestamp`
- `service`
- `region`
- `event`
- `request_id`
- `tenant_id`
- `asset_id`
- `evaluation_id`
- `provider_id`
- `duration_ms`
- `outcome`
- `error_code`
- `retryable`

以下内容会被删除或整值替换为 `[REDACTED]`：

- Authorization、Cookie、Token、Password、Secret；
- API Key、Access Key、Credential、Signature；
- 任意 key 名含 URL/URI（不区分大小写）的字段；
- 任意含 HTTP(S)、`oss://` 或 OSS endpoint 的字符串；
- URL 对象，以及嵌套对象/数组中的上述值；
- Bearer 值；
- 请求体、Provider 原始响应和私有 URL 不进入业务日志。

URL 不做局部遮盖：host、tenant、object path 和所有 query 都不会保留。
攻击负测覆盖嵌套对象、数组、大小写 key、无 scheme 的 URL 字段和
含普通文本前后缀的 URL 字符串。

## 5. 本地验证记录

执行：

```powershell
cd D:\VisionQA\web\aliyun-fc
npm run verify
```

结果：

- Lint：PASS
- Unit/HTTP/composition tests：11/11 PASS
- Build：PASS
- Local Smoke：PASS
- 外部网络与付费调用：0

主仓库回归：

```powershell
cd D:\VisionQA\web
npm run lint
npm run build
npm test
```

结果：

- Lint：PASS
- Build：PASS
- 全量测试：52/52 PASS

## 6. 冲突与未完成项

### 无冲突

- 没有修改 OSS、PostgreSQL、Qwen 核心文件。
- 没有修改 Next/Vinext 页面或生产部署配置。
- 没有创建 FC、OSS、RDS、SLS、RAM、VPC 等云资源。
- 没有写入任何 Secret。

### 已关闭的集成问题

- P1 日志 URL 泄露：已关闭。任何 URL/URI/private URL 字段或检测到的
  HTTP(S)/OSS URL 均整值脱敏，攻击负测通过。
- P1 PostgreSQL port mismatch：已关闭。provider-neutral adapter 已被 FC
  composition readiness smoke 直接消费。

### live 前仍需完成

1. OSS、PostgreSQL、Qwen 三方最终治理证据由外部审查角色接受。
2. 阿里云管理员提供北京地域的 RAM、VPC、OSS、RDS、SLS 绑定实值，
   但 Secret 实值不得进入项目文件。
3. 安全审查 live composition root。
4. 得到单独的 staging 部署授权后，才允许按 Runbook 创建资源和部署。

当前 Gate：

- Fixture/local：**GO**
- Staging skeleton：**GO**
- Staging live activation：**NO-GO / PENDING EVIDENCE AND COMPOSITION**
- Production：**NO-GO**

## 7. 官方实现依据

- [FC Web 函数调用机制](https://help.aliyun.com/zh/functioncompute/fc/web-functions)
- [Node.js 20 请求处理程序](https://help.aliyun.com/zh/functioncompute/fc/request-handlers)
- [FC 实例健康检查](https://help.aliyun.com/zh/functioncompute/fc-3-0/user-guide/configure-a-custom-health-check-policy-for-instances-1)
- [自定义运行时及 Node.js 20 路径](https://help.aliyun.com/zh/functioncompute/fc/custom-runtime/)
