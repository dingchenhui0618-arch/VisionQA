# VisionQA 阿里云 Staging Wave1 独立 QA 报告 v0.2

> 审查日期：2026-07-29（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.2`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.2.zip`、`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.1`、v0.1 QA 报告  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`NO_GO / DO_NOT_UPLOAD_OR_RUN`**

## 1. 完整性与本地验证

- ZIP SHA-256 已独立复算并匹配交付声明：  
  `8E867B0567823FD93DC150952D391972C3D8D37123ABA5940B69166816AE4923`
- 四个脚本均通过 Git Bash `bash -n`。
- RAM 策略 JSON 可解析。
- `SHA256SUMS` 与目录内文件哈希一致。
- 危险能力扫描：脚本未调用 RDS、NAT、EIP、Qwen/DashScope、RAM/IAM、BSS、AccessKey 创建或订单接口。
- 策略对上述能力均为显式 Deny；`oss:PutBucketAcl` 仍为 Deny，脚本已不再调用该 Action。

## 2. v0.1 问题关闭情况

| 检查项 | 结果 | 说明 |
|---|---|---|
| 无 `PutBucketAcl` | PASS | apply 中明确不调用；策略继续 Deny |
| OSS private / BPA / SSE-OSS / 14+1 | PASS（静态） | 创建后设置 BPA、AES256、14 天对象过期、1 天分片清理；verify 回读 |
| FC 实例并发 1 | PASS | `instanceConcurrency=1` |
| FC 最大实例 1 | PASS（设计语义） | `reservedConcurrency=1` 配合单实例并发 1 |
| FC 预留实例 0 | PASS | `PutProvisionConfig target=0` 且 verify 回读 |
| 统一命名与四标签 | PARTIAL / P1 | apply 写四标签，但 preflight 漂移检查仅校验三个标签，遗漏 `owner`；部分资源未验证 Resource Group |
| 预算证据 SHA fail-closed | **FAIL / P0** | 仅校验输入是 64 位十六进制；不验证证据文件存在，也不把 SHA 与实际证据文件或批准清单比对 |
| 前置值不泄露 | PASS | AccountId 只用于内存哈希；Role ARN 隐藏输入并写 0600 文件 |
| NotFound 与 403 分类 | **FAIL / P1** | 仅 grep `NotFound|not found|404`，不能可靠识别 OSS `NoSuchBucket`、SLS `ProjectNotExist` 等官方错误码 |
| 部分失败 ledger | **FAIL / P0** | 每次 preflight 执行 `: > ledger.jsonl`，重跑会清空上次部分创建记录 |
| rollback 仅本批 CREATED + ownership | **FAIL / P0** | ledger 没有不可变 run/batch ID；`created()` 会匹配历史任意 CREATED，且只按 kind/name，不把真实资源 ID 与 ledger 哈希重新绑定 |
| RDS/NAT/EIP/Qwen/AK/RAM/BSS 禁止 | PASS | 脚本无调用，策略显式 Deny |
| Bash 语法 | PASS | 四脚本 `bash -n` 均通过 |
| CLI 参数官方兼容性 | PARTIAL / P1 | 命令未在同版本 Cloud Shell 做无写入解析验证；脚本使用通用 `aliyun <service> <Action>`，但官方部分新文档展示 `ossutil api` / `aliyunlog`，必须在目标 Cloud Shell 版本逐项确认 |

## 3. 阻断问题

### P0-1：预算证据门可被任意 64 位字符串绕过

`wave1_preflight.sh` 的 `require_sha` 只检查格式。它不要求预算证据文件存在、不计算文件 SHA，也不与外部审批表中的固定 SHA 比对。因此：

```bash
VISIONQA_BUDGET_ALERT_EVIDENCE_SHA256=$(printf '0%.0s' {1..64})
```

仍可通过预算门。当前输出 `BUDGET=OK` 并不能证明 ¥150/¥240/¥300 三档告警已配置。

必须修复为：

1. 要求本地 0600 预算证据文件存在；
2. 对该文件计算 SHA-256；
3. 与管理员批准清单中固定的 expected SHA 比较；
4. 任一缺失、格式错误或不一致均停止；
5. ledger 只记录证据摘要，不记录账号/敏感内容。

### P0-2：preflight 重跑会销毁部分失败证据

脚本开头无条件执行：

```bash
: >"$LEDGER"
```

