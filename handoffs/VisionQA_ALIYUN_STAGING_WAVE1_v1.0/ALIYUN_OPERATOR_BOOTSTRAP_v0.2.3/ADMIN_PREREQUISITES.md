# VisionQA 阿里云 Wave1 一次性管理员准备说明

适用策略：`VisionQAStagingOperatorBootstrapV01` / v0.2.3  
目标地域：华北 2（北京）`cn-beijing`  
操作身份：阿里云主账号或具有 RAM、资源组管理权限的管理员  
执行身份：`visionqa-staging-operator`  

> 本文只要求管理员完成前置配置。不要在聊天、截图、工单或 Shell history 中发送/记录真实 AccountId、完整 Role ARN、密码、MFA 恢复码或任何 AccessKey。

## 1. 创建或确认资源组

控制台路径：

**阿里云控制台 → 资源管理 → 资源组 → 资源组列表**

1. 搜索显示名称或资源组名称 `visionqa-staging`。
2. 若已存在，只确认它属于当前阿里云账号；不要重复创建。
3. 若不存在，点击 **创建资源组**：
   - 资源组标识/显示名称：`visionqa-staging`
   - 备注：`VisionQA staging only`
4. 创建后进入资源组详情。
5. 私下记录页面显示的 **资源组 ID**，供 Wave1 preflight 的 `VISIONQA_RESOURCE_GROUP_ID` 使用。

禁止：

- 不把资源组 ID 发到聊天。
- 不把生产资源移入此资源组。
- 不给 Operator 资源组创建、删除或成员管理权限。

## 2. 创建或确认 FC Runtime Role

控制台路径：

**阿里云控制台 → 访问控制 RAM → 身份管理 → 角色 → 创建角色**

选择：

- 可信实体类型：**阿里云服务**
- 可信服务：**函数计算 Function Compute**
- 角色名称：`visionqa-staging-runtime`
- 备注：`VisionQA staging fixture runtime only`

如果控制台提供“普通服务角色/服务关联角色”选择，使用普通 RAM 服务角色；不要创建具有全局管理能力的服务关联角色。

### 最小信任策略

