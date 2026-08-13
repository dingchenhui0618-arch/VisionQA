# VisionQA 阿里云 Operator 只读就绪探针报告 v0.1

> 执行时间：2026-07-29（Asia/Shanghai）  
> 执行范围：只读，不创建、修改或删除资源；不下单；不调用 Qwen  
> 结论：`READY_FOR_RESOURCE_PLAN`

## 已确认事实

- 用户明确声明：已在 Microsoft Edge 登录阿里云 RAM Operator，并完成 MFA 登录。
- 用户明确声明：已绑定自定义策略 `VisionQAStagingOperatorBootstrapV01`。
- 用户明确声明：该 Operator 的 AccessKey 数量为 `0`。本探针仅记录该声明，不读取或索取任何凭据。
- Windows 应用枚举只读返回一个 Microsoft Edge 窗口，窗口标题包含 `Cloud Shell`，说明 Cloud Shell 页面已在 Edge 中打开。
- 用户已手工执行带 10 秒超时、隐藏原始响应的 `aliyun sts GetCallerIdentity` 只读探针，并回传 `STS=OK`；因此 Cloud Shell 终端和当前临时身份的 STS 调用能力已验证。
- 用户已手工执行 `ListPoliciesForUser` 三态只读探针并回传 `POLICY=NOT_BOUND`：API 查询成功，但目标 RAM 用户的账号级直接授权列表中没有自定义策略 `VisionQAStagingOperatorBootstrapV01`。
- 管理员完成现有策略的直接绑定后，用户使用同一只读命令复验并回传 `POLICY=OK`；目标自定义策略的账号级直接绑定现已验证。
- 用户完成四项服务只读探针并确认：`OSS=OK`、`RDS=OK`、`FC=OK`、`ACTIONTRAIL=OK`。其中 RDS 命令调用成功，截图仅截断了后续 echo 标签，不影响只读 API 成功事实。

## 自动化中止与人工补验

Windows Computer Use 安全运行时无法以足够置信度判断当前 Edge 页面 URL，因此主动停止本轮浏览器控制。按照安全规则，停止后未继续点击、输入、切换浏览器或尝试登录。

后续由用户在当前 Edge Cloud Shell 手工执行最小只读命令，并只回传脱敏状态标签。STS、目标策略直接绑定、OSS、RDS PostgreSQL、FC 3.0 和 ActionTrail 均已完成补验。探针没有打印或回传账号 ID、ARN、RequestId、资源名称或原始错误。

## 命令与云端变更记录

- Cloud Shell 只读能力检查：`STS / POLICY / OSS / RDS / FC / ACTIONTRAIL = OK`
- 云资源创建/修改/删除：`0`
- 订单或付费操作：`0`
- Qwen 真实调用：`0`
- AccessKey：用户声明数量为 `0`；本轮读取、创建或修改操作为 `0`

## Gate

```text
Cloud Shell 页面存在信号：OBSERVED_BY_WINDOW_TITLE
Cloud Shell 终端就绪：VERIFIED_BY_USER_READ_ONLY_PROBE
RAM / STS 调用能力：STS_OK
Bootstrap 策略绑定：DIRECT_BINDING_VERIFIED_BY_USER_PROBE
AccessKey=0：USER_ATTESTED / NO_AK_OPERATION_OBSERVED
OSS 控制面只读能力：OSS_OK
cn-beijing RDS PostgreSQL 只读能力：RDS_OK
cn-beijing FC 3.0 只读能力：FC_OK
cn-beijing ActionTrail 只读能力：ACTIONTRAIL_OK
Qwen 真实调用：0
结论：READY_FOR_RESOURCE_PLAN
```

Operator 已具备进入“资源计划评审”的条件。本结论只允许编制并审查资源清单、命名、区域、规格、费用上限、创建顺序与回滚方案；不等于授权立即创建资源。真实 staging、云端 smoke、Qwen canary 和 production Gate 保持关闭，直至后续独立批准。

## POLICY=NOT_BOUND 修复路径

`POLICY=NOT_BOUND` 不是网络或 CLI 错误，而是 `ListPoliciesForUser` 成功返回后，没有找到目标自定义策略。

使用拥有 RAM 授权管理权限的管理员会话，在阿里云 RAM 控制台执行：

1. 左侧进入 **身份管理 > 用户**；
2. 找到 `visionqa-staging-operator`，在操作列单击 **添加权限**；若已进入用户详情，则打开 **权限管理** 页签并单击 **添加权限**；
3. 资源范围选择 **账号级别**；
4. 在权限策略区域将策略类型筛选为 **自定义策略**；
5. 搜索完整名称 `VisionQAStagingOperatorBootstrapV01`；
6. 只勾选这一项，单击 **确认新增授权**，然后关闭结果面板；
7. 不创建新策略、不选择任何系统策略、不创建 AccessKey。

如果搜索不到该名称，立即停止并回报“策略不存在或当前管理员不可见”，不得创建同名重复策略。

即使同名策略可能通过用户组继承，当前 Gate 仍要求直接绑定：这样才能把授权证据、撤销动作和 `visionqa-staging-operator` 一一对应，避免撤销用户组策略时影响其他成员，也避免用户退出用户组后权限状态漂移。直接绑定同一策略不会扩大策略文档本身定义的权限范围。

绑定完成后，使用同一条只读命令复验：

