# VisionQA 阿里云 staging 专用网络 v0.1

日期：2026-08-06  
状态：`CREATED / VERIFIED / EMPTY / NO_ORDER`

## 已创建资源

- 地域：华北 2（北京）
- VPC：`visionqa-staging-vpc`
  - ID：`vpc-2zemfydacq5kqa6ssqoon`
  - IPv4 网段：`10.90.0.0/16`
  - 状态：可用
- 交换机：`visionqa-staging-vsw-a`
  - ID：`vsw-2zee61oe1pjr1t0z1m9gw`
  - 可用区：北京可用区 L
  - IPv4 网段：`10.90.1.0/24`
  - 可用 IPv4 地址：252
  - 状态：可用
- 资源组：`rg-acfmvsz2wmavpra | 默认资源组`
- IPv6：未开通

## 复验结果

- VPC 与交换机均由阿里云控制台返回“创建成功”。
- VPC 详情页复验名称、ID、地域、网段和可用状态一致。
- 交换机详情页复验所属 VPC、可用区、网段和可用状态一致。
- 当前交换机内 ECS=0、RDS=0，未创建任何数据库或计算实例。
- 本步骤未创建订单、未付款、未点击 RDS“立即购买”。VPC 与交换机本身未产生本次订单费用。

## 大白话说明

VPC 是 VisionQA 在阿里云里的独立“围墙”；交换机是围墙内划出的“房间”。后续 RDS 数据库会放进这个房间，只通过受控的私网路径与服务连接，不与默认网络混放。

## 下一步

回到 RDS Serverless 核价页，选择上述 VPC 和交换机，重新核对最终配置与金额。只有用户再次明确确认购买后，才允许创建 RDS 订单。
