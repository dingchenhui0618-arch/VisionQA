# VisionQA 阿里云 Staging Wave1 独立安全 QA 报告 v0.1

> 审查日期：2026-07-29（Asia/Shanghai）  
> 审查角色：独立安全 / 基础设施 QA Agent  
> 审查范围：`handoffs/ALIYUN_STAGING_WAVE1_v0.1/`、执行报告、资源计划、已绑定 Bootstrap 策略  
> 云端动作：0；阿里云写命令：0；订单：0；模型调用：0  
> **最终结论：`NO_GO`**

## 1. 结论

当前包**不得在 Cloud Shell 执行 `wave1_apply.sh`**。阻断原因不是用户授权状态，而是脚本、资源计划和已绑定 RAM Bootstrap 策略之间存在确定性冲突。按当前状态执行会在创建部分资源后，于 OSS 安全配置阶段失败，形成“部分创建、未达安全基线”的中间态。

最关键的阻断项：

1. Bootstrap 策略显式 `Deny oss:PutBucketAcl`，但 `wave1_apply.sh` 必须执行 `oss PutBucketAcl --Acl private`。
2. 策略缺少 `oss:PutPublicAccessBlock`、`oss:GetPublicAccessBlock`、`oss:PutBucketEncryption`、`oss:GetBucketEncryption`，脚本无法设置或验证 BPA 与 SSE-OSS。
3. 回滚所需的 FC、SLS、OSS、ECS、VPC 删除 Action 均未授权；一旦部分失败，当前 Operator 无法按包内 runbook 回收资源。
4. Bootstrap 策略仍允许本 Wave1 明确 HOLD 的高风险写操作，包括 `rds:CreateDBInstance`、`vpc:CreateNatGateway`、`vpc:AllocateEipAddress` 等。脚本虽未调用，但权限边界与审批范围不一致。
5. FC 只设置 `instanceConcurrency=1` 和 `reservedConcurrency=0`，没有实现资源计划要求的“最大实例数 1”；`reservedConcurrency=0` 也不能替代最大实例数约束。

以上任一项均足以阻止执行。

## 2. 审查结果矩阵

| 检查项 | 结果 | 证据 / 风险 |
|---|---|---|
| 固定地域 | PASS | 脚本固定 `REGION=cn-beijing`，Zone 强制 `cn-beijing-*` |
| 禁止 RDS/NAT/EIP/Qwen/AK 脚本调用 | PASS（脚本层） | 四个脚本无对应创建/调用命令，且拒绝静态 AK 环境变量 |
| 权限最小化 | FAIL / P0 | 策略允许 RDS、NAT、EIP 创建，与本次授权范围冲突 |
| OSS Private | FAIL / P0 | `PutBucketAcl` 被显式 Deny |
| OSS BPA | FAIL / P0 | Put/Get PublicAccessBlock Action 缺失 |
| OSS SSE-OSS | FAIL / P0 | Put/Get BucketEncryption Action 缺失 |
| OSS Lifecycle 14+1 | 脚本正确、授权不完整 | Put/Get Lifecycle 已授权；但前置安全配置会先失败 |
| OSS 既存资源漂移保护 | FAIL / P1 | preflight 只做 `stat`；未验证 region、owner、ACL/BPA/SSE/lifecycle 后才允许 mutation |
| VPC/vSwitch/SG | PARTIAL | CIDR、Zone、VPC 关联和零入站检查较好；vSwitch 未打标签 |
| `0.0.0.0/0` 入站 | PASS | 不创建入站规则，且对同名 SG 要求入站权限数量为 0 |
| SLS 留存 | PARTIAL | 新建时 30/90 天正确；既存 Logstore 在 apply 前不验证/修复 TTL，最终 verify 才发现 |
| FC fixture gate | PARTIAL | fixture 环境变量和 live=false 存在；缺最大实例数 1，且未验证角色、runtime、memory、timeout、code drift |
| FC 预留实例 | PARTIAL / 语义待修 | 写入 `reservedConcurrency=0`；需按 FC 3.0 官方接口确认其含义及是否会将函数完全限流 |
| 全资源标签 | FAIL / P1 | 仅 VPC、SG 打标签；vSwitch、OSS、SLS、FC 未满足统一标签要求 |
| 命名一致性 | FAIL / P1 | 资源计划为 `visionqa-staging-oss-<后6位>`、SLS 带账号后缀；脚本为账号 SHA 前10位 Bucket、无后缀 SLS |
| 幂等与重复资源 | PARTIAL | VPC/vSwitch/SG/FC 对同名重复 fail-closed；OSS/SLS 将权限错误误判为 absent 后再尝试创建 |
| 部分失败恢复 | FAIL / P0 | 没有创建 ledger；回滚权限缺失且多数删除使用 `|| true`，可能报告 PASS 但资源仍存在 |
| 回滚默认安全 | PARTIAL | 有强确认字符串、Bucket 非空拒删；但未验证资源组/标签/归属，且删除失败被吞掉 |
| 预算门 | FAIL / P1 | 注释声明 ¥300，但脚本没有预算/账单告警存在性检查、费用预估或硬停止信号 |
| 三个前置变量一次完成 | FAIL / P1 | README 只要求管理员预建并手填，没有给出安全、可复制的获取步骤或脱敏验证命令 |
| 不暴露账号 ID | PARTIAL | Bucket 使用账号 ID 的 SHA，不直接输出；但 README 要求手填完整 Role ARN，且未给出避免回显/历史记录的方法 |
| Bootstrap Action 覆盖 | FAIL / P0 | 见第 3 节 |

## 3. Script Action 与 Bootstrap 策略核对

### 3.1 Apply / Verify 必需但缺失或被拒绝

