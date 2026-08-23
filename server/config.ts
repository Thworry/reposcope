export type ServerEnvironment = "development" | "test" | "production";

export interface ServerConfig {
  readonly environment: ServerEnvironment;
  readonly host: string;
  readonly port: number;
  readonly frontendBaseUrl: string;
  readonly frontendOrigin: string;
  readonly apiOrigin: string;
  readonly cachePath: string;
  readonly githubClientId: string | null;
  readonly githubClientSecret: string | null;
  readonly githubCallbackUrl: string | null;
  readonly sessionIdleMs: number;
  readonly deepAnalysisEnabled: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

const DEFAULT_FRONTEND_URL = "http://127.0.0.1:5173/";
const DEFAULT_API_ORIGIN = "http://127.0.0.1:8787";
const DEFAULT_CACHE_PATH = ".data/deep-reports.sqlite";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8_787;
const SESSION_IDLE_MS = 8 * 60 * 60 * 1_000;
const OAUTH_CALLBACK_PATH = "/api/v1/auth/callback";

const MULTI_TENANT_SITE_SUFFIXES = Object.freeze([
  "github.io",
  "pages.dev",
  "vercel.app",
  "netlify.app",
]);

function readEnvironment(value: string | undefined): ServerEnvironment {
  const environment = value ?? "development";
  if (
    environment !== "development" &&
    environment !== "test" &&
    environment !== "production"
  ) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  return environment;
}

function readOptional(value: string | undefined, name: string): string | null {
  if (value === undefined || value === "") {
    return null;
  }
  if (value.trim() !== value) {
    throw new Error(`${name} must not contain surrounding whitespace`);
  }
  return value;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  if (!/^\d{1,5}$/u.test(value)) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }
  return port;
}

function parseHttpUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
}

function isCanonicalLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function requireHttpsOrLoopback(url: URL, name: string): void {
  if (url.protocol === "https:") {
    return;
  }
  if (url.protocol === "http:" && isCanonicalLoopback(url.hostname)) {
    return;
  }
  throw new Error(`${name} must use HTTPS unless it uses canonical loopback`);
}

function readFrontendBaseUrl(value: string | undefined): URL {
  const url = parseHttpUrl(
    value ?? DEFAULT_FRONTEND_URL,
    "REPOSCOPE_FRONTEND_URL",
  );
  requireHttpsOrLoopback(url, "REPOSCOPE_FRONTEND_URL");
  if (url.search !== "" || url.hash !== "") {
    throw new Error(
      "REPOSCOPE_FRONTEND_URL must not contain a query or fragment",
    );
  }
  if (!url.pathname.endsWith("/")) {
    throw new Error("REPOSCOPE_FRONTEND_URL must end with a slash");
  }
  return url;
}

function readApiOrigin(value: string | undefined): URL {
  const url = parseHttpUrl(value ?? DEFAULT_API_ORIGIN, "REPOSCOPE_API_ORIGIN");
  requireHttpsOrLoopback(url, "REPOSCOPE_API_ORIGIN");
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("REPOSCOPE_API_ORIGIN must contain an origin only");
  }
  return url;
}

function readCallbackUrl(
  value: string | null,
  apiOrigin: string,
): string | null {
  if (value === null) {
    return null;
  }
  const url = parseHttpUrl(value, "REPOSCOPE_GITHUB_CALLBACK_URL");
  requireHttpsOrLoopback(url, "REPOSCOPE_GITHUB_CALLBACK_URL");
  if (
    url.origin !== apiOrigin ||
    url.pathname !== OAUTH_CALLBACK_PATH ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `REPOSCOPE_GITHUB_CALLBACK_URL must be ${apiOrigin}${OAUTH_CALLBACK_PATH}`,
    );
  }
  return url.href;
}

function isMultiTenantSite(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return MULTI_TENANT_SITE_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function isSupportedSameSite(frontend: URL, api: URL): boolean {
  const frontendHostname = frontend.hostname.toLowerCase();
  const apiHostname = api.hostname.toLowerCase();
  return (
    frontend.protocol === api.protocol &&
    !isMultiTenantSite(frontendHostname) &&
    !isMultiTenantSite(apiHostname) &&
    (frontendHostname === apiHostname ||
      apiHostname === `api.${frontendHostname}`)
  );
}

export function readServerConfig(env: Environment): ServerConfig {
  const environment = readEnvironment(env.NODE_ENV);
  const frontendUrl = readFrontendBaseUrl(env.REPOSCOPE_FRONTEND_URL);
  const apiUrl = readApiOrigin(env.REPOSCOPE_API_ORIGIN);
  const githubClientId = readOptional(
    env.REPOSCOPE_GITHUB_CLIENT_ID,
    "REPOSCOPE_GITHUB_CLIENT_ID",
  );
  const githubClientSecret = readOptional(
    env.REPOSCOPE_GITHUB_CLIENT_SECRET,
    "REPOSCOPE_GITHUB_CLIENT_SECRET",
  );
  const githubCallbackUrl = readCallbackUrl(
    readOptional(
      env.REPOSCOPE_GITHUB_CALLBACK_URL,
      "REPOSCOPE_GITHUB_CALLBACK_URL",
    ),
    apiUrl.origin,
  );
  const githubValueCount = [
    githubClientId,
    githubClientSecret,
    githubCallbackUrl,
  ].filter((value) => value !== null).length;
  const deepAnalysisEnabled = githubValueCount === 3;

  if (
    environment === "production" &&
    githubValueCount !== 0 &&
    !deepAnalysisEnabled
  ) {
    throw new Error(
      "Production requires all GitHub OAuth App values or none of them",
    );
  }
  if (
    environment === "production" &&
    deepAnalysisEnabled &&
    !isSupportedSameSite(frontendUrl, apiUrl)
  ) {
    throw new Error(
      "Production expert mode requires same-site custom domains; cross-site third-party cookies are unsupported",
    );
  }

  const host = readOptional(env.REPOSCOPE_HOST ?? env.HOST, "REPOSCOPE_HOST");
  const cachePath = readOptional(
    env.REPOSCOPE_CACHE_PATH,
    "REPOSCOPE_CACHE_PATH",
  );

  return Object.freeze({
    environment,
    host: host ?? DEFAULT_HOST,
    port: readPort(env.REPOSCOPE_PORT ?? env.PORT),
    frontendBaseUrl: frontendUrl.href,
    frontendOrigin: frontendUrl.origin,
    apiOrigin: apiUrl.origin,
    cachePath: cachePath ?? DEFAULT_CACHE_PATH,
    githubClientId,
    githubClientSecret,
    githubCallbackUrl,
    sessionIdleMs: SESSION_IDLE_MS,
    deepAnalysisEnabled,
  });
}
