# Optional expert-analysis deployment

RepoScope has two deliberately separate modes. The deterministic browser report
remains a static GitHub Pages application and needs no login, GitHub token,
backend, or AI service. The optional expert briefing needs this TypeScript API,
a GitHub OAuth App, and the visitor's own GitHub Copilot entitlement. GitHub
Models is not used.

Source builds do not create an OAuth App, client secret, DNS record, TLS
certificate, container host, or user entitlement. Those are external deployment
operations owned by the operator.

## Trust and data flow

1. The browser first creates the unchanged deterministic report from public
   GitHub data. Repository code is treated as untrusted text and is never run,
   installed, imported, evaluated, or rendered as HTML.
2. After explicit consent, the browser redirects to a GitHub OAuth App that asks
   for no scopes and therefore does not request private-repository access.
3. The API keeps the returned `gho_…` token only in an in-memory, opaque,
   `HttpOnly` session for up to eight idle hours. It is never written to SQLite,
   browser storage, a URL, or an application log.
4. For one already-inspected public commit, the API fetches a bounded README,
   recognized manifests and conventional documentation, release/activity facts,
   and a small public alternative shortlist. Selected public evidence is sent to
   isolated GitHub Copilot SDK sessions with no tools, plugins, repository working
   tree, or command execution capability.
5. Three specialists, one skeptic, and one editor produce strict JSON. RepoScope
   accepts only cited, bounded output that passes schema, provenance, hostile-text,
   security-language, and live-metric checks. Exact Stars, Watch, Forks, issues,
   push time, archive state, and license are joined by the server after validation.
6. A validated narrative may be cached for 30 days by repository commit,
   evidence schema, prompt version, language, and model capability class. A public
   alternative shortlist may be cached for 24 hours. Raw README bodies, model
   transcripts, prompts, tokens, sessions, and live popularity counts are not
   stored in the narrative cache. Cache rows have strict size, count, aggregate,
   TTL, and LRU limits.

Signing out deletes the in-memory session, aborts its active run, and clears its
in-process start allowance. An unavailable API, OAuth denial, exhausted Copilot
allowance, invalid model output, or stream failure leaves the deterministic
browser report intact.

## 1. Create the GitHub OAuth App

In the GitHub account or organization that will operate the service, create one
OAuth App with:

- **Homepage URL:** the exact public frontend URL, including the RepoScope base
  path when applicable;
- **Authorization callback URL:**
  `https://api.example.com/api/v1/auth/callback`; and
- no requested OAuth scopes. Do not add `repo`, `read:user`, organization, or
  private-repository permissions.

Record the client ID and client secret in the deployment platform's secret
store. Do not put either value in this repository, a Pages variable, a browser
build, an image layer, a command example, or a log.

## 2. Use a same-site custom-domain pair

Production expert mode intentionally rejects common multi-tenant pairs such as
`github.io`, `pages.dev`, `vercel.app`, and `netlify.app`. Use HTTPS custom domains
where the API hostname is either the frontend hostname or its `api.` child, for
example:

- frontend: `https://reposcope.example.com/reposcope/`
- API origin: `https://api.reposcope.example.com`
- callback: `https://api.reposcope.example.com/api/v1/auth/callback`

The protocols must match. The frontend URL must end in `/` and may contain a
base path; the API value must be an origin only. This same-site requirement keeps
the `Secure`, `HttpOnly`, `SameSite=Lax` session independent of third-party cookie
exceptions.

## 3. Configure and run the API

The container listens on port 8787, runs as UID/GID 10001, keeps application
files read-only, and writes only the SQLite cache volume and temporary Copilot
workspaces. Mount a persistent volume at `/data`.

Required to enable expert mode:

| Variable                         | Exact purpose                                           |
| -------------------------------- | ------------------------------------------------------- |
| `NODE_ENV`                       | Use `production` for public deployment.                 |
| `REPOSCOPE_FRONTEND_URL`         | Exact HTTPS frontend base URL, slash-terminated.        |
| `REPOSCOPE_API_ORIGIN`           | Exact HTTPS API origin, with no path/query/fragment.    |
| `REPOSCOPE_GITHUB_CLIENT_ID`     | OAuth App client ID from the secret store.              |
| `REPOSCOPE_GITHUB_CLIENT_SECRET` | OAuth App client secret from the secret store.          |
| `REPOSCOPE_GITHUB_CALLBACK_URL`  | Exactly `${REPOSCOPE_API_ORIGIN}/api/v1/auth/callback`. |

