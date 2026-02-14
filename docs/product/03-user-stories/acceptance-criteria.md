# 验收标准（Gherkin 风格）

## AC-000 请求边界合规
- Given 产品定义为 RPC-Only 架构
- When 对业务主流程进行网络请求审查
- Then 不应出现任何中心化后端业务服务请求

## AC-006 零遥测合规
- Given 产品定义为零遥测工具
- When 对前端资源与网络请求做审查
- Then 不应出现分析脚本、追踪像素或遥测上报接口

## AC-007 IPFS 部署合规
- Given 产品以静态站点方式构建
- When 部署到 IPFS
- Then 在无中心化后端条件下仍可完成核心钱包流程

## AC-008 RPC 节点切换
- Given 用户在网络设置中切换 RPC 节点
- When 再次发起读写请求
- Then 请求应命中新节点且功能持续可用

## AC-009 原生 Safe 交互
- Given 用户需要创建或执行 Safe 多签交易
- When 在钱包界面操作
- Then 不依赖第三方 dApp 即可与 Safe 合约完成交互

## AC-001 导入成功
- Given 用户输入有效助记词
- When 点击导入
- Then 进入主界面并显示地址/资产区域

## AC-002 地址校验
- Given 用户输入非法地址
- When 尝试发送
- Then 发送按钮不可执行或给出明确错误提示

## AC-003 交易超时
- Given 交易长时间未确认
- When 超过轮询策略上限
- Then 停止高频轮询并展示超时失败原因

## AC-004 Safe 去重
- Given 用户重复跟踪同链同地址 Safe
- When 再次提交
- Then 不新增重复记录，但可切换到该 Safe 上下文

## AC-005 过期提案清理
- Given Safe 当前 nonce 已推进
- When 打开队列
- Then 自动清理小于当前 nonce 的过期提案
