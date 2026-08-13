# VisionQA 阿里云 Operator 撤销手册 v0.1

## 触发条件

任一情况立即撤销：

- 创建页面地域不是 `cn-beijing`
- 资源名或标签不是 staging
- 出现 production 资源写权限
- AccessKey 被创建
- MFA 失效
- RDS 开启公网或白名单出现 `0.0.0.0/0`
- OSS 变为公开
- 预算、IAM 或 Secret 权限异常
- Cloud Shell/控制台疑似被他人使用

## 立即止损（账号管理员）

1. 从 `visionqa-staging-operator` 解绑 `VisionQAStagingOperatorBootstrapV01`。
2. 禁用该用户的控制台登录。
3. 检查并删除该用户下意外创建的 AccessKey；本项目正常值应始终为 0。
4. 终止活跃登录会话并重置密码/MFA。
5. 禁止 FC 新请求，保持 fixture/live Gate 为关闭。
6. 如有百炼 Key，禁用或删除；不要导出 Key 值。

## 资源侧隔离

1. FC：下线 staging 版本/别名并解除 Function Role。
2. RDS：确认无公网地址，将白名单缩至空或受控维护 CIDR。
3. OSS：Block Public Access、禁止公开 ACL/Policy，清理 `staging/visionqa/` 临时对象。
4. NAT/EIP：移除 staging SNAT，避免继续产生公网调用。
5. SLS/ActionTrail：保留脱敏审计证据，不复制敏感正文。

## 删除顺序

在外审要求彻底撤销时：

1. 删除 FC 触发器、别名、函数；
2. 删除 `staging/visionqa/` OSS 对象与未完成分片；
3. 删除/释放 RDS（先确认无需要保留的审计记录）；
4. 删除 SNAT、NAT、EIP；
5. 删除安全组、vSwitch、VPC；
6. 按保留要求处理 SLS；
7. 删除空 OSS Bucket；
8. 删除空资源组。

任何删除都由账号管理员核对真实资源 ID 后执行；禁止使用宽泛通配符批量删除。

## 验收

- [ ] Operator 控制台登录已禁用或降为 Restricted
- [ ] AccessKey 数为 0
- [ ] Bootstrap 写策略已解绑
- [ ] FC 无流量
- [ ] 百炼 Key 无效
- [ ] OSS 无公开访问
- [ ] RDS 无公网
- [ ] 无 `0.0.0.0/0`
- [ ] EIP/NAT 不再计费或已有书面保留理由
- [ ] 账单无异常继续增长
- [ ] ActionTrail/SLS 有脱敏撤销记录

完成后记录：

```text
ALIYUN_OPERATOR_REVOKED = YES
ACCESS_KEY_COUNT = 0
PRODUCTION_TOUCHED = NO
ONGOING_COST = VERIFIED
```
