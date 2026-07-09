# Agent Instructions

## 项目定位

Aldaris 是一个 Issue Tracker.

实现应保持直接、可读、容易验证；

优先使用标准库，除已明确允许的依赖外不要引入新第三方库。

## 工作原则

- 修改前先阅读相关代码。
- 保持改动范围小，避免顺手重构无关代码。
- 不提交真实密钥、私有用户信息、完整聊天文本或一次性调试输出。

## Issues

Before creating an issue, review the available issue templates in the `.github`
directory.

When drafting the issue:

- Use the title format required by the template.
- Fill in or remove each section according to the template guidance.
- Include testing details, or explain why testing was not run.
- Do not invent testing results.
- Do not claim validation, verification, or review steps that were not actually
  performed.

## Automated Contributions

Fully automated contributions are not considered equivalent to normal community
participation.

A contribution may be considered fully automated if it is submitted through an
automated agent, or if the submitting account participates in project
discussions through an automated agent, without meaningful human review or
intervention.

When making this determination, maintainers may consider the overall behavior of
the account, including but not limited to disclosed agent usage, interaction
patterns, response characteristics, and other available evidence. No single
factor is determinative.

Maintainers reserve the right to accept, reject, modify, or reimplement any
contribution independently of any action taken against the submitting account.
Acceptance of a contribution does not imply acceptance of the submitting account
or its contribution method. If an account is determined to be primarily operated
through automated processes, we may need to restrict its future participation in
contributions until that determination is rescinded.

## Git Commits

When creating commits, follow the repository `git-commit` skill rules:

- Use Conventional Commits title format: `type(scope): subject`.
- Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`,
  `build`, `ci`, `chore`, `revert`.
- Use a meaningful scope based on the main module, package, or feature.
- Write the subject in imperative mood and describe the actual change.
- Use a concise Markdown list in the commit body, with each item describing one
  key change.
- Do not invent changes that are not present in the diff.
- Do not describe behavior, refactors, fixes, or tests that are not reflected in
  the commit.

Include at most one `Co-authored-by` trailer that matches the AI assistant
actually used to produce the change.

Examples:

- `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`
- `Co-authored-by: GitHub Copilot <copilot@github.com>`
- `Co-authored-by: Claude <81847+claude@users.noreply.github.com>`

If you are not one of the listed assistants, do not add a `Co-authored-by`
trailer.

Instead, ask the human collaborator to provide the exact `Co-authored-by`
trailer to use. Do not invent, infer, or generate one yourself.

## 允许命令

- 只允许使用 `go fmt ./...` 和 `go vet ./...`。
- 每次执行 `go fmt ./...` 或 `go vet ./...` 前都必须申请提权。
- 除非用户明确要求，不运行 `go test`、`go build`、`go mod tidy`、`make`、`make start` 等其它 Go 相关命令。

## 代码约定

- Go 代码使用 `gofmt`，不要手动对齐。
- 禁止使用短 `if` 写法，例如 `if err := ...; err != nil`；除非变量作用域确实不允许拆开。
- 需要关注并处理 `staticcheck` 提示，除非有明确理由保留并说明。
- 包名使用简短小写单词。
- 只有当 gotd 的 `github.com/gotd/td/session` 与本项目 `internal/session` 在同一文件发生命名冲突时，才将 gotd 的 session 包 alias 为 `tgsession`；不冲突时保持默认 `session` 名称。
- 错误信息字符串必须以大写开头；忽略 Go 常见的小写错误信息惯例。
- 错误信息带上下文，例如文件路径、Chat ID、规则行号或 API 操作名。
- 本项目不需要单元测试，能编译成功即通过。
