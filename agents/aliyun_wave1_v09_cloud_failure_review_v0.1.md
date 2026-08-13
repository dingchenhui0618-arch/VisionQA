# VisionQA Wave1 v0.9 云端 Preflight 失败独立审查

> 日期：2026-07-30（Asia/Shanghai）  
> 审查性质：只读、独立 QA/治理审查  
> 云端执行：0；资源创建：0；费用：0；AccessKey 创建/读取：0  
> 结论：`SAFE_FAIL / REVISION_REQUIRED`

## 1. 职责

独立判断 v0.9 在真实 Cloud Shell 中的 preflight 失败是否发生在资源变更前，定位凭证状态机根因，给出不要求用户提供 AccessKey、不降低混合/不完整凭证防护的最小修订与验收标准。

## 2. 输入

- 审定 v0.9 交付包及凭证门实现；
- v0.8 真实 preflight 记录：Cloud Shell 同时注入 modern 与 legacy 凭证变量；
- v0.9 真实执行结果：
  - ZIP SHA：OK；
  - 审批 artifact：OK；
  - runtime 私有输入格式：OK；
  - `PREFLIGHT=FAIL reason=incomplete_modern_sts_environment`；
  - wrapper：FAIL；
  - apply：未运行；
  - 云资源：0。

没有把任何 AccessKey ID、Secret、SecurityToken、完整账号 ID 或原始 STS 响应作为审查输入。

## 3. 根因判断

### 已确定事实

`credential_gate.sh` 使用 `-v` 判断 modern 凭证族是否“出现”。只要 modern 三项中任一变量被定义，`modern_present=1`；随后要求三项全部非空，否则立即返回：

```text
incomplete_modern_sts_environment
```

因此本次错误可以确定表示：

1. Cloud Shell 至少定义了一个 modern 变量；
2. modern 的 ID、Secret、SecurityToken 中至少一项为空或未定义；
3. 代码在检查/利用可能完整的 legacy 镜像链之前已经停止；
4. `GetCallerIdentity` 尚未执行，apply 更未执行。

### 尚不能从现有证据确定的事实

现有脱敏结果不能区分：

- modern 三项全部为空占位；
- modern 仅部分字段非空；
- legacy 是否完整；
- modern 非空重叠字段是否与 legacy 逐字节一致。

不应猜测具体字段，也不应要求用户把凭证或变量值发到聊天中。

### 安全结论

这是一次正确的 fail-closed，不是凭证泄露或资源误创建。v0.9 不应重试或手工删门；必须用新的不可覆盖版本修订凭证族状态机。

## 4. 最小安全修订

将每个凭证族从二态 `present/not-present` 改为三态：

- `ABSENT`：三项全部未定义或为空；
- `COMPLETE`：三项全部非空；
- `PARTIAL`：介于两者之间。

然后仅按以下矩阵处理：

| modern | legacy | 处理 |
|---|---|---|
| COMPLETE | ABSENT | 使用 modern |
| ABSENT | COMPLETE | 规范化为 modern，unset legacy |
| COMPLETE | COMPLETE | 三项逐字节相同才使用 modern并 unset legacy；否则 FAIL |
| PARTIAL | COMPLETE | 仅当 partial 中每个非空字段都与 legacy 对应字段逐字节相同，才把它认定为同一 Cloud Shell 镜像的占位残片；使用完整 legacy 规范化为 modern并 unset legacy；任一重叠值不等即 FAIL |
| COMPLETE | PARTIAL | 对称处理：partial 中每个非空字段必须与 modern 对应字段逐字节相同；使用完整 modern并 unset legacy；任一不等即 FAIL |
| ABSENT | ABSENT | FAIL |
| PARTIAL | ABSENT | FAIL |
| ABSENT | PARTIAL | FAIL |
| PARTIAL | PARTIAL | FAIL |

该方案没有使用不完整凭证：任何 PASS 路径都必须至少存在一套完整的 ID + Secret + SecurityToken。它只允许把另一套“部分但无冲突”的变量视为同一临时 STS 镜像残片；不会拼接两套都不完整的凭证。

规范化后继续强制：