角色只允许函数计算服务扮演：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": [
          "fc.aliyuncs.com"
        ]
      }
    }
  ]
}
```

不得加入 RAM 用户、账号 Root、OSS、ECS 或其他服务 Principal。

### fixture 阶段的权限选择

当前 Wave1 函数是 fixture-only：

- `LIVE_PROVIDER_ENABLED=false`
- 不读取 OSS 商品图
- 不访问 RDS
- 不调用 Qwen/百炼
- 不访问公网 API
- 不创建云资源

因此优先选择：**角色不附加任何数据面权限策略**。

只有当 Wave1 v0.5 明确配置 FC 将运行日志直接写入指定的
`visionqa-staging-sls` Project/Logstore，且独立 QA 确认需要 Runtime Role
写日志时，才由管理员另行附加仅覆盖两个固定 Logstore 的最小
`log:PostLogStoreLogs` 权限。不要附加：

- `AliyunOSSFullAccess`
- `AliyunLogFullAccess`
- `AliyunFCFullAccess`
- `AliyunRDSFullAccess`
- `AdministratorAccess`
- 任何 Qwen/DashScope/BSS 权限

## 3. 私下取得 AccountId 与 Role ARN

### AccountId

控制台右上角头像 → **账号中心** → **安全设置/基本信息**，查看账号 ID。

只在本机临时记事本或 RAM 控制台策略编辑器中使用。不要：

- 发到 Codex/微信/邮件；
- 出现在截图；
- 写入项目 Git 文件；
- 输入 Cloud Shell 命令行。

### Role ARN

控制台路径：

**访问控制 RAM → 身份管理 → 角色 → `visionqa-staging-runtime` → 基本信息**

复制页面显示的完整 ARN。它应指向精确角色
`visionqa-staging-runtime`，不能包含通配符，也不能是其他角色。

不要把完整 ARN 发到聊天或写入 Shell history。

## 4. 私下替换策略模板占位符

模板文件：

`D:\VisionQA\handoffs\ALIYUN_OPERATOR_BOOTSTRAP_v0.2.3\bootstrap_policy_wave1_v0.2.3.json`

在本机私下创建临时副本，然后：

1. 将每个 `<ACCOUNT_ID>` 替换为真实 AccountId。
2. 将 `<EXACT_FC_RUNTIME_ROLE_ARN>` 替换为上一步复制的完整 Role ARN。
3. 全文搜索 `<` 和 `>`，确认不存在未替换占位符。
4. 确认 FC 写操作资源只包含：
   - `functions/visionqa-staging-api`
   - `functions/visionqa-staging-evaluation-task`
5. 确认 `ram:PassRole` 的 Resource 只有一个精确 Role ARN。
6. 用完后删除包含真实 ID 的临时副本；不要提交 Git。

原始模板保留占位符，不要把真实 ID 回写到项目目录。

## 5. 更新现有同名 RAM 策略

控制台路径：

**访问控制 RAM → 权限管理 → 权限策略 → 自定义策略**

1. 搜索并打开现有策略 `VisionQAStagingOperatorBootstrapV01`。
2. 选择 **版本管理 → 创建新版本**。
3. 选择 **脚本编辑**。
4. 粘贴已在本机完成占位符替换的 v0.2.3 JSON。
5. 保存新版本。
6. 将新版本设为 **默认版本**。
7. 回到：
   **身份管理 → 用户 → `visionqa-staging-operator` → 权限管理**
8. 确认该用户仍直接绑定现有同名策略；不需要解绑再绑定。
9. 确认没有新增系统管理员策略，AccessKey 数量仍为 0，MFA 仍启用。

不要叠加 v0.2.3 为第二个新策略名；必须使用现有策略的新版本，确保旧宽权限不再作为默认版本生效。

## 6. 选择北京 Zone ID

控制台路径：

**专有网络 VPC → 交换机 → 创建交换机**

1. 地域选择 **华北 2（北京）**。
2. 展开可用区列表。
3. 选择当前账号可用、状态正常的北京可用区。
4. 页面通常同时显示可用区名称和 Zone ID；私下记录其 Zone ID，格式应以 `cn-beijing-` 开头。
5. 取消创建交换机，不要在此步骤提交资源订单。
6. 将该值仅用于 Wave1 preflight 的 `VISIONQA_ZONE_ID`。

选择原则：

- 必须属于 `cn-beijing`。
- 不根据示例猜测 Zone ID。
- 若后续 RDS 阶段要求特定可用区，届时重新做兼容性评审；Wave1 不授权 RDS 下单。

## 7. 脱敏留证

可留存以下截图，但必须遮挡真实 AccountId、完整 Role ARN、资源组 ID、用户名之外的个人信息：

1. 资源组列表中 `visionqa-staging` 存在。
2. RAM 角色名为 `visionqa-staging-runtime`，可信服务为函数计算。
3. 角色绑定权限列表为空，或仅显示已批准的最小日志策略名称。
4. `VisionQAStagingOperatorBootstrapV01` 新版本为默认版本。
5. Operator 直接绑定该策略、MFA 已启用、AccessKey=0。
6. 北京可用区页面只保留“华北 2（北京）”和 Zone 状态；遮挡具体账号信息。

证据文件名建议：

```text
01_resource_group_redacted.png
02_fc_role_trust_redacted.png
03_fc_role_permissions_redacted.png
04_ram_policy_default_version_redacted.png
05_operator_mfa_ak0_redacted.png
06_beijing_zone_redacted.png
```

不要把未脱敏截图放入项目目录。脱敏后再由外部审查角色确认。

## 8. 完成确认

全部完成后，只回复以下固定确认句，不附带任何 ID、ARN、截图或密钥：

> 阿里云 Wave1 管理员前置已完成：资源组和 FC Runtime Role 已确认，v0.2.3 已设为默认策略，北京 Zone ID 已私下记录，AccessKey 仍为 0。