```bash
timeout 10s aliyun ram ListPoliciesForUser --UserName visionqa-staging-operator 2>/dev/null | jq -e 'any(.Policies.Policy[]?; .PolicyName=="VisionQAStagingOperatorBootstrapV01" and .PolicyType=="Custom")' >/dev/null 2>&1; case "${PIPESTATUS[*]}" in "0 0") echo POLICY=OK;; "0 1") echo POLICY=NOT_BOUND;; *) echo POLICY=FAIL;; esac
```

本修复说明由用户在控制台手工执行；本 Agent 没有进行权限写入。当前云资源创建/修改/删除、订单、AccessKey 创建和 Qwen 调用仍均为 `0`。

## 下一步：四项服务只读能力探针

CLI 兼容性口径：

- OSS：Cloud Shell 预装 Alibaba Cloud CLI 官方支持 `aliyun oss ls`，这里限制最多返回 1 项并丢弃全部输出。OSS `ListBuckets` 是账号级、跨地域列表，不能按 cn-beijing 过滤；本步验证 OSS 控制面权限，真实北京区资源仍须等获批创建后再做区域 smoke。
- RDS：产品码 `rds`，只读 Action 为 `DescribeDBInstances`，显式固定 `cn-beijing` 和 `PostgreSQL`。
- FC 3.0：产品码 `fc`，只读 Action 为 `ListFunctions`；显式固定 `--region cn-beijing`、`--fcVersion v3`。
- ActionTrail：产品码 `actiontrail`，只读 Action 为 `DescribeTrails`，显式固定 `--region cn-beijing`。

整行一次粘贴；每项最多等待 10 秒，仅输出状态：

```bash
timeout 10s aliyun oss ls --limited-num 1 >/dev/null 2>&1 && echo OSS=OK || echo OSS=FAIL; timeout 10s aliyun rds DescribeDBInstances --RegionId cn-beijing --Engine PostgreSQL --PageSize 1 >/dev/null 2>&1 && echo RDS=OK || echo RDS=FAIL; timeout 10s aliyun fc ListFunctions --region cn-beijing --limit 1 --fcVersion v3 >/dev/null 2>&1 && echo FC=OK || echo FC=FAIL; timeout 10s aliyun actiontrail DescribeTrails --region cn-beijing >/dev/null 2>&1 && echo ACTIONTRAIL=OK || echo ACTIONTRAIL=FAIL; echo PROBE=COMPLETE
```

允许的输出只有：

```text
OSS=OK|FAIL
RDS=OK|FAIL
FC=OK|FAIL
ACTIONTRAIL=OK|FAIL
PROBE=COMPLETE
```

命令未包含创建、修改、删除、订单、AccessKey 或 Qwen/百炼调用；全部原始标准输出和错误输出均丢弃。

## 唯一下一步用户确认

用户在当前 Edge Cloud Shell 中手工执行下方的最小只读探针。整段可一次复制；脚本只输出 `OK/FAIL`、布尔值和资源数量，不打印原始响应、密钥、Token、完整账号 ID、ARN 或资源名称。

```bash
timeout 10s aliyun version >/dev/null 2>&1 && echo CLI=OK || echo CLI=FAIL
timeout 10s aliyun sts GetCallerIdentity >/dev/null 2>&1 && echo STS=OK || echo STS=FAIL
timeout 10s aliyun ram ListPoliciesForUser --UserName visionqa-staging-operator 2>/dev/null | jq -e 'any(.Policies.Policy[]?; .PolicyName=="VisionQAStagingOperatorBootstrapV01" and .PolicyType=="Custom")' >/dev/null 2>&1; case "${PIPESTATUS[*]}" in "0 0") echo POLICY=OK;; "0 1") echo POLICY=NOT_BOUND;; *) echo POLICY=FAIL;; esac
timeout 10s aliyun oss ls >/dev/null 2>&1 && echo OSS=OK || echo OSS=FAIL
timeout 10s aliyun rds DescribeDBInstances --RegionId cn-beijing --Engine PostgreSQL --PageSize 1 >/dev/null 2>&1 && echo RDS=OK || echo RDS=FAIL
timeout 10s aliyun fc ListFunctions --region cn-beijing --limit 1 --fcVersion v3 >/dev/null 2>&1 && echo FC=OK || echo FC=FAIL
timeout 10s aliyun actiontrail DescribeTrails --region cn-beijing >/dev/null 2>&1 && echo ACTIONTRAIL=OK || echo ACTIONTRAIL=FAIL
```

### 预期结果

- `CLI=OK`：Cloud Shell 内已安装的 Alibaba Cloud CLI 能在 10 秒内响应。
- `STS=OK`：当前 Cloud Shell 临时身份可调用 STS。Cloud Shell 的 RPC/OpenAPI 兼容语法使用 `GetCallerIdentity`；该 API 无请求参数，不需要 `--region`。
- `POLICY=OK`：指定自定义 Bootstrap 策略已绑定。
- `POLICY=NOT_BOUND`：API 调用成功，但响应中没有该自定义策略。
- `POLICY=FAIL`：CLI 超时、API 被拒绝、网络错误或 JSON 无法解析；命令不会显示原始错误。
- `OSS / RDS / FC / ACTIONTRAIL=OK`：对应只读 API 可达。
- 任一项为 `FAIL`：只回传该状态行，不要改成输出完整 JSON；每条命令最多等待 10 秒。
- 本探针不调用百炼/Qwen；Qwen 保持 `fetch=0`。

### 回传方式

只复制脚本最终输出的 7 行状态（从 `CLI` 到 `ACTIONTRAIL`）回到当前对话，不要复制命令历史、完整 JSON 或任何账号信息。然后确认：

> 阿里云只读探针已手工执行，脱敏输出已提供

在该确认与脱敏输出到位前，不创建任何 staging 资源。
