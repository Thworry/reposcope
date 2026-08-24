# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** through [GitHub private vulnerability reporting](https://github.com/Thworry/reposcope/security/advisories/new). Do not open a public issue before a fix or disclosure plan is ready.

Include the affected version or commit, browser, reproduction conditions, impact, and the smallest safe description needed to investigate. Do not include real credentials, tokens, private repository source, personal data, or destructive payloads. You may use synthetic data.

The maintainer will acknowledge a report when practical, assess it, coordinate remediation and disclosure, and credit the reporter if requested and appropriate. Please allow time for investigation before public discussion. This project does not promise a bounty or a fixed response deadline.

## Supported version

Security fixes target the current code on `main` and the latest public release. Older releases may not receive backports.

## Security scope

Relevant issues include bypasses of the fixed GitHub/API-origin boundary, remote-content execution or HTML injection, unexpected persistence of raw source, cache validation failures that cross repository boundaries, CSP regressions, or disclosure of data not described in the privacy contract.

For the optional expert service, relevant issues also include OAuth state or CSRF bypass, session fixation or token disclosure, access beyond public repositories or the documented no-scope authorization, cross-session stream/result confusion, unsafe Copilot tool or plugin availability, prompt-injection acceptance, fabricated evidence/alternatives, sensitive model/cache logging, unbounded retention, and sign-out or shutdown failing to cancel a run. Reports should use synthetic values and must never include a real OAuth token, client secret, model transcript, or private repository body.

The deterministic static report needs no login, GitHub token, backend, or AI service. Optional expert mode does use a TypeScript API, a no-scope GitHub OAuth App, the visitor's in-memory token and GitHub Copilot allowance, and bounded SQLite caches; GitHub Models is not used. The exact token, cache, model, and operator boundaries are documented in [docs/deep-analysis-deployment.md](docs/deep-analysis-deployment.md).

RepoScope is not itself a security scanner. A RepoScope report does not establish that the inspected project, its dependencies, or its deployment is vulnerability-free or safe.

安全问题请使用上面的 GitHub 私密漏洞报告入口，不要在公开 Issue 中提交漏洞细节、密钥、私有源代码或个人信息。