- `oss:PutBucketAcl`：**显式 Deny**。
- `oss:PutPublicAccessBlock`：缺失。
- `oss:GetPublicAccessBlock`：缺失。
- `oss:PutBucketEncryption`：缺失。
- `oss:GetBucketEncryption`：缺失。

### 3.2 Rollback 必需但缺失

- `fc:DeleteFunction`
- `log:DeleteLogStore`
- `log:DeleteProject`
- `oss:DeleteBucket`
- `ecs:DeleteSecurityGroup`
- `vpc:DeleteVSwitch`
- `vpc:DeleteVpc`

所以当前 README 所称回滚能力对 Operator 并不成立。

### 3.3 超出本次审批范围但仍被允许

- `rds:CreateDBInstance`
- `rds:CreateAccount`
- `rds:CreateDatabase`
- `rds:ModifySecurityIps`
- `vpc:CreateNatGateway`
- `vpc:AllocateEipAddress`
- `vpc:AssociateEipAddress`
- `vpc:CreateSnatEntry`
- `ecs:AuthorizeSecurityGroup`

必须通过**替换** Bootstrap 策略而非叠加新宽权限策略来修复：移除上述 HOLD 写权限，仅增加 Wave1 已批准安全配置与精确回滚所需 Action。不得使用系统管理员策略。

## 4. 三个前置变量审查

当前 README 不能让 Owner 一次性、安全完成：

- `VISIONQA_ZONE_ID`：没有提供北京可用区只读枚举与选择规则，也没有验证该 Zone 是否适合后续 RDS/FC 规划。
- `VISIONQA_RESOURCE_GROUP_ID`：策略不含资源组读取；README 未提供控制台精确路径、脱敏检查或直接注入 Cloud Shell 的方法。
- `VISIONQA_FC_ROLE_ARN`：策略禁止创建角色是正确的，但 README 未提供角色信任策略、最小运行权限、控制台创建步骤和 `PassRole` 验证。完整 ARN 含账号 ID；直接 `export` 会进入 shell history。

修复要求：

1. 管理员在控制台预建资源组与 FC Runtime Role。
2. 提供控制台字段级步骤与最小 Role 信任/权限 JSON。
3. 使用 Cloud Shell 隐藏输入或临时文件（权限 `600`）注入 Role ARN，不在聊天、截图和 shell history 中出现。
4. 提供只输出 `ZONE=OK / RG=OK / ROLE=OK` 的脱敏 preflight。

## 5. 脚本本身的其他问题

1. `GetProject`、`GetLogStore` 和 OSS `stat` 以“任意失败=不存在”处理，权限错误、超时、地域错误都可能进入 create 分支；应区分明确 NotFound 与其他错误。
2. apply 对已存在 FC 仅校验 fixture mode，随后便修改并发配置；未先验证 Role、runtime、handler、memory、disk、timeout、live gate 和代码摘要，漂移保护不足。
3. verify 未验证 FC `role`、runtime、memory、disk、timeout、最大实例数、预留实例，也未验证统一标签和资源组。
4. rollback 对 FC/SLS/OSS 删除错误使用 `|| true`，最终可能输出 `ROLLBACK=PASS` 假阳性。
5. rollback 仅按名称定位 VPC/vSwitch/SG，未要求资源组和标签匹配；存在误删同名非本批资源的风险。
6. 缺少持久化本批创建资源 ID 与 `created_by_this_run` 标记；部分失败后无法安全区分“本轮新建”和“之前已存在”。
7. 资源创建顺序基本符合 VPC→vSwitch→SG→OSS→SLS→FC，但 FC Role 和资源组均为不可审计的外部前置；执行包没有把它们纳入一致性证据。
8. README 是 UTF-8，但在部分 Windows 默认 PowerShell 解码下会乱码；Cloud Shell 中通常正常。交付包应明确 UTF-8，并提供 SHA256 清单。

## 6. 本地验证与交付物状态

- 未执行任何 `aliyun` 写命令。
- 未修改四个脚本；当前问题无法仅通过不扩大权限的脚本修改达成既定安全目标。
- 本机 Bash 路径不映射 `D:`，因此本轮无法独立复现已有报告中的 `bash -n PASS`；这不改变上述静态 P0 结论。
- 审查目录内未发现 zip 包或 SHA256 manifest；现有执行报告也未记录 zip 路径与摘要。因此“zip SHA”无法独立确认。
- 当前文件 SHA256 应在修订完成后重新生成；在 P0 修复前不建议将现包上传到 Cloud Shell。

## 7. 解除 NO-GO 的必要条件

必须由基础设施实现 Agent 完成后重新独立 QA：

1. 生成 **v0.2** 包，避免覆盖已审查 v0.1。
2. 用替换策略修正 RAM Action：满足 Private/BPA/SSE/Lifecycle/只读验证/精确回滚，同时移除 RDS/NAT/EIP 等 HOLD 写权限。
3. 增加资源 ID ledger、精确 ownership/tag/resource-group 校验和可靠 rollback。
4. FC 明确实现并验证：fixture、实例并发 1、最大实例 1、预留 0、角色、runtime、memory、timeout、代码摘要。
5. 全部资源统一命名、资源组和标签；协调资源计划中的 Bucket/SLS 命名差异。
6. 将三项前置变量改造成可一次完成、不会泄露账号 ID 的控制台/Cloud Shell 流程。
7. 增加预算门证据检查；至少要求执行前存在 ¥150/¥240/¥300 告警证据，并在脚本输出中 fail-closed。
8. 使用 Cloud Shell 同版本 CLI 对所有命令和参数做**只读/语法级**兼容验证。
9. 重新生成 zip、`SHA256SUMS`、执行报告与变更说明。

在上述条件全部通过前：`NO_GO / DO_NOT_RUN_WAVE1_APPLY`。
