import { describe, expect, it, vi } from "vitest";

import {
  DEEP_ANALYSIS_REQUEST_FIXTURE,
  DEEP_REPORT_FIXTURE,
} from "../../test/fixtures/deep-analysis";
import {
  DeepAnalysisClientError,
  getDeepSession,
  runDeepAnalysis,
  signOutDeepSession,
  startGitHubAuthorization,
  type DeepFetch,
} from "./client";
import { DEEP_STAGES, type DeepAnalysisEvent } from "./model";

const API_ORIGIN = new URL("https://api.example.test/");
const READY_SESSION = { status: "ready", csrfToken: "csrf-token" } as const;

function eventSequence(report = DEEP_REPORT_FIXTURE): DeepAnalysisEvent[] {
  return [
    { type: "stage", stage: "preparing-evidence" },
    { type: "stage", stage: "consulting-specialists" },
    { type: "specialist", role: "product", status: "started" },
    { type: "specialist", role: "onboarding-architecture", status: "started" },
    { type: "specialist", role: "trust-ecosystem", status: "started" },
    { type: "specialist", role: "product", status: "complete" },
    {
      type: "specialist",
      role: "onboarding-architecture",
      status: "complete",
    },
    { type: "specialist", role: "trust-ecosystem", status: "complete" },
    { type: "stage", stage: "challenging-findings" },
    { type: "stage", stage: "editing-briefing" },
    { type: "stage", stage: "validating-sources" },
    { type: "complete", report },
  ];
}

function ndjson(events: readonly unknown[], finalNewline = true): Uint8Array {
  return new TextEncoder().encode(
    `${events.map((event) => JSON.stringify(event)).join("\n")}${
      finalNewline ? "\n" : ""
    }`,
  );
}

function streamResponse(
  chunks: readonly Uint8Array[],
  cancel = vi.fn(),
  keepOpen = false,
): { response: Response; cancel: typeof cancel } {
  let index = 0;
  return {
    response: new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks[index];
          if (chunk === undefined) {
            if (!keepOpen) controller.close();
          } else {
            index += 1;
            controller.enqueue(chunk);
          }
        },
        cancel,
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    ),
    cancel,
  };
}

function fetchResponse(response: Response): DeepFetch {
  return vi.fn<DeepFetch>().mockResolvedValue(response);
}

describe("deep-analysis session client", () => {
  it("uses the exact session endpoint, credentials, and no-store", async () => {
    const fetchMock = fetchResponse(
      new Response(JSON.stringify(READY_SESSION), { status: 200 }),
    );
    await expect(
      getDeepSession({ apiOrigin: API_ORIGIN, fetch: fetchMock }),
    ).resolves.toEqual(READY_SESSION);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/session"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
    );
  });

  it.each([
    [{ status: "disabled" }, { status: "disabled" }],
    [{ status: "signed-out" }, { status: "signed-out" }],
  ])("accepts exact non-ready session %j", async (body, expected) => {
    await expect(
      getDeepSession({
        apiOrigin: API_ORIGIN,
        fetch: fetchResponse(new Response(JSON.stringify(body))),
      }),
    ).resolves.toEqual(expected);
  });

  it("rejects inherited, unknown, and malformed session fields", async () => {
    for (const body of [
      { status: "ready", csrfToken: "x", token: "secret" },
      { status: "ready", csrfToken: "" },
      { status: "disabled", extra: true },
    ]) {
      await expect(
        getDeepSession({
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(new Response(JSON.stringify(body))),
        }),
      ).rejects.toMatchObject({ kind: "internal" });
    }
  });

  it("preserves BASE_URL and the share query in the authorization returnTo", () => {
    const navigate = vi.fn();
    startGitHubAuthorization({
      apiOrigin: API_ORIGIN,
      baseUrl: "/reposcope/",
      search: "?repo=owner%2Frepo",
      navigate,
    });
    const target = new URL(String(navigate.mock.calls[0]?.[0]));
    expect(`${target.origin}${target.pathname}`).toBe(
      "https://api.example.test/api/v1/auth/start",
    );
    expect(target.searchParams.get("returnTo")).toBe(
      "/reposcope/?repo=owner%2Frepo",
    );
    expect([...target.searchParams.keys()]).toEqual(["returnTo"]);
  });

  it("posts only the exact CSRF header and requires 204 on sign-out", async () => {
    const fetchMock = fetchResponse(new Response(null, { status: 204 }));
    await signOutDeepSession(READY_SESSION, {
      apiOrigin: API_ORIGIN,
      fetch: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/sign-out"),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "X-RepoScope-CSRF": "csrf-token" },
      },
    );
    await expect(
      signOutDeepSession(READY_SESSION, {
        apiOrigin: API_ORIGIN,
        fetch: fetchResponse(new Response("", { status: 200 })),
      }),
    ).rejects.toBeInstanceOf(DeepAnalysisClientError);
  });
});

