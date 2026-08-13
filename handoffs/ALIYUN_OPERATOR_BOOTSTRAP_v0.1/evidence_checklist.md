# VisionQA 阿里云 Operator 证据清单 v0.1

只保存脱敏证据。不得包含密码、AccessKey、STS Token、百炼 API Key、RDS 密码、KMS Secret 值、Cookie、签名 URL 查询参数或图片正文。

## A. 身份

- [ ] RAM 用户名为 `visionqa-staging-operator`
- [ ] 仅控制台登录
- [ ] MFA 为强制
- [ ] AccessKey 数量为 0
- [ ] 没有 Administrator/RAM/BSS FullAccess
- [ ] Bootstrap 策略绑定时间和操作者已记录

## B. Cloud Shell

- [ ] 能创建 Environment 和 Session
- [ ] 上传、下载、AttachStorage 均无权限
- [ ] Cloud Shell 内未执行永久凭证配置
- [ ] Caller Identity 仅记录脱敏 ARN

## C. 资源边界

- [ ] 所有资源地域均为 `cn-beijing`
- [ ] 所有资源均归属 `visionqa-staging` 资源组
- [ ] 所有用户可命名资源均以 `visionqa-staging-` 开头
- [ ] 标签包含 `project=visionqa`
- [ ] 标签包含 `environment=staging`
- [ ] 标签包含非空 owner
- [ ] 未创建/修改 production
- [ ] 未授予账单、充值、IAM 提权权限

## D. OSS

- [ ] Bucket 名为 `visionqa-staging-*`
- [ ] ACL private，Block Public Access 开启
- [ ] 静态网站关闭，Bucket Policy 无公共访问
- [ ] 业务对象仅位于 `staging/visionqa/`
- [ ] 当前对象 14 天永久删除
- [ ] 未完成 Multipart Upload 1 天终止清理
- [ ] 未签名读取返回 403

## E. RDS PostgreSQL

- [ ] PostgreSQL Serverless/按已批准规格创建
- [ ] 无公网地址
- [ ] 白名单不包含 `0.0.0.0/0`
- [ ] 仅 VPC 私网
- [ ] migration/runtime 数据库账号分离
- [ ] 密码未出现在聊天、仓库、截图或 SLS
- [ ] 最终订单地域、规格和价格由预算责任人复核

## F. FC / 网络 / SLS

- [ ] FC 3.0 函数名 `visionqa-staging-*`
- [ ] Region 为 `cn-beijing`
- [ ] 绑定 `visionqa-staging-runtime`
- [ ] Function Role 使用 STS，无静态 AK
- [ ] VPC/vSwitch 与 RDS 匹配
- [ ] NAT/EIP/SNAT 只用于 staging 固定出口
- [ ] 实例并发为 1
- [ ] SLS Project/Logstore 名 `visionqa-staging-*`
- [ ] 应用日志保存 30 天
- [ ] 日志不含敏感正文

## G. 收紧

- [ ] Restricted 策略三个占位符已替换
- [ ] Restricted 策略 JSON 已校验
- [ ] Restricted 已绑定
- [ ] Bootstrap 已解绑
- [ ] `ram:PassRole` 已从人员身份撤销
- [ ] 创建/更新动作已不可用
- [ ] 受控只读检查仍可用
- [ ] 撤销演练负责人和时间已记录

## Gate

仅当 A–G 全部通过：

```text
ALIYUN_OPERATOR_BOOTSTRAP = PASS
ACCESS_KEY_COUNT = 0
BOOTSTRAP_WRITE_POLICY = REVOKED
STAGING_RESOURCE_CREATION = READY_FOR_CTO_WINDOW
```

本清单通过不代表百炼数据治理 Gate 通过，也不代表可以运行付费 Canary。
