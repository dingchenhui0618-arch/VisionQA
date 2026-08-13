# SUPERSEDED

`ALIYUN_AUTHORIZATION_v0.1` 已于 2026-07-29 被
`D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2` 替代。

原因：v0.1 的 `ALIYUN-OSS-001` 使用“7 天或 30 天”歧义口径，与冻结架构和
OSS 实现的生命周期不一致。

v0.1 文件仅用于历史审计，不得继续提交、签署或作为资源配置依据。有效口径唯一为：

- `staging/visionqa/*` 全部当前对象 14 天后永久删除；
- 未完成 Multipart Upload 1 天后中止并清理；
- 不允许选择其他保留期。

