# RepoScope 项目透视

[English](README.md)

RepoScope 为公开 GitHub 仓库生成可解释、确定性的质量报告。它检查文档与上手体验、可运行性证据、代码可读性、复杂度与结构、测试与自动化以及维护健康度。这个静态应用提供中英双语界面，并在访问者设备的 Web Worker 中完成分析。

**在线站点：** <https://thworry.github.io/reposcope/>

RepoScope 是证据检查工具，不是项目裁决工具。它不会运行仓库、证明功能正确、测量运行时测试覆盖率、开展安全审计、发现漏洞，也不会证明软件可以安全使用。

## 使用

1. 打开 [RepoScope 在线站点](https://thworry.github.io/reposcope/)。
2. 粘贴一个形如 `https://github.com/owner/repository` 的公开仓库地址。
3. 选择“**分析项目**”。RepoScope 每次只处理一个仓库。
4. 查看总分、可信度、六个维度、优点、改进项、检查范围以及带文件链接的证据。
5. 使用“**English / 简体中文**”切换界面语言。切换语言不会重新获取数据或重新计算分数。

报告成功后，共享地址中只包含仓库标识。每次全新扫描会发出恰好三个无需认证的只读 GitHub REST 请求，然后从固定到被检查提交的不可变原始文件地址中进行有界读取。

通用检查适用于任何语言的仓库。JavaScript、TypeScript 和 Python 支持深入静态指标。如果受支持的源代码没有达到适用性门槛，可读性和复杂度将显示为不可用，总体结果会标记为“**仅通用检查**”和“**初步结果**”。

请参阅完整的 [规则集 `1.0.0` 方法说明](docs/methodology.md)、[架构与威胁边界](docs/architecture.md)以及[版本历史](CHANGELOG.md)。

## 报告示例解读

以 `https://github.com/Thworry/reposcope` 为非规范性示例：RepoScope 首先把公开默认分支解析为一个提交，并将整份报告固定到这个不可变提交。总分汇总适用规则的结果；可信度说明公开文件树与合格证据被获取、解析得有多完整，它不是第二个质量分数。

六个维度应分别阅读：文档与上手体验、可运行性证据、代码可读性、复杂度与结构、测试与自动化、维护健康度。随后检查范围与失败项，了解文件树截断、跳过文件、获取失败、解析失败、不支持的源代码或触及限制等情况。改进项列表列出适用规则中的失分点，并在有证据时链接到对应文件。

证据链接采用不可变的 `blob/<commit>/path#Lx-Ly` 形式，因此即使默认分支移动，链接仍指向被检查的版本。仓库公开提交或所用规则集变化时，具体分数、可信度、发现和链接也会变化。RepoScope 只把仓库内容当作文本处理：它不会执行项目、认证项目行为，也不会证明项目正确、安全或可放心使用。

## 限制

每次扫描严格限制为：

- 最多选择 200 个文件，并对源代码、文档、清单和配置文件中的合格原始文本最多尝试获取 200 次；
- 解码文本总量最多 10 MiB；
- 每个合格的已获取文本文件最多 256 KiB，包括源代码、文档、清单和配置文本；
- 原始文件请求的并发数最多为六个；
- 每个原始文件的超时时间为 15 秒；
- 整个源文件获取阶段最多为 90 秒。

GitHub 还可能截断递归文件树，或限制未认证请求的频率。报告会明确显示抽样、跳过文件、失败、未支持源代码和触及限制的情况，并相应降低可信度。适用维度或证据覆盖范围不同的分数不应直接比较。

## 隐私

RepoScope 不需要登录、GitHub 令牌、账户、后端、数据库、分析统计、广告或 AI 服务。公开仓库数据只在访问者浏览器和 GitHub 之间直接传输。分析使用访问者设备的算力；发布者的个人电脑不提供扫描服务，也不参与分析，并且可以处于离线状态。

仓库源代码始终被视为不可信文本。RepoScope 不会执行、导入、求值或以 HTML 形式渲染它。原始源代码正文和 GitHub 原始响应不会被持久化。经过验证的最终报告和规范化公开元数据可在 `sessionStorage` 中缓存 15 分钟；唯一持久保存的偏好是本地存储中的 `en` 或 `zh-CN`。

## 安装并在本地运行

使用[在线站点](https://thworry.github.io/reposcope/)无需安装，并且仍然不需要 GitHub 令牌。贡献者的本地环境需要 Node.js 24.x 和 pnpm 11.16.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

随后打开 <http://localhost:5173/>。Vite 开发服务器仅供本地使用，不得将它作为公开应用部署。

## 开发

运行本地质量门禁：

```sh
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build
pnpm check:bundle
pnpm exec playwright test
pnpm check:lighthouse
```

自动化浏览器测试使用固定的 GitHub 测试数据，不会消耗真实 GitHub API 请求额度。提交修改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 架构

主要代码区域包括：

- `src/features/github`、`repository` 和 `scanner`：负责经过验证的数据获取和确定性文件选择；
- `src/features/analyzers`、`rules` 和 `worker`：负责有界静态分析与评分；
- `src/components`、`i18n` 和 `styles`：负责中英双语报告体验；
- `e2e` 和就近放置的测试：提供确定性的浏览器和模块证据；
- `.github/workflows`：负责 CI 和 GitHub Pages 部署。

详细数据流、固定端点、缓存策略、CSP 和威胁模型见 [docs/architecture.md](docs/architecture.md)。

## 部署

推送到 `main` 后会运行 CI 和使用固定版本依赖的 GitHub Pages 工作流。Pages 产物是通过 `REPOSCOPE_BASE_PATH=/<repository-name>/` 构建的 Vite 静态站点；部署使用 GitHub Actions，不需要运行时密钥。

在本地构建子路径版本：

```sh
REPOSCOPE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
```

不要部署开发服务器；如需增加令牌输入、代理、分析端点或远程运行时资源，必须先通过架构、安全、隐私、方法说明和双语文案评审。

## 参与贡献

欢迎提交 Issue 和 Pull Request。影响规则、阈值、限制、报告含义或应用自有文案的修改，必须同步更新测试以及对应的中英文文档或方法说明。安全问题请使用私密漏洞报告；不要在公开 Issue 中放入密钥或敏感数据。

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[SUPPORT.md](SUPPORT.md)、[GOVERNANCE.md](GOVERNANCE.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

RepoScope 使用 [MIT 许可证](LICENSE)发布。
