# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v0.7

> 审查日期：2026-07-30（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.7`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.7.zip`、实现报告 v0.7、v0.6 QA 报告、RAM v0.2.3  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`NO_GO`**

## 1. 制品与回归结果

- ZIP SHA-256 独立复算：
  `07966CB55724F82C8232FBF39D8E82DC3DA313662E530EF69601A398D8629C4A`
- RAM v0.2.3 SHA-256 保持：
  `E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`
- `SHA256SUMS`：全部 `OK`。
- Shell `bash -n`：9/9 PASS。
- 凭证门：`CREDENTIAL_GATE_TESTS=PASS cases=11`。
- 状态路径：`BASH_STATE_PATHS=PASS cases=8`。
- I/O 故障：`IO_FAULT_INJECTION=PASS cases=6`。
- manifest/ledger 攻击：`STATE_ATTACK_TESTS=PASS cases=5`。
- 静态禁止能力：PASS；未发现 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey 创建、公共 OSS/FC 或安全组入站授权调用。
- RAM Action 边界：PASS；未扩大，FC mutating 仍仅限两个固定函数 ARN。

v0.6 的“无凭证直接放行”逻辑已删除；no-env、profile-only、metadata-only 测试均改为 FAIL。完整同族 ID + Secret + Token、STS 调用和身份匹配逻辑也已加入。但 profile 隔离开关的取值不符合 Alibaba Cloud CLI 官方契约，构成新的 P1。

## 2. P1 阻断：`ALIBABA_CLOUD_IGNORE_PROFILE` 大小写错误

当前实现：

```bash
export ALIBABA_CLOUD_IGNORE_PROFILE=true
```

阿里云 CLI 官方环境变量文档明确规定：`ALIBABA_CLOUD_IGNORE_PROFILE` 必须设置为大小写敏感的全大写 `TRUE`，CLI 才会忽略配置文件中的 Profile，仅使用环境变量凭证。

官方依据：

- https://www.alibabacloud.com/help/en/cli/environment-variables

因此当前小写 `true` 不能作为 profile fallback 已被禁用的发布证据。阿里云 CLI 的 profile/命令行配置可能优先于环境变量；若 Cloud Shell 中存在活动 profile，`GetCallerIdentity` 不一定使用待验证的临时 STS 环境链。

风险结果：

- 临时 STS 环境变量完整，但 CLI 仍可能使用 profile 身份；
- 身份检查验证的是 profile，而不是“同一环境凭证链”；
- 长期 AK 或高权限 profile 仍可能绕过本轮意图；
- v0.6 的核心凭证链阻断尚未真正关闭。

## 3. 为什么 11/11 测试没有发现

测试只断言 Shell 变量值等于小写 `true`：

```bash
[[ "${ALIBABA_CLOUD_IGNORE_PROFILE:-}" == true ]]
```

其 `aliyun` stub 不实现真实 CLI 的 profile 优先级与大小写规则。因此 `11/11 PASS` 只证明脚本设置了变量，不能证明真实 CLI 已忽略 profile。

## 4. 其余凭证检查结果

静态逻辑已正确覆盖：

- 无凭证：FAIL；
- profile-only：FAIL；
- metadata-only：FAIL；
- ID/Secret 不完整：FAIL；
- AK 无 Token：FAIL；
- 空 Token：FAIL；
- 假/过期 Token：FAIL；
- 身份不符：FAIL；
- modern/legacy 混合链：FAIL；
- 完整临时 STS 且允许身份：候选 PASS。

未发现 `set -x`、`printenv`、凭证明文 echo、原始 STS 响应输出或完整账号标识落盘。凭证变量只在进程环境中使用，局部副本随后 unset。

## 5. 解禁条件

必须发布不可覆盖 v0.7 的新版本：

1. 将 profile 隔离固定为：

   ```bash
   export ALIBABA_CLOUD_IGNORE_PROFILE=TRUE
   ```

2. 测试必须断言全大写 `TRUE`，不得继续把小写值视为通过。
3. 新增一个仿真 profile 优先级的负测：存在活动/指定 profile 时，只有 `IGNORE_PROFILE=TRUE` 才允许 stub 使用 STS 环境链；小写、空值或未设置必须 FAIL。
4. 保持 no-env/profile-only/metadata-only FAIL，以及临时 STS、无/空/假/过期 Token、身份不符、混合变量链全部现有覆盖。
5. 重新计算目录 SHA、ZIP SHA，并由独立 QA 重新复跑所有测试与静态扫描。

## 6. 版本裁决

- v0.1–v0.6：`SUPERSEDED_DO_NOT_RUN`。
- v0.7：`NO_GO / DO_NOT_UPLOAD_OR_EXECUTE`。
- 不得在 Cloud Shell 手工改一行后继续运行；必须生成新版本和新 ZIP，保持制品可审计。

