# 国产模型 Canary 数据包 v0.1

该目录是 VisionQA 国产多模态模型 staging canary 的数据控制面，不包含任何图片副本。

文件：

- `manifest.json`：机器可读来源、哈希、rights、gold、payload 规则、预算占位与停止条件；
- `human_reference.csv`：仅供内部验收的人工对照表，严禁作为 Provider 请求附件；
- `RUNBOOK.md`：固定运行顺序、调用前门禁、通过条件和停止条件。

原始图片继续保留在购买素材目录，运行器应在调用前重新计算 SHA-256。不得把本目录或素材复制到公开目录，不得创建公网 URL。

人工 gold 只用于回收结果后的离线比较，调用前必须从 Provider payload 中剥离。
