# 发布记录（Releases）

本文件用于记录“每次正式发布”的事实信息，确保可追溯、可复现、可对齐。
它与 `docs/CHANGELOG.md` 的分工如下：
- `docs/CHANGELOG.md`：面向用户/产品的关键变更（新增/修复/变更）。
- `docs/RELEASES.md`：面向交付的发布元数据与发布区间（版本号、时间、commit hash、变更范围摘要、致命 bug 修复说明）。

---

## 记录规则（必须）
- 进入发布阶段即自增版本号（并同步到代码中的版本字段，例如 `package.json`、`config/app.ts` 等）。
  - 版本判断口径：`新增功能` 仅指用户可感知的新能力（面向用户可用、可验证），不等于“新增了代码”。
  - 纯技术改动（重构/依赖升级/测试补充/文档更新/内部脚本）默认不计入新增功能，应按优化/修复口径处理。
- 发布时必须记录：`版本号`、`发布时间`、`commit hash`。
- 必须检查并记录自上一次发布以来的“代码级变更范围”（至少提供提交列表或 PR 列表的摘要）。
- 必须说明：
  - 本次关键新增功能（面向用户/产品）
  - 最近提交的致命 bug 修复（崩溃/资金风险/阻断主流程/数据损坏/严重安全问题）

---

## v0.2.0（Beta）- 发布候选
- 发布时间：2026-02-16 11:56（+08:00）
- 发布 commit：`待发布（提交后填写 git rev-parse --short HEAD）`
- 版本号变更：v0.1.0 -> v0.2.0

### 代码级变更范围（自上次发布以来）
- 基准（上次发布 commit）：`9ee84d7`
- 本次区间：`9ee84d7..HEAD` + 当前工作区未提交变更（发布候选）
- 提交摘要（已入库）：无（当前候选主要来自工作区变更）
- 关键文件范围（本次候选）：
  - `index.html`
  - `metadata.json`
  - `public/robots.txt`
  - `public/sitemap.xml`
  - `public/security.txt`
  - `public/zh/index.html`
  - `public/en/index.html`
  - `scripts/check-seo.mjs`
  - `.github/workflows/seo-gate.yml`
  - `README.md`
  - `docs/CHANGELOG.md`

### 关键新增功能说明（面向用户/产品）
- SEO 隐私叙事升级：首页与元数据完成隐私关键词重构，统一聚焦“隐私优先、零遥测、无后台、自托管”。
- 多语言 SEO：新增 `/zh/` 与 `/en/` 语言落地页，补齐 `canonical`、`hreflang`、`og` 元信息与多语言 sitemap 互链。
- SEO 门禁自动化：新增 `check:seo` 与 CI `seo-gate`，把 `robots/sitemap/head 元信息/域名一致性/docs 禁索引` 变为阻断式校验。

### 致命 bug 修复说明（最近提交/候选）
- 本次候选无新增“致命 bug”修复项。
- 延续保障：节点切换余额误判 `0` 的致命体验问题修复仍生效，并有自动化回归覆盖（见 `docs/CHANGELOG.md` 0.1.0）。

---

## v0.1.0（Beta）- 发布候选
- 发布时间：2026-02-16 11:21（+08:00）
- 发布 commit：`待发布（提交后填写 git rev-parse --short HEAD）`
- 版本号变更：v0.0.2 -> v0.1.0

### 代码级变更范围（自上次发布以来）
- 基准（上次发布 commit）：`d9e999f`
- 本次区间：`d9e999f..HEAD` + 当前工作区未提交变更（发布候选）
- 提交摘要（已入库）：
  - `7f6be62 docs: require English commit messages`
  - `43e55fb docs: add verification gates and release record`
- 关键文件范围（本次候选）：
  - `features/wallet/hooks/useWalletData.ts`
  - `features/wallet/components/WalletDashboard.tsx`
  - `features/wallet/components/SendForm.tsx`
  - `services/tronService.ts`
  - `package.json`
  - `locales/en/index.ts`
  - `locales/zh-SG/index.ts`

### 关键新增功能说明（面向用户/产品）
- 节点切换体验升级：目标节点有历史数据时显示旧值并标记更新中；无历史数据时显示占位态，避免把“未知”误显示为 `0`。
- 首页定位升级：产品文案从性能导向切换为隐私导向，强调“以隐私为默认”。

### 致命 bug 修复说明（最近提交/候选）
- Bug 1：切换节点时余额先归零再恢复，造成资产感知抖动与误判。
  - 现象/影响：用户在节点切换瞬间看到错误的 `0` 余额，误以为资产丢失。
  - 触发条件：目标节点尚未返回余额数据或请求失败。
  - 修复方式：引入节点级缓存与同步状态，失败时不再把请求异常伪装成 `0`，改为“更新中/更新失败请刷新”。
  - 回归测试：`tests/ui/wallet-dashboard.test.tsx`、`tests/ui/send-form.test.tsx`、`tests/unit/tronService.test.ts`

---

## 发布模板（复制后填写）

### vX.Y.Z（Beta/GA）
- 发布时间：YYYY-MM-DD HH:mm（本地时区）
- 发布 commit：`<git rev-parse HEAD>`
- 版本号变更：vA.B.C -> vX.Y.Z

#### 代码级变更范围（自上次发布以来）
- 基准（上次发布 commit）：`<prev_release_commit>`
- 本次区间：`<prev_release_commit>.. <release_commit>`
- 提交摘要（示例）：`git log --oneline <prev>..<release>`
  - `<commit> <message>`

#### 关键新增功能说明（面向用户/产品）
- 功能 1：一句话说明价值与影响面
- 功能 2：一句话说明价值与影响面

#### 致命 bug 修复说明（最近提交）
- Bug 1：
  - 现象/影响：
  - 触发条件：
  - 修复方式：
  - 回归测试：`<test name / file>`（如无自动化需写豁免原因与补测计划）
