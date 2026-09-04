# Agent Instructions

## 项目定位

Aldaris 是一个 Issue Tracker System.

实现应保持直接、可读、容易验证；

优先使用标准库，除已明确允许的依赖外不要引入新第三方库。

## 工作原则

- 修改前先阅读相关代码。
- 保持改动范围小，避免顺手重构无关代码。
- 不提交真实密钥、私有用户信息、完整聊天文本或一次性调试输出。

## 代码约定

- 错误信息带上下文，例如文件路径、Chat ID、规则行号或 API 操作名。

## 调试

- 如果项目已经启动：
  - 你可以通过 Explorer API 访问该应用的本地 Cloudflare 服务（KV、R2、D1、Durable Objects 和 Workflows）。
  - API 端点：<http://localhost:3000/cdn-cgi/local/explorer/api>
  - 请从 <http://localhost:3000/cdn-cgi/local/explorer/api> 获取 OpenAPI 架构，以查看可用操作。在开发过程中，您可以使用这些端点来列出、查询和管理本地资源。