Optional runtime settings:

| Variable               | Default                                                                                 | Constraint                       |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| `REPOSCOPE_HOST`       | `127.0.0.1` outside the image; `0.0.0.0` in the image                                   | Listening interface.             |
| `REPOSCOPE_PORT`       | `8787`                                                                                  | Integer from 1 through 65535.    |
| `REPOSCOPE_CACHE_PATH` | `.data/deep-reports.sqlite` outside the image; `/data/deep-reports.sqlite` in the image | Writable persistent SQLite path. |

`HOST` and `PORT` are accepted only as fallbacks for the two prefixed settings.
If none of the three OAuth values is present, the API starts safely with expert
mode disabled. In production, supplying only part of the OAuth configuration is
a startup error.

Build and run:

```sh
docker build -t reposcope-expert-panel:local .
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  -p 8787:8787 \
  -v reposcope-cache:/data \
  -e NODE_ENV=production \
  -e REPOSCOPE_FRONTEND_URL=https://reposcope.example.com/reposcope/ \
  -e REPOSCOPE_API_ORIGIN=https://api.reposcope.example.com \
  -e REPOSCOPE_GITHUB_CALLBACK_URL=https://api.reposcope.example.com/api/v1/auth/callback \
  -e REPOSCOPE_GITHUB_CLIENT_ID \
  -e REPOSCOPE_GITHUB_CLIENT_SECRET \
  reposcope-expert-panel:local
```

Pass secret values through the platform's protected environment or secret-file
mechanism. The variable-only `-e NAME` form above reads an already-exported local
value without placing that value in this document.

## 4. Build the frontend with the API origin

Set the GitHub repository variable `REPOSCOPE_API_ORIGIN` to the public HTTPS API
origin. It is an origin, not a secret. The Pages workflow injects it at build time
so the browser client and Content Security Policy share one validated source of
truth. Keep `REPOSCOPE_BASE_PATH=/<repository-name>/` for a project Pages site.

An unconfigured build omits the expert controls and preserves the fully static
mode. A configured build adds only the selected API origin to `connect-src`; it
does not contain the OAuth secret or a user token.

## 5. Verify a deployment

Verify in this order:

1. `GET /api/v1/health` returns `status: "ok"` and the intended expert-mode state.
2. `GET /api/v1/session` without a cookie returns `signed-out` (or `disabled` for
   the static fallback).
3. A callback with missing, duplicate, expired, or mismatched OAuth state is
   rejected and does not create a session.
4. Authorization returns to the exact frontend base path and share query; the
   ready session exposes only a CSRF value, never the GitHub token.
5. Generate one briefing for a public repository and confirm ordered progress,
   evidence links, exact current community counts, and deterministic-report
   independence.
6. Sign out, then confirm the session is gone and a running request is cancelled.
7. Remove the frontend API-origin variable and rebuild once to confirm the static
   fallback still works without the API.

Before enabling expert mode for the public, complete the dated two-reviewer gate
in [`evals/deep-analysis/rubric.md`](../evals/deep-analysis/rubric.md). Run
`pnpm gate:deep-analysis` with `REPOSCOPE_DEEP_ANALYSIS_SCORECARD` pointing to the
local redacted scorecard. With an absent or failing scorecard, expert deployment
remains blocked; this is not a failure of the deterministic static product.

## Credential incident response

If the OAuth client secret or deployment environment may have been exposed:

1. rotate the client secret in GitHub and the deployment secret store;
2. restart every API instance to clear all in-memory sessions and active runs;
3. verify that no old instance remains reachable;
4. inspect only metadata-level platform logs—never add token, prompt, README body,
   model output, or OAuth response logging; and
5. repeat the signed-out, state-rejection, authorization, one-public-repository,
   sign-out, and static-fallback checks above.