describe("runDeepAnalysis", () => {
  it("decodes split UTF-8, multiple lines per chunk, and EOF without newline", async () => {
    const report = structuredClone(DEEP_REPORT_FIXTURE);
    const summary = report.orientation.summary[0];
    if (summary === undefined) throw new Error("fixture summary is missing");
    summary.text = "严格的中文证据";
    const bytes = ndjson(eventSequence(report), false);
    const chinese = new TextEncoder().encode("中");
    const splitAt = bytes.findIndex(
      (byte, index) =>
        byte === chinese[0] &&
        bytes[index + 1] === chinese[1] &&
        bytes[index + 2] === chinese[2],
    );
    const chunks = [
      bytes.slice(0, 25),
      bytes.slice(25, splitAt + 1),
      bytes.slice(splitAt + 1),
    ];
    const events: DeepAnalysisEvent[] = [];
    const result = await runDeepAnalysis(
      DEEP_ANALYSIS_REQUEST_FIXTURE,
      READY_SESSION,
      (event) => events.push(event),
      {
        apiOrigin: API_ORIGIN,
        fetch: fetchResponse(streamResponse(chunks).response),
      },
    );
    expect(result).toEqual(report);
    expect(events.filter((event) => event.type === "stage")).toHaveLength(5);
    expect(events.filter((event) => event.type === "specialist")).toHaveLength(
      6,
    );
    expect(events.at(-1)?.type).toBe("complete");
  });

  it("posts the exact request with credentials, CSRF, no-store, and signal", async () => {
    const fetchMock = fetchResponse(
      streamResponse([ndjson(eventSequence())]).response,
    );
    const signal = new AbortController().signal;
    await runDeepAnalysis(
      DEEP_ANALYSIS_REQUEST_FIXTURE,
      READY_SESSION,
      () => undefined,
      { apiOrigin: API_ORIGIN, fetch: fetchMock, signal },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/deep-analysis"),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal,
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
          "X-RepoScope-CSRF": "csrf-token",
        },
        body: JSON.stringify(DEEP_ANALYSIS_REQUEST_FIXTURE),
      },
    );
  });

  it.each([
    ["stage regression", [{ type: "stage", stage: DEEP_STAGES[1] }]],
    [
      "unknown keys",
      [{ type: "stage", stage: DEEP_STAGES[0], unexpected: true }],
    ],
    ["duplicate terminals", [...eventSequence(), eventSequence().at(-1)]],
  ])("cancels a stream with %s", async (_label, events) => {
    const streamed = streamResponse([ndjson(events)], vi.fn(), true);
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(streamed.response),
        },
      ),
    ).rejects.toMatchObject({ kind: "invalid-evidence" });
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it("does not publish a complete report until the entire stream is valid", async () => {
    const events = eventSequence();
    const emitted: DeepAnalysisEvent[] = [];
    const streamed = streamResponse(
      [ndjson([...events, events.at(-1)])],
      vi.fn(),
      true,
    );

    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        (event) => emitted.push(event),
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(streamed.response),
        },
      ),
    ).rejects.toMatchObject({ kind: "invalid-evidence" });

    expect(emitted.some((event) => event.type === "complete")).toBe(false);
  });

  it("fatally rejects invalid UTF-8 and cancels the reader", async () => {
    const streamed = streamResponse(
      [new Uint8Array([0xc3, 0x28, 0x0a])],
      vi.fn(),
      true,
    );
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(streamed.response),
        },
      ),
    ).rejects.toMatchObject({ kind: "invalid-evidence" });
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it("maps a stream transport failure to a local error without reflecting it", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("gho_provider-secret"));
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
    const promise = runDeepAnalysis(
      DEEP_ANALYSIS_REQUEST_FIXTURE,
      READY_SESSION,
      () => undefined,
      { apiOrigin: API_ORIGIN, fetch: fetchResponse(response) },
    );

    await expect(promise).rejects.toMatchObject({ kind: "invalid-evidence" });
    await expect(promise).rejects.not.toThrow(/gho_/u);
  });

  it("cancels an in-flight reader when the caller aborts", async () => {
    const streamed = streamResponse(
      [ndjson([{ type: "stage", stage: "preparing-evidence" }])],
      vi.fn(),
      true,
    );
    const controller = new AbortController();
    const emitted: DeepAnalysisEvent[] = [];
    const promise = runDeepAnalysis(
      DEEP_ANALYSIS_REQUEST_FIXTURE,
      READY_SESSION,
      (event) => emitted.push(event),
      {
        apiOrigin: API_ORIGIN,
        fetch: fetchResponse(streamed.response),
        signal: controller.signal,
      },
    );
    await vi.waitFor(() => {
      expect(emitted).toHaveLength(1);
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ kind: "cancelled" });
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it("caps both a partial line and the total response at 2 MiB", async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1).fill(0x20);
    const streamed = streamResponse([oversized], vi.fn(), true);
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(streamed.response),
        },
      ),
    ).rejects.toMatchObject({ kind: "invalid-evidence" });
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "signed-out"],
    [409, "rate-limit"],
    [412, "repository-changed"],
    [422, "invalid-evidence"],
    [502, "github-unavailable"],
    [503, "copilot-unavailable"],
    [500, "internal"],
  ])("maps HTTP %i to %s without reading its body", async (status, kind) => {
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(new Response("provider text", { status })),
        },
      ),
    ).rejects.toMatchObject({ kind });
  });

  it("maps terminal errors and caller cancellation to local kinds", async () => {
    const terminal = streamResponse([
      ndjson([{ type: "error", error: { kind: "allowance-exhausted" } }]),
    ]);
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        {
          apiOrigin: API_ORIGIN,
          fetch: fetchResponse(terminal.response),
        },
      ),
    ).rejects.toMatchObject({ kind: "allowance-exhausted" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      runDeepAnalysis(
        DEEP_ANALYSIS_REQUEST_FIXTURE,
        READY_SESSION,
        () => undefined,
        { apiOrigin: API_ORIGIN, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ kind: "cancelled" });
  });
});