```bash
unset ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET ALIYUN_SECURITY_TOKEN
export ALIBABA_CLOUD_IGNORE_PROFILE=TRUE
```

随后必须使用规范化后的同一 modern 链调用 `GetCallerIdentity` 并验证批准身份。现有 profile、Credentials URI、额外 session token、假/过期 Token、身份不符保护全部保留。

## 5. 可选脱敏诊断

如实现方需要确认 Cloud Shell 的实际形态，只允许输出变量状态，不输出值：

- `U`：未定义；
- `E`：已定义但为空；
- `N`：已定义且非空。

最多记录六个字段的 `U/E/N` 位图和同名字段的 `MATCH/MISMATCH/NA`，不得输出长度、前后缀、哈希或原值。该诊断应由内部 Operator 在 Cloud Shell 中执行，不要求用户提供 AccessKey。

此诊断是改进证据，不是放宽凭证门的前置授权。

## 6. 输出

- 本独立审查报告；
- 根因分类：`MODERN_FAMILY_PARTIAL_OR_EMPTY_PLACEHOLDER / FAIL_BEFORE_STS`；
- 修订建议：三态凭证族 + 至少一套完整链 + partial mirror 仅允许无冲突重叠 + 单链规范化；
- v0.9 裁决：`SUPERSEDED_DO_NOT_RUN`；
- 新版本在独立 QA GO 前：`NO_GO_FOR_CLOUD_EXECUTION`。

## 7. 验收标准

新版本必须全部满足：

1. 至少一套凭证族为 COMPLETE，任何 PASS 路径都有非空 ID + Secret + SecurityToken。
2. 双 COMPLETE 只有三项逐字节完全一致才 PASS。
3. COMPLETE + PARTIAL 只有 partial 的全部非空重叠字段逐字节一致才 PASS；不一致 FAIL。
4. 两套 PARTIAL、PARTIAL + ABSENT、双 ABSENT 全部 FAIL。
5. 不允许把两套不完整凭证拼成一套完整凭证。
6. legacy-only 与安全的镜像场景最终均规范化为 modern，并 unset 全部 legacy 变量。
7. `ALIBABA_CLOUD_IGNORE_PROFILE` 精确为大小写敏感的 `TRUE`。
8. profile、metadata/Credentials URI、额外 session token、无 Token、空 Token、假 Token、过期 Token、身份不符继续 FAIL。
9. `GetCallerIdentity` 必须使用规范化后的同一环境链，且 IdentityType/ARN 匹配批准身份。
10. 测试矩阵至少覆盖：
    - modern COMPLETE / legacy ABSENT；
    - modern ABSENT / legacy COMPLETE；
    - 双 COMPLETE 相同与 ID/Secret/Token 分别不等；
    - modern 全空占位 + legacy COMPLETE；
    - modern PARTIAL + legacy COMPLETE：每个字段分别缺失、为空、相同重叠、不等重叠；
    - 对称的 COMPLETE + legacy PARTIAL；
    - 双 PARTIAL；
    - 不完整链拼接攻击；
    - profile/metadata/额外 token；
    - 假/过期 Token和身份不符。
11. 测试必须断言规范化后仅保留 modern 三项，不泄露任何值。
12. 静态扫描不得发现 `set -x`、`printenv`、凭证明文输出或原始 STS 响应落盘。
13. 重新计算目录 SHA、ZIP SHA，复跑 Bash、凭证、状态 8/8、I/O 6/6、攻击 5/5、禁止项与 RAM Action 边界。
14. 由独立 QA 给出新版本 `GO_FOR_MANUAL_CLOUDSHELL` 后才可恢复。

## 8. 最终判断

本次 v0.9 失败发生在 STS 身份验证和任何资源创建之前，安全边界有效：

```text
PREFLIGHT=FAIL
APPLY=NOT_STARTED
CLOUD_RESOURCE_CREATED=0
NEW_COST=0
```

最小安全方向不是“允许不完整 modern”，而是要求至少一套完整临时 STS 链，并对另一套 Cloud Shell 镜像残片执行无冲突校验后单链规范化。
