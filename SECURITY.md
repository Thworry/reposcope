# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** through [GitHub private vulnerability reporting](https://github.com/Thworry/reposcope/security/advisories/new). Do not open a public issue before a fix or disclosure plan is ready.

Include the affected version or commit, browser, reproduction conditions, impact, and the smallest safe description needed to investigate. Do not include real credentials, tokens, private repository source, personal data, or destructive payloads. You may use synthetic data.

The maintainer will acknowledge a report when practical, assess it, coordinate remediation and disclosure, and credit the reporter if requested and appropriate. Please allow time for investigation before public discussion. This project does not promise a bounty or a fixed response deadline.

## Supported version

Security fixes target the current code on `main` and the latest public release. Older releases may not receive backports.

## Security scope

Relevant issues include bypasses of the fixed GitHub-origin boundary, remote-content execution or HTML injection, unexpected persistence of raw source, cache validation failures that cross repository boundaries, CSP regressions, or disclosure of data not described in the privacy contract.

RepoScope is not itself a security scanner. A RepoScope report does not establish that the inspected project, its dependencies, or its deployment is vulnerability-free or safe.

安全问题请使用上面的 GitHub 私密漏洞报告入口，不要在公开 Issue 中提交漏洞细节、密钥、私有源代码或个人信息。