若 apply 已创建 VPC/OSS 等资源后失败，用户重新运行“一条执行命令”，preflight 会先清空 `CREATED` 记录。随后 rollback 无法识别本批资源，违背“部分失败可审计、仅回滚本批创建”的硬要求。

必须改为 append-only ledger，并为每次批准批次生成不可变 `batch_id/run_id`。已有未完成批次必须 fail-closed，不能静默覆盖。

### P0-3：rollback 的“本批”绑定不足

`created()` 只搜索任意历史记录：

```bash
any(.[]; .phase=="apply" and .kind==$k and .result=="CREATED")
```

没有 batch/run ID，也没有把 `resource-ids.env` 中的真实资源 ID 重新哈希后与 ledger 的 `id_sha256` 比对。结果是：

- 历史批次的 CREATED 可触发当前回滚；
- 被替换的本地 state 文件可能使名称/ID 与 ledger 不一致；
- ownership 仅靠可变标签，不能证明“由本批准批次创建”。

必须同时验证：当前 batch ID、kind、CREATED、真实资源 ID 的 SHA、固定名称、Resource Group、四标签和区域。

## 4. 非阻断但必须在下一版关闭的 P1

1. **错误分类不可靠**：应解析 CLI 返回的结构化 `Code`/HTTP 状态，明确白名单 `NoSuchBucket`、`ProjectNotExist`、相应 Logstore NotFound；403、超时、JSON 解析失败均必须保持 fail-closed。阿里云官方 SLS 错误表明确使用 `ProjectNotExist`（HTTP 404），当前正则不匹配该字符串。
2. **标签漂移遗漏 owner**：preflight 的 VPC/vSwitch/SG/OSS/SLS/FC 标签判断只要求 3 项，遗漏 `owner=dingchenhui`，与 README 的四标签基线不一致。
3. **Resource Group 漂移覆盖不全**：SLS `GetProject` 官方响应含 `resourceGroupId`，但脚本未校验；FC 和 OSS 也未完成同级别 Resource Group 绑定回读。
4. **preflight 依赖清单不完整**：apply 还依赖 `zip`、`base64`、`mktemp`、`cut`、`stat`，但 preflight 未检查。
5. **策略最小化仍有冗余写权限**：例如 FC `UpdateFunction`、SLS `UpdateLogStore/CreateIndex/UpdateIndex`、OSS Object 写删权限当前脚本未使用。若非本 Wave1 必需，应从 bootstrap 移除或在报告中逐项解释。
6. **同版本 CLI 验证缺失**：必须在目标 Cloud Shell 使用不会创建资源的 help/参数解析方式核对所有 service、Action 和 flag；不能把本地 Bash 语法通过等同于阿里云 CLI 兼容通过。

## 5. 已确认的安全项

- OSS 未显式修改 ACL；verify 要求 private。
- BPA、SSE-OSS、lifecycle 14+1 均有写入与回读。
- FC 为 fixture，`LIVE_PROVIDER_ENABLED=false`，未包含 Qwen 调用。
- FC 并发/实例/预留限制均有写入与回读。
- SG 不创建 ingress，且要求现有 ingress 数量为 0。
- rollback 删除命令未使用 `|| true` 吞错。
- Bucket 非空、存在未完成分片或标签不符时回滚停止。
- RAM 策略显式 Deny RDS 下单、NAT/EIP、公共 ACL/Policy/Website、Qwen、BSS、AK 与 IAM/RAM 提权。

## 6. 解禁条件与用户最少操作路径

当前不能向用户提供“上传 ZIP 并执行”的路径。实现 Agent 应先发布 **v0.3**（不得覆盖 v0.2），关闭上述 3 个 P0 和全部执行前 P1，并重新生成 ZIP、SHA256SUMS 与独立 QA。

重新 QA 达到 `GO_FOR_MANUAL_CLOUDSHELL` 后，用户最少操作路径应保持为：

1. 管理员把现有 RAM 自定义策略更新为审定的新版本并设为默认；
2. 管理员在本地准备北京 Zone ID、Resource Group ID、FC Runtime Role ARN，以及预算证据文件与其批准 SHA；完整 AccountId 和 Role ARN不得发到聊天；
3. 用户上传唯一审定 ZIP 到 Cloud Shell；
4. 校验 ZIP SHA 后，只执行一条：

```bash
bash wave1_preflight.sh && bash wave1_apply.sh && bash wave1_verify.sh
```

在新 QA GO 前：`NO_GO / DO_NOT_UPLOAD_OR_RUN`。
