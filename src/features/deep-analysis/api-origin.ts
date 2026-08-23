export type DeepAnalysisBuildMode = "development" | "production";

declare const __REPOSCOPE_API_ORIGIN__: string;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

function invalidOrigin(): never {
  throw new Error("REPOSCOPE_API_ORIGIN must be one exact HTTPS origin");
}

export function parseDeepAnalysisApiOrigin(
  value: string,
  _mode: DeepAnalysisBuildMode,
): URL | null {
  void _mode;
  if (value === "") return null;
  if (value.trim() !== value) invalidOrigin();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidOrigin();
  }

  if (
    parsed.hostname.includes("*") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return invalidOrigin();
  }

  const secure = parsed.protocol === "https:";
  const loopbackHttp =
    parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (!secure && !loopbackHttp) invalidOrigin();

  return new URL(`${parsed.origin}/`);
}

export function deepAnalysisApiOrigin(): URL | null {
  return parseDeepAnalysisApiOrigin(__REPOSCOPE_API_ORIGIN__, "production");
}
