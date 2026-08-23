# RepoScope 项目透视

[English](README.md)

RepoScope 帮助人们在投入时间前快速理解陌生的公开 GitHub 仓库。它的中英双语确定性模式会在访问者设备的 Web Worker 中解读 README、项目适用性、整体架构、上手路径、风险、维护状态、替代方案和对应证据。若部署者另外启用了专家模式，用户还可在明确授权后获得更深入的 GitHub Copilot 解读；它不会替代确定性报告。

**在线站点：** <https://thworry.github.io/reposcope/>

RepoScope 是证据检查工具，不是项目裁决工具。它不会运行仓库、证明功能正确、测量运行时测试覆盖率、开展安全审计、发现漏洞，也不会证明软件可以安全使用。

## 使用

1. 打开 [RepoScope 在线站点](https://thworry.github.io/reposcope/)。
2. 粘贴一个形如 `https://github.com/owner/repository` 的公开仓库地址。
3. 选择“**分析项目**”。RepoScope 每次只处理一个仓库。
4. 先查看 README 优先证据档案。仅在需要总分、可信度、六个评分维度、优点、改进项、检查范围和规则证据时，再打开默认关闭的“**技术证据与方法**”。
5. 若站点部署者已配置专家模式，可选择“**生成专家解读**”，阅读说明并授权 RepoScope GitHub OAuth App。此步骤完全可选；跳过或失败都不影响确定性报告。
6. 使用“**English / 简体中文**”切换界面语言。切换语言不会重新获取确定性数据或重新计算分数。

报告成功后，共享地址中只包含仓库标识。每次全新扫描会发出恰好三个无需认证的只读 GitHub REST 请求，然后从固定到被检查提交的不可变原始文件地址中进行有界读取。

通用检查适用于任何语言的仓库。JavaScript、TypeScript 和 Python 支持深入静态指标。如果受支持的源代码没有达到适用性门槛，可读性和复杂度将显示为不可用，总体结果会标记为“**仅通用检查**”和“**初步结果**”。

对于任何被检查的公开仓库，确定性的读者报告会区分用途证据与项目类型证据。用途证据来自公开 GitHub 仓库说明和首选 README。项目类型证据来自对清单、主题和仓库文件树的有界结构检查。证据链接固定到被检查的提交，仓库作者提供的用途文字保留源语言。这份确定性报告不使用 AI 服务，也不是个性化建议：它不会推测私人需求，也不会声称某个仓库适合特定用户。

请参阅完整的 [规则集 `1.0.0` 方法说明](docs/methodology.md)、[架构与威胁边界](docs/architecture.md)以及[版本历史](CHANGELOG.md)。

## README 优先证据档案

完成的报告会先展示一个由七个区域组成的 README 优先证据档案，让读者在查看分数前先理解项目文档如何介绍自己，以及仓库公开证据能够确认什么：

1. **项目定位**：展示公开仓库说明和有界的项目简介；
2. **社区与维护事实**：Stars、Watch、Forks、开放 Issue、最后推送时间和许可证；
3. **README 如何介绍项目**：按原始语言组织 README 的概览、目标读者、待解决问题、使用场景、依赖、限制和成熟度说明；
4. **核心能力**：按 README 原有主题分组的能力说明；
5. **README 中的工作流程**：按文档顺序展示、即使没有连接线也能理解的步骤；
6. **README 声明与仓库观察**：并列展示 README 中的声明和仓库树中观察到的广义项目类型、技术生态与源代码区域；
7. **RepoScope 解读**：以“**值得注意**”“**依赖前需要核实**”和“**对实际使用意味着什么**”区分文档信号、未知项和使用影响。

GitHub 的 `stargazers_count`、`subscribers_count` 和 `forks_count` 分别提供 Stars、Watch 和 Forks；`subscribers_count` 标记为 **Watch**。这些数字反映公开关注程度。流行度不能证明项目质量或安全性。

仓库作者提供的文字保持原始语言；切换 RepoScope 界面语言不会翻译、改写或重新获取这些内容。README 提取与完整的确定性扫描不使用 AI。若首选 README 不存在，档案会明确显示不可用；若树中已识别首选 README 但未能获取，README 解读会标记为部分可用，而不会用其他文件冒充完整证据。可选专家模式是另一个有明确标识的解读层，绝不会修改这些确定性事实或评分。

证据档案之后是项目决策摘要，以及六个带编号、证据链接的章节：

1. 项目适用性注意事项；
2. 可靠性证据；
3. 核心原理与整体架构；
4. 如何安装、运行、测试和二次开发；
5. 安全与隐私风险及未知项；
6. 项目活跃度、维护状况与替代方案。

证据状态只会是“**有较充分证据，可以继续评估**”“**存在关键缺口，使用前需要核实**”或“**公开证据不足，无法判断**”。这些状态是根据已检查公开证据得出的确定性、非评分摘要，不代表项目一定适用、正确、安全、合规或可以放心使用。

仓库文档中的命令只会作为不可执行文本显示，RepoScope 绝不会运行它们；标记为需要复核的命令应先检查再复制。来源说明只链接到不可变的被检查提交。GitHub 替代项目搜索只是起点，比较候选项目时仍应使用同一套证据检查。“**技术证据与方法**”附录保留评分报告和详细方法，默认关闭；打开或关闭它不会重新获取仓库数据，也不会重新计算报告。

## 可选专家解读

若部署者已配置专家模式，RepoScope 可以把选定的公开证据整理成更深入、真正给人读的第二意见。三位专项专家分别负责产品适用性与业务场景、上手与整体架构、可信度与生态；随后由质疑者挑战缺乏证据的说法，再由主编整理为十个带证据链接的章节。报告重点是项目做什么、适合谁、如何开始、还有哪些未知、安全与隐私注意事项、维护信号以及为何值得比较某个替代方案，而不是逐个函数点评代码。

专家模式首次使用前必须明确同意，并通过不申请任何 scope 的 RepoScope GitHub OAuth App 授权。服务使用访问者短期保存在内存中的 GitHub 令牌和访问者自己的 GitHub Copilot 额度；不使用 GitHub Models，也没有项目自有的模型凭据。选定的公开 README、文档、清单、文件树、发布/活跃度和替代方案证据会发送给没有工具、插件、仓库工作区或命令执行能力的 Copilot 会话。仓库代码和命令始终是不可信文本，绝不会被执行。

每条模型可见陈述都必须引用已接纳证据。RepoScope 会拒绝未知引用、虚构替代方案、混入叙事的实时热度数字、危险命令建议以及没有依据的安全或隐私保证。Stars、Watch、Forks、Issue、推送时间、归档状态和许可证由服务端在模型输出验证后重新获取并注入。专家结果覆盖不完整或运行失败时，确定性报告仍会保留。

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

确定性静态模式不需要登录、GitHub 令牌、账户、后端、数据库、分析统计、广告或 AI 服务。公开仓库数据只在访问者浏览器和 GitHub 之间直接传输，分析使用访问者设备的算力。

仓库源代码始终被视为不可信文本。RepoScope 不会执行、导入、求值或以 HTML 形式渲染它。原始源代码正文和 GitHub 原始响应不会被持久化。经过验证的最终报告和规范化公开元数据可在 `sessionStorage` 中缓存 15 分钟；唯一持久保存的偏好是本地存储中的 `en` 或 `zh-CN`。

可选专家模式会增加 TypeScript 后端、GitHub 授权、GitHub Copilot 处理和有界 SQLite 缓存。OAuth 令牌只会在不透明、`HttpOnly` 的内存会话中保存，最长为空闲八小时，并在退出或服务重启时删除。经过验证的公开证据解读最多缓存 30 天，公开替代方案列表最多缓存 24 小时。原始 README 正文、源代码、模型会话记录、提示词、令牌、实时热度数字和私有仓库都不会被存储。详见[部署与数据流约定](docs/deep-analysis-deployment.md)。

## 安装并在本地运行

使用[在线站点](https://thworry.github.io/reposcope/)无需安装，并且仍然不需要 GitHub 令牌。贡献者的本地环境需要 Node.js 24.x 和 pnpm 11.16.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

随后打开 <http://localhost:5173/>。Vite 开发服务器仅供本地使用，不得将它作为公开应用部署。

默认本地构建会关闭专家模式。如需运行可选 API，请创建一个不申请 scope 的 GitHub OAuth App，按 [docs/deep-analysis-deployment.md](docs/deep-analysis-deployment.md) 配置严格的同站环境，并在另一个进程运行 `pnpm server:dev`。不得把 OAuth 密钥或用户 GitHub 令牌放进前端环境变量。

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
- `src/features/deep-analysis`：负责可选浏览器客户端、流协议校验和独立 React 状态；
- `src/components`、`i18n` 和 `styles`：负责中英双语报告体验；
- `server/github`、`evidence`、`panel`、`cache` 和 `deep-analysis`：负责授权后的证据获取、零工具 Copilot 专家组、严格验证与有界保留；
- `e2e` 和就近放置的测试：提供确定性的浏览器和模块证据；
- `.github/workflows`：负责 CI 和 GitHub Pages 部署。

详细数据流、固定端点、缓存策略、CSP 和威胁模型见 [docs/architecture.md](docs/architecture.md)。

## 部署

推送到 `main` 后会运行 CI 和使用固定版本依赖的 GitHub Pages 工作流。未设置 `REPOSCOPE_API_ORIGIN` 时，Pages 产物是通过 `REPOSCOPE_BASE_PATH=/<repository-name>/` 构建的 Vite 静态站点；部署使用 GitHub Actions，不需要运行时密钥。

在本地构建子路径版本：

```sh
REPOSCOPE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
```

专家模式是独立的可选部署：在同站自定义 API 域名上运行仓库提供的非 root 容器，把 SQLite 路径挂载到持久卷，把 OAuth 凭据保存在托管平台的密钥存储中，并把非敏感的 Pages 变量 `REPOSCOPE_API_ORIGIN` 设为该 HTTPS 源。公开启用前必须严格遵循[专家模式部署指南](docs/deep-analysis-deployment.md)并完成人工质量门禁。

不要部署开发服务器；如需增加其他令牌输入、代理、分析端点、模型提供方或远程运行时资源，必须先通过架构、安全、隐私、方法说明和双语文案评审。

## 参与贡献

欢迎提交 Issue 和 Pull Request。影响规则、阈值、限制、报告含义或应用自有文案的修改，必须同步更新测试以及对应的中英文文档或方法说明。安全问题请使用私密漏洞报告；不要在公开 Issue 中放入密钥或敏感数据。

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[SUPPORT.md](SUPPORT.md)、[GOVERNANCE.md](GOVERNANCE.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

RepoScope 使用 [MIT 许可证](LICENSE)发布。
