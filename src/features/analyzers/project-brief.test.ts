import { describe, expect, it } from "vitest";

import type {
  FetchedTextFile,
  GeneralAnalysisInput,
  GeneralMetrics,
  ProjectBrief,
} from "../analysis/model";
import { PROJECT_BRIEF_CAUTIONS, PROJECT_KINDS } from "../analysis/model";
import { containsCredentialLikeValue } from "../analysis/project-brief-safety";
import {
  perfectGeneralMetrics,
  perfectRepository,
} from "../../test/fixtures/metrics";
import { analyzeGeneralRepository, preferredReadme } from "./general";
import { analyzeProjectBrief } from "./project-brief";

function fetched(path: string, text: string): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: path.endsWith(".ts") ? "typescript" : "none",
    category: /^readme/iu.test(path) ? "documentation" : "manifest",
    isTest: false,
  };
}

function inputWith(options: {
  description?: string | null;
  topics?: readonly string[];
  files?: readonly FetchedTextFile[];
  archived?: boolean;
  licenseSpdxId?: string | null;
}): GeneralAnalysisInput {
  const files = [...(options.files ?? [])];

  return {
    repository: {
      ...perfectRepository,
      description: options.description ?? null,
      topics: [...(options.topics ?? [])],
      archived: options.archived ?? false,
      licenseSpdxId: options.licenseSpdxId ?? "MIT",
    },
    tree: {
      complete: true,
      skippedEntries: [],
      files: files.map((file, index) => ({
        path: file.path,
        sha: index.toString(16).padStart(40, "a").slice(-40),
        size: file.declaredSize,
        mode: "100644" as const,
      })),
    },
    files,
  };
}

function briefFor(
  options: Parameters<typeof inputWith>[0],
  metrics: Partial<GeneralMetrics> = {},
): ProjectBrief {
  return analyzeProjectBrief(inputWith(options), {
    ...perfectGeneralMetrics,
    ...metrics,
  });
}

function rootReadmePath(length: number): string {
  const framing = "README-.md";

  return `README-${"a".repeat(length - framing.length)}.md`;
}

function nestedPackagePath(length: number): string {
  const suffix = "package.json";
  const prefixLength = length - suffix.length;
  const prefix =
    prefixLength % 2 === 0
      ? "a/".repeat(prefixLength / 2)
      : `ab/${"a/".repeat((prefixLength - 3) / 2)}`;

  return `${prefix}${suffix}`;
}

describe("project brief purpose extraction", () => {
  it("combines repository purpose and README overview without repeating them", () => {
    const input = inputWith({
      description: "A local-first CLI for comparing public API schemas.",
      topics: ["cli"],
      files: [
        fetched(
          "README.md",
          [
            "# Schema Lens",
            "",
            "[![build](https://img.example/badge.svg)](https://ci.example)",
            "",
            "## Overview",
            "",
            "Schema Lens compares two OpenAPI documents and reports breaking changes.",
            "",
            "It is intended for release checks and code review.",
          ].join("\n"),
        ),
        fetched(
          "package.json",
          JSON.stringify({ bin: { lens: "dist/cli.js" } }),
        ),
      ],
    });

    expect(analyzeProjectBrief(input, perfectGeneralMetrics)).toEqual({
      excerpts: [
        {
          source: "github-description",
          text: "A local-first CLI for comparing public API schemas.",
          path: null,
        },
        {
          source: "readme",
          text: "Schema Lens compares two OpenAPI documents and reports breaking changes.",
          path: "README.md",
        },
      ],
      kinds: [
        { kind: "command-line-tool", source: "manifest", path: "package.json" },
      ],
      cautions: [],
    });
  });

  it.each([
    ["## Overview\n\nA bounded English purpose.", "A bounded English purpose."],
    [
      "## 简介\n\n这是一个用于检查公开项目证据的浏览器工具。",
      "这是一个用于检查公开项目证据的浏览器工具。",
    ],
    [
      "# Title\n\nA useful lead paragraph after the title.",
      "A useful lead paragraph after the title.",
    ],
  ])("extracts overview prose from %s", (readme, expected) => {
    expect(
      briefFor({ files: [fetched("README.md", readme)] }).excerpts.map(
        (item) => item.text,
      ),
    ).toContain(expected);
  });

  it("prefers explicit overview prose and keeps visible link labels only", () => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "# Tool",
            "",
            "A generic lead that must lose to the overview.",
            "",
            "## About",
            "",
            "[Schema Lens](https://example.invalid/private?token=secret) compares schemas.",
            "",
            "It reports changes without following [remote links][docs].",
            "",
            "[docs]: https://example.invalid/docs",
          ].join("\n"),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Schema Lens compares schemas.",
        path: "README.md",
      },
      {
        source: "readme",
        text: "It reports changes without following remote links.",
        path: "README.md",
      },
    ]);
    expect(JSON.stringify(brief)).not.toContain("example.invalid");
    expect(JSON.stringify(brief)).not.toContain("token=secret");
  });

  it("skips void HTML without swallowing later overview prose", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "README.md",
            '<img src="https://example.invalid/logo.png">\n\n## Overview\n\nVisible project purpose.',
          ),
        ],
      }).excerpts,
    ).toContainEqual({
      source: "readme",
      text: "Visible project purpose.",
      path: "README.md",
    });
  });

  it.each([
    ["front matter", "---\ntitle: Secret prose\n---"],
    ["HTML comment", "<!-- Hidden project purpose. -->"],
    ["HTML block", "<div>Hidden project purpose.</div>"],
    ["multiline HTML block", "<div\nHidden project purpose.\n</div>"],
    ["image", "![Project purpose](https://example.invalid/image.png)"],
    ["badge", "[![build](https://img.example/badge.svg)](https://ci.example)"],
    ["reference definition", "[docs]: https://example.invalid/project-purpose"],
    ["table of contents", "## Contents\n\n- [Project purpose](#purpose)"],
    ["fenced code", "```text\nProject purpose in code.\n```"],
    ["indented code", "    Project purpose in code."],
    ["block quote", "> Project purpose in a quote."],
    ["command", "pnpm run project-purpose"],
    ["raw URL", "https://example.invalid/project-purpose"],
    ["link destination only", "[](https://example.invalid/project-purpose)"],
  ])("does not retain prose from %s", (_label, readme) => {
    const brief = briefFor(
      { files: [fetched("README.md", readme)] },
      {
        hasReadme: true,
        hasLicenseFile: true,
        apiLicenseDetected: true,
        hasStructuredEntryPoint: true,
      },
    );

    expect(brief.excerpts).toEqual([]);
    expect(JSON.stringify(brief)).not.toContain("example.invalid");
    expect(brief.cautions.map((fact) => fact.caution)).toContain(
      "insufficient-explanation",
    );
  });

  it("rejects unsafe candidates and bounds hostile unmatched Markdown", () => {
    const unmatched = `[${"a".repeat(256 * 1024 - 32)}`;
    const hostileReadme = `# Title\n\n${unmatched}`;
    const startedAt = performance.now();
    const unmatchedBrief = briefFor({
      files: [fetched("README.md", hostileReadme)],
    });
    const elapsed = performance.now() - startedAt;

    expect(new TextEncoder().encode(hostileReadme).byteLength).toBeLessThan(
      256 * 1024,
    );
    expect(unmatchedBrief.excerpts).toEqual([]);
    expect(elapsed).toBeLessThan(1_000);
    expect(
      briefFor({
        description: "Unsafe \u202e description",
        files: [fetched("README.md", "# Title\n\nMalformed \ud800 prose")],
      }).excerpts,
    ).toEqual([]);
  });

  it.each([
    ["description password assignment", "description", "password=hunter2"],
    ["README password assignment", "readme", "password=hunter2"],
    ["description GitHub token", "description", `ghp_${"a".repeat(36)}`],
    ["README GitHub token", "readme", `ghp_${"a".repeat(36)}`],
    ["description inline password", "description", "password=`hunter2`"],
    ["README braced secret", "readme", "secret={hunter2}"],
    ["README JSON secret", "readme", '{"secret":"hunter2"}'],
    [
      "description PEM private key",
      "description",
      "-----BEGIN PRIVATE KEY-----\nZml4dHVyZQ==\n-----END PRIVATE KEY-----",
    ],
    [
      "README PEM private key",
      "readme",
      "-----BEGIN PRIVATE KEY-----\nZml4dHVyZQ==\n-----END PRIVATE KEY-----",
    ],
  ] as const)(
    "omits %s from purpose evidence",
    (_label, source, credential) => {
      const purpose = `A deterministic release tool. ${credential}`;
      const brief =
        source === "description"
          ? briefFor({ description: purpose })
          : briefFor({
              files: [fetched("README.md", `## Overview\n\n${purpose}`)],
            });

      expect(brief.excerpts).toEqual([]);
      expect(JSON.stringify(brief)).not.toContain(credential);
      expect(brief.cautions.map((fact) => fact.caution)).toContain(
        "insufficient-explanation",
      );
    },
  );

  it("keeps generic credential documentation without an assigned secret", () => {
    const generic =
      "This documentation explains password rotation without storing a password value.";

    expect(
      briefFor({
        description: generic,
        files: [fetched("README.md", `## Overview\n\n${generic}`)],
      }).excerpts,
    ).toEqual([{ source: "github-description", text: generic, path: null }]);
  });

  it("emits only report-safe README, manifest, and tree paths", () => {
    const exactReadme = rootReadmePath(1_024);
    const longReadme = rootReadmePath(1_025);
    const exactManifest = nestedPackagePath(1_024);
    const longManifest = nestedPackagePath(1_025);
    const longTree = `template/${"a".repeat(1_016)}`;

    expect(exactReadme).toHaveLength(1_024);
    expect(longReadme).toHaveLength(1_025);
    expect(exactManifest).toHaveLength(1_024);
    expect(longManifest).toHaveLength(1_025);
    expect(longTree).toHaveLength(1_025);

    expect(
      briefFor({
        files: [
          fetched(exactReadme, "## Overview\n\nExact boundary purpose."),
          fetched(
            exactManifest,
            JSON.stringify({
              scripts: { start: "node app.js" },
              browser: "app.js",
            }),
          ),
        ],
      }),
    ).toMatchObject({
      excerpts: [
        {
          source: "readme",
          text: "Exact boundary purpose.",
          path: exactReadme,
        },
      ],
      kinds: [{ kind: "application", source: "manifest", path: exactManifest }],
    });

    const filtered = briefFor({
      files: [
        fetched(longReadme, "## Overview\n\nUnsafe path purpose."),
        fetched("README.md", "## Overview\n\nSafe fallback purpose."),
        fetched(
          longManifest,
          JSON.stringify({
            scripts: { start: "node app.js" },
            browser: "app.js",
          }),
        ),
        fetched(longTree, "{}"),
      ],
    });

    expect(filtered.excerpts).toEqual([
      { source: "readme", text: "Safe fallback purpose.", path: "README.md" },
    ]);
    expect(filtered.kinds).toEqual([]);
    expect(JSON.stringify(filtered)).not.toContain(longReadme);
    expect(JSON.stringify(filtered)).not.toContain(longManifest);
    expect(JSON.stringify(filtered)).not.toContain(longTree);
  });

  it("normalizes duplicate purpose evidence and enforces excerpt budgets", () => {
    const duplicate = briefFor({
      description: "ＦＡＳＴ   schema CHECKER",
      files: [
        fetched(
          "README.md",
          "## Overview\n\nfast schema checker\n\n" + "界".repeat(600),
        ),
      ],
    });

    expect(duplicate.excerpts).toHaveLength(2);
    expect(duplicate.excerpts[0]?.text).toBe("FAST schema CHECKER");
    expect(duplicate.excerpts[1]?.text).toHaveLength(480);
    expect(
      duplicate.excerpts.reduce(
        (total, excerpt) => total + Array.from(excerpt.text).length,
        0,
      ),
    ).toBeLessThanOrEqual(800);

    const exactDuplicate = briefFor({
      description: "ＦＡＳＴ   schema CHECKER",
      files: [fetched("README.md", "## Overview\n\nfast schema checker")],
    });
    expect(exactDuplicate.excerpts).toEqual([
      {
        source: "github-description",
        text: "FAST schema CHECKER",
        path: null,
      },
    ]);

    const maximum = briefFor({
      description: "D".repeat(480),
      files: [fetched("README.md", `# Title\n\n${"R".repeat(600)}`)],
    });
    expect(
      maximum.excerpts.map((excerpt) => Array.from(excerpt.text).length),
    ).toEqual([480, 320]);
  });

  it("does not confuse prose beginning with an executable name for a command", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "README.md",
            "# Go Tool\n\nGo is a repository analysis application.",
          ),
        ],
      }).excerpts,
    ).toContainEqual({
      source: "readme",
      text: "Go is a repository analysis application.",
      path: "README.md",
    });
  });

  it.each([
    "go client for analyzing public repositories.",
    "Go client for analyzing public repositories.",
    "node library for deterministic repository reports.",
    "Node library for deterministic repository reports.",
    "make dependency updates easier to review.",
    "Make dependency updates easier to review.",
  ])("retains command-like GitHub description prose: %s", (description) => {
    expect(briefFor({ description }).excerpts).toContainEqual({
      source: "github-description",
      text: description,
      path: null,
    });
  });

  it.each(["go test ./...", "node app.js", "make update-dependencies"])(
    "still rejects README command-only line %s",
    (readme) => {
      expect(
        briefFor({ files: [fetched("README.md", readme)] }).excerpts,
      ).toEqual([]);
    },
  );

  it.each([
    "ftp://example.invalid/project-purpose",
    "ssh://example.invalid/project-purpose",
    "//example.invalid/project-purpose",
    "www.example.invalid/project-purpose",
    "[www.example.invalid](https://destination.invalid/project-purpose)",
  ])("rejects expanded raw URL form %s", (readme) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([]);
    expect(JSON.stringify(brief)).not.toContain("example.invalid");
  });

  it.each([
    "custom+repo://example.invalid/project-purpose",
    "vscode-insiders://example.invalid/project-purpose",
    "a.b://example.invalid/project-purpose",
    "tel:+3212345678",
    "data:text/html,project-purpose",
    "javascript:alert(1)",
    "vbscript:msgbox(1)",
    "sms:+3212345678",
    "geo:50.8,4.3",
    "urn:isbn:9780000000000",
    "file:/private/project-purpose",
  ])("rejects generic or opaque raw URI %s", (readme) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([]);
    expect(JSON.stringify(brief)).not.toContain("project-purpose");
  });

  it.each([
    "blob:https://example.invalid/project-purpose",
    "filesystem:https://example.invalid/temporary/project-purpose",
    "about:project-purpose",
    "doi:10.1000/project-purpose",
    "custom:project-purpose",
    "   custom:project-purpose",
  ])(
    "rejects any syntactically valid raw URI at candidate start: %s",
    (readme) => {
      const brief = briefFor({ files: [fetched("README.md", readme)] });

      expect(brief.excerpts).toEqual([]);
      expect(JSON.stringify(brief)).not.toContain("project-purpose");
    },
  );

  it.each([
    ["after CJK text", "工具custom://example.invalid/project-purpose", "工具"],
    [
      "after CJK punctuation",
      "项目：custom://example.invalid/project-purpose",
      "项目:",
    ],
    [
      "after ASCII prose punctuation",
      "Purpose—custom://example.invalid/project-purpose",
      "Purpose—",
    ],
  ])("removes an embedded scheme URL %s", (_label, readme, expected) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([
      { source: "readme", text: expected, path: "README.md" },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(
      /example\.invalid|project-purpose/u,
    );
  });

  it.each([
    [
      "custom after prose",
      "See custom:project-purpose for details.",
      "See for details.",
    ],
    [
      "about after punctuation",
      "See—about:project-purpose for details.",
      "See— for details.",
    ],
    [
      "doi after prose",
      "Resolve doi:10.1000/project-purpose before release.",
      "Resolve before release.",
    ],
    [
      "blob after CJK prose",
      "请查看 blob:https://example.invalid/project-purpose 获取详情。",
      "请查看 获取详情。",
    ],
  ])("removes an embedded opaque URI %s", (_label, readme, expected) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([
      { source: "readme", text: expected, path: "README.md" },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(
      /project-purpose|example\.invalid|10\.1000/u,
    );
  });

  it.each([
    ["after CJK prose", "用途//example.invalid/private-purpose", "用途"],
    [
      "after punctuation",
      "Purpose—//example.invalid/private-purpose",
      "Purpose—",
    ],
    [
      "after normalized CJK punctuation",
      "用途：//example.invalid/private-purpose",
      "用途:",
    ],
  ])("removes a protocol-relative URI %s", (_label, readme, expected) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([
      { source: "readme", text: expected, path: "README.md" },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(
      /example\.invalid|private-purpose/u,
    );
  });

  it.each([
    [
      "embedded opaque URI",
      "[See custom:project-purpose for details.](https://destination.invalid)",
      "See for details.",
    ],
    [
      "opaque-only label",
      "[about:project-purpose](https://destination.invalid) provides documentation.",
      "provides documentation.",
    ],
  ])("removes an %s from a link label", (_label, readme, expected) => {
    const brief = briefFor({ files: [fetched("README.md", readme)] });

    expect(brief.excerpts).toEqual([
      { source: "readme", text: expected, path: "README.md" },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(
      /project-purpose|destination\.invalid/u,
    );
  });

  it.each([
    "1custom://host remains a literal identifier.",
    "custom:// URI syntax is documented.",
    "The path//segment identifier stays visible.",
    "The src/path//segment identifier stays visible.",
    "The data: field stores repository text.",
    "A javascript: parser reads source safely.",
    "Call tel: support when documentation is unclear.",
  ])("preserves URI-like prose at false-positive boundaries: %s", (readme) => {
    expect(
      briefFor({ files: [fetched("README.md", readme)] }).excerpts,
    ).toContainEqual({ source: "readme", text: readme, path: "README.md" });
  });

  it.each([
    ["custom:", "custom:"],
    ["custom: URI syntax is documented.", "custom: URI syntax is documented."],
    [
      "doi: field values are documented here.",
      "doi: field values are documented here.",
    ],
    [
      "The 1custom:project-purpose identifier stays visible.",
      "The 1custom:project-purpose identifier stays visible.",
    ],
    [
      "[custom: URI syntax](https://destination.invalid) is documented.",
      "custom: URI syntax is documented.",
    ],
  ])(
    "preserves a scheme token with an empty or space-separated payload: %s",
    (readme, expected) => {
      expect(
        briefFor({ files: [fetched("README.md", readme)] }).excerpts,
      ).toEqual([{ source: "readme", text: expected, path: "README.md" }]);
    },
  );

  it.each([
    ["over-indented", "```text\n    ```\nLeaked code prose.\n```"],
    ["different marker", "```text\n~~~\nLeaked code prose.\n```"],
    ["shorter marker", "````text\n```\nLeaked code prose.\n````"],
    ["trailing content", "```text\n``` trailing\nLeaked code prose.\n```"],
  ])("requires a valid %s fenced-code closer", (_label, fenced) => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          `# Title\n\n${fenced}\n\nActual public project purpose.`,
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual public project purpose.",
        path: "README.md",
      },
    ]);
  });

  it("does not confuse ordinary credential terminology or ghp-prefixed prose with a secret", () => {
    const generic =
      "The ghperformance benchmark explains API token rotation and password policies.";

    expect(briefFor({ description: generic }).excerpts).toEqual([
      { source: "github-description", text: generic, path: null },
    ]);
  });

  it.each([
    "OAuth token: rotate it every 90 days.",
    "Configuration field password: required for sign-in.",
    "The API key: identifies the configuration field.",
    "Password: required.",
    "API key: optional",
    "OAuth token: bearer",
    "password: null",
    '{"password": null}',
    "Password: configure it in settings.",
    "Token: generated during login.",
    "API key: provided by the user at runtime.",
    "Access token: obtained through OAuth.",
    "Private key: never leaves your device.",
    "Password: validation and rotation guidance.",
    "  Token: never log it.",
    "- API key: keep it out of source control.",
    "Token: SHA256 hashes identify values.",
    "Password: user-provided values are accepted.",
    "API key: keychain storage is recommended.",
    "Token: token-based authentication is supported.",
    "Password: passphrase requirements are documented.",
    "Secret: secret-management guidance is included.",
    "Private key: hardware-backed storage is supported.",
    "Token: base64-encoded values are accepted.",
    "API key: read-only access is sufficient.",
    "Token: user's browser stores no secrets.",
    "API key: developer's responsibility is rotation.",
    "Token: values, configuration: guidance for users.",
    "Password: rules; validation: handled by the server.",
    '{"note":"Intro, Token: values, configuration: guidance for users."}',
    '{note: "Intro, Password: rules; validation: handled by server."}',
    "token == null",
    "password == required",
    "token === undefined",
    "token => validate(token)",
    "Token: values;",
    "Password: rules,",
    "API key: metadata; # documented",
    "Token: value;",
    "Token: value; # placeholder",
    "Token: example,",
    "Token: sample; # documented",
    "Password: policy,",
    "Password: placeholder;",
    "API key: format, # documented",
    "Secret: example;",
    'Token: "example value";',
    'Token: "sample placeholder",',
    'Password: "default value";',
    'API key: "string value", # documented',
    "In the schema, token: identifier.",
    "For documentation, password: property;",
    "The response includes metadata, API key: parameter,",
    "In this example, secret: variable;",
    "During validation, token: object.",
    'Token: "example, value";',
    'Token: "sample / placeholder",',
    'Password: "(default value)";',
    'Secret: "example/value";',
    'Token: "an example value";',
    "Token: opaque, meaning: implementation-defined.",
    "Password: strong, minimum: 12 characters.",
    "API key: read-only, scope: metadata access.",
    "Checks whether token === undefined before use.",
    "The password == required comparison is documented.",
    'The field "token": values are documented.',
    'The JSON key "token": required by clients.',
    "Token: text, format: UUID.",
    "Password: hashed, storage: server-side.",
    "API key: external, provider: GitHub.",
    "Secret: textual, representation: UTF-8.",
    "Token: serialized, type: string.",
    'Token: "user\'s value";',
    'Token: "each user\'s value";',
    'Token: "users\' values";',
    'Password: "customer\'s hashed value";',
    "Password: salted, storage: server-side.",
    "Secret: encrypted, storage: vault.",
    "Token: immutable, format: UUID.",
    "API key: third-party, provider: GitHub.",
    "Private key: hardware-backed, storage: secure enclave.",
    "API key: OAuth2, provider: GitHub.",
    "Password: PBKDF2, storage: server-side.",
    "Secret: AES256, storage: vault.",
    "Private key: RSA2048, format: PEM.",
    "Token: bearer-token, format: header.",
    "Secret: secret-reference, source: vault.",
    "Secret: AES-256-GCM, storage: vault.",
    "Password: PBKDF2-SHA256, storage: server-side.",
    "Token: ChaCha20Poly1305, format: header.",
    "Token: XChaCha20-Poly1305, format: header.",
    "Token: HMACSHA256, format: header.",
    "Token: refresh-token, format: header.",
    "Token: session-token, format: header.",
    "Token: JWT-token, format: header.",
    "API key: API-key, format: header.",
    "Password: cryptographically-secure.",
    "Token: organization-specific, format: opaque.",
    "Secret: environmentally-provided, source: runtime.",
    "Private key: cryptographically-generated, storage: secure enclave.",
    "Token: sample.",
    "Secret: example!",
    "Password: default?",
    'Token: "sample."',
    "Token: SHA256.",
    "Password: UTF-8.",
    "Private key: Ed25519.",
    "Token: UUIDv4.",
    "Token: custom, format: opaque",
    "Password: cryptographically-secure",
    "Token: organization-specific, format: opaque",
    "Password: salted, storage: server-side",
    "Secret: AES-128-GCM, storage: vault.",
    "Password: Argon2id, storage: server-side.",
    "Token: RS256, format: header.",
    "Private key: RSA-4096, format: PEM.",
    "API key: OAuth2.1, provider: GitHub.",
    "Secret: AES-256-CBC, storage: vault.",
    "Token: HMAC-SHA256, format: header.",
    "Token: ES256, format: header.",
    "Token: HS256, format: header.",
    "Private key: ECDSA-P256, format: PEM.",
    "Private key: X25519, format: PEM.",
    "Private key: secp256k1, format: PEM.",
    "Token: Base64, format: text.",
    "Token: UUID, format: text.",
    "Password: bcrypt, format: hash.",
    "Password: scrypt, format: hash.",
    "Token: vendor-provided, source: runtime.",
    "Token: application-managed, source: runtime.",
    "Token: short-lived, source: runtime.",
    "Token: HKDF-SHA256, format: header.",
    "Token: BLAKE3, format: hash.",
    "Token: MD5, format: hash.",
    "Token: JWK, format: text.",
    "Private key: PEM, format: text.",
    "Private key: PKCS#8, format: text.",
    "Private key: P-256, format: text.",
    "Token: TLS1.3, format: protocol.",
    "Token: OIDC, format: protocol.",
    "Token: SAML2, format: protocol.",
    "Token: centrally-managed, source: runtime.",
    "Token: KMS-managed, source: runtime.",
    "Token: rotatable, source: runtime.",
    "Token: single-use, source: runtime.",
    "Token: DER, format: binary.",
    "Token: JWE, format: text.",
    "Token: JWT, format: text.",
    "Token: TOTP, format: numeric.",
    "Token: HOTP, format: numeric.",
    "Token: DPoP, format: protocol.",
    "Token: SSH, format: protocol.",
    "Token: PGP, format: protocol.",
    "Token: HMAC, format: hash.",
    "Token: mTLS, format: protocol.",
    "Token: WebAuthn, format: protocol.",
    "Token: machine-generated, source: runtime.",
    "Token: tenant-scoped, source: runtime.",
    "Token: cloud-managed, source: runtime.",
    "Token: account-managed, source: runtime.",
    "Token: per-user, source: runtime.",
    "Password: automatically generated.",
    "Token: expires after login.",
    "API key: supplied by operator.",
    "Secret: stored in environment.",
    "Private key: protected by TPM.",
    "Token: scoped per tenant.",
    "password: avoid logging credentials",
    "secret: avoid sharing credentials",
    "token: keep it out of logs",
    "token: never log them in application logs",
    "password: avoid storing credentials in logs",
    "Private key: PEM (RFC 7468)",
    "Private key: RSA-4096 (recommended)",
    "Password: Argon2id (recommended)",
    "Token: HMAC-SHA512 (recommended)",
    "Token: DER encoded",
    "Token: JWT compact serialization",
    "Token: resettable by users.",
    "Token: revoked on logout.",
    "Token: issued per application.",
    "Token: synchronized from vault.",
    "Private key: stored in HSM.",
    "Token: JWT (RFC 7519, section 3)",
    "Private key: PEM (RFC 7468 section 2)",
    "Private key: RSA-4096 (recommended for production)",
    "Password: Argon2id (recommended settings)",
    "Token: DER-encoded",
    "Token: JWT (RFC 7519, sections 3 and 4)",
    "Private key: RSA-4096 (recommended in production)",
    "Password: Argon2id (recommended for production use)",
    "Token: DER encoded form",
    "Token: JWT compact serialization format",
    "Password: string maximum length 64 characters",
    "Password: string minimum length 8 to 64 characters",
    "Token: JWT per RFC 7519.",
    "Token: JWT as defined in RFC 7519.",
    "Private key: PEM according to RFC 7468.",
    "Token: JWT RFC 7519 section 4.1.2.",
    "Token: JWT RFC 7519 and RFC 8725.",
    "Password: Argon2id with recommended settings.",
    "Password: string length between 8 and 64 characters.",
    "Password: string minimum length of 8 characters.",
    "Password: string min/max length between 8 and 64 characters.",
    "Password: string length 64 characters",
    "Password: string length 8 to 64 characters",
    "Private key: PEM RFC 7468 section 7.3.1",
    "Token: JWT sections 3 and 4",
    "Token: JWT sections 3, 4, and 5",
    "Password: string min length 8 characters",
    "Token: JWT as specified in RFC 7519.",
    "Token: JWT as defined by RFC 7519.",
    "Token: JWT compliant with RFC 7519.",
    "Token: JWT RFCs 7519 and 8725.",
    "Token: JWT RFC 7519 sections 4.1 and 4.2.",
    "Password: string length 8-64 characters.",
    "Password: string length 8–64 characters.",
    "Password: string maximum length is 64 characters.",
    "Password: string min/max length 8-64 characters.",
    "Token: JWT RFCs 7519, 8725.",
    "Token: JWT RFC 7519 sections 4.1, 4.2.",
    "Password: string length is 64 characters",
    "Password: string minimum length between 8 and 64 characters",
    "Password: string minimum length is between 8 and 64 characters",
    "Token: JWT, RFC 7519.",
    "Token: JWT, per RFC 7519.",
    "Token: JWT RFC 7519, RFC 8725.",
    "Password: string length is between 8 and 64 characters.",
    "Password: string maximum length 1,024 characters",
    "Password: string length between 1,024 and 4,096 characters",
    "Token: JWT RFC 7519 (section 4.1)",
    "Password: string length (64 characters)",
    "Token: JWT see RFC 7519.",
    "Token: JWT conforms to RFC 7519.",
    "Token: JWT RFC-7519.",
    "Password: string length is 8 to 64 characters.",
    "Password: string length (8-64 characters)",
    "Password: string minimum length (8 characters)",
    "Token: JWT per RFC 7519 and 8725",
    "Token: JWT RFC 7519 (sections 4.1–4.3)",
    "Token: JWT; see RFC 7519.",
    "Token: JWT — see RFC 7519.",
    "Password: string length is 8-64 chars.",
    "Token: JWT RFC 7519 section 4.1.2(a).",
    "Token: JWT RFC 7519 sections 4.1 to 4.3",
    "Token: JWT sections 4.1 through 4.3",
    "Password: string length from 8 to 64 characters",
    "Password: string length must be between 8 and 64 characters",
    "Token: JWT – see RFC 7519",
    "Token: JWT - see RFC 7519",
    "Token: JWT: see RFC 7519",
    "Password: string length must be 8-64 chars.",
    "Token: JWT RFC 7519 sections 4.1–4.3 and 5.1",
  ])("keeps ordinary credential documentation: %s", (generic) => {
    expect(briefFor({ description: generic }).excerpts).toEqual([
      { source: "github-description", text: generic.trim(), path: null },
    ]);
  });

  it.each([
    ["Token: JWT [RFC 7519]", "Token: JWT RFC 7519"],
    [
      "Password: string [minimum length 12]",
      "Password: string minimum length 12",
    ],
    [
      "Password: string [minimum length 12 characters]",
      "Password: string minimum length 12 characters",
    ],
  ])("keeps bracketed credential documentation: %s", (generic, visible) => {
    expect(briefFor({ description: generic }).excerpts).toEqual([
      { source: "github-description", text: visible, path: null },
    ]);
  });

  it.each([
    '{"token":false}',
    '{"password":true}',
    '{"private_key":false}',
    'Configuration uses {"token": false} to disable token support.',
    String.raw`Configuration: "{\"token\":false,\"note\":\"feature disabled\"}"`,
    "Token: values {documented in configuration}.",
    "Password: rules [see validation guidance].",
    "API key: metadata [documented below].",
    "Token: values; [see configuration guide].",
    "Password: rules; {see the security guide}.",
    'Token: values {documented below}. {"note":"feature disabled"}',
    'Password: rules [see validation guidance]. ["ordinary"]',
    "API key: metadata {details}. [1,2,3]",
    'Token: values; [see docs]. {"name":"app"}',
    "Password: rules; {see guide}. [false]",
    `Token: values ${"{x}".repeat(129)}.`,
  ])("keeps boolean credential feature flags: %s", (generic) => {
    expect(containsCredentialLikeValue(generic)).toBe(false);
    expect(briefFor({ description: generic }).excerpts).toHaveLength(1);
  });

  it("does not equate an unterminated bracket budget with finding a credential", () => {
    expect(
      containsCredentialLikeValue(`Password: rules; ${"[ ".repeat(129)}`),
    ).toBe(false);
  });

  it("keeps an ordinary quoted credential-key explanation inside a JSON note", () => {
    const generic = '{"note":"The field \\"token\\": values are documented."}';

    expect(containsCredentialLikeValue(generic)).toBe(false);
    expect(briefFor({ description: generic }).excerpts).toHaveLength(1);
  });

  it.each([
    String.raw`Configuration: "{\"note\":\"Intro, Token: values, configuration: guidance for users.\"}"`,
    String.raw`{"note":"embedded {\"note\":\"Password: rules; validation: handled by server.\"}"}`,
    String.raw`Configuration: "{\"note\":\"literal \\\" mark, Token: values, configuration: guidance\"}"`,
    String.raw`Configuration: "two notes {\"note\":\"Token: values, configuration: guidance\"} and {\"note\":\"Password: rules; validation: handled\"}"`,
  ])(
    "keeps ordinary documentation inside escaped structured text: %s",
    (generic) => {
      expect(containsCredentialLikeValue(generic)).toBe(false);
      expect(briefFor({ description: generic }).excerpts).toHaveLength(1);
    },
  );

  it("does not classify two JSON-string wrappers around ordinary documentation as a credential", () => {
    const generic = `Configuration: ${JSON.stringify(JSON.stringify(JSON.stringify({ note: 'literal quote " mark, Token: values, configuration: guidance' })))}`;

    expect(containsCredentialLikeValue(generic)).toBe(false);
  });

  it.each([
    `Configuration: ${JSON.stringify('{"\\u0074oken":"zircon9876","name":"app"}')}`,
    `Configuration: ${JSON.stringify('{"pass\\u0077ord":"zircon9876"}')}`,
    `Configuration: ${JSON.stringify('{"note":"demo"} token: huntersecret')}`,
    `Configuration: ${JSON.stringify('prefix "name": app; passphrase: alpha-beta-gamma')}`,
    `Configuration: ${JSON.stringify(JSON.stringify(JSON.stringify(JSON.stringify({ token: "zircon9876" }))))}`,
    '{"Ｔｏｋｅｎ":"zircon9876"}',
    `${"{ ".repeat(129)}{"Ｔｏｋｅｎ":"zircon9876"}`,
    `${"{ ".repeat(129)}{"Ｐａｓｓｗｏｒｄ":"zircon9876"}`,
  ])(
    "detects a credential after decoding structured metadata: %s",
    (credential) => {
      expect(containsCredentialLikeValue(credential)).toBe(true);
    },
  );

  it.each([
    `Configuration: ${JSON.stringify('token: huntersecret {"note":"demo"}')}`,
    `Configuration: ${JSON.stringify('token: huntersecret; {"note":"demo"}')}`,
    `Configuration: ${JSON.stringify('password: zircon9876 {"name":"app"}')}`,
    `Configuration: ${JSON.stringify('token: huntersecret ["demo"]')}`,
  ])(
    "detects a credential before decoded structured metadata: %s",
    (credential) => {
      expect(containsCredentialLikeValue(credential)).toBe(true);
    },
  );

  it("does not equate structured-scan limits with finding a credential", () => {
    const ordinaryObjects = JSON.stringify(
      Array.from({ length: 256 }, (_value, index) => ({
        name: `app${String(index)}`,
      })),
    );

    expect(containsCredentialLikeValue(ordinaryObjects)).toBe(false);
    expect(containsCredentialLikeValue("{ ".repeat(256))).toBe(false);
  });

  it.each([
    "token: hunter2",
    " token: hunter2",
    "  token: hunter2 # nested YAML",
    "- token: hunter2",
    "- password: huntersecret # list item",
    "password: huntersecret # local development only",
    "api_key: alphasecret # rotate monthly",
    "token: abcdef # comment",
  ])("omits an unquoted YAML credential with a comment: %s", (credential) => {
    expect(briefFor({ description: credential }).excerpts).toEqual([]);
  });

  it("scans the maximum benign structured text without quadratic work", () => {
    const line = "token: required\n";
    const input = line.repeat(Math.floor((256 * 1024) / line.length));
    const startedAt = performance.now();

    expect(containsCredentialLikeValue(input)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it.each([
    "Password: required.\ntoken: hunter2",
    "Password: required. token: hunter2",
    "Configuration guidance. token: hunter2 # local only",
    "password=required token=hunter2",
    "token=string password=huntersecret",
    "password=configure secret={hunter2}",
    "token: hunter2\nPassword: required.",
    '{"token":"huntersecret","name":"app"}',
    "{token: huntersecret, name: app}",
    '{"token":"huntersecret","password":null}',
    '[{"token":"huntersecret","name":"app"}]',
    "token: `huntersecret` with notes",
    "{token: zircon9876, $schema: v1}",
    "{token: zircon9876, app.name: demo}",
    "{token: zircon9876, x/y: demo}",
    "{token: zircon9876, 1: app}",
    "Owner's settings are {token: zircon9876, name: app}.",
    "The user's config is [{token: zircon9876, name: app}].",
    "It's configured as {password: zircon9876, mode: local}.",
    "Developer's example {name: app, token: zircon9876}",
    'Example "{name: app, token: zircon9876}"',
    'Example: "{name: app, token: zircon9876}"',
    '"{name: app, token: zircon9876}" is the example.',
    "Example = '{name: app, token: zircon9876}'",
    'Configuration: "[{password: zircon9876, mode: local}]"',
    'password: "correct horse battery staple"',
    '{"password":"correct horse battery staple","name":"app"}',
    '{password: "correct horse battery staple", name: app}',
    'token: "hunter,secret"',
    "passphrase: 'alpha beta gamma delta'",
    "token: huntersecret;",
    "token: huntersecret; # local only",
    "password: zircon9876,",
    "password: zircon9876, # local only",
    "username: admin, password: zircon9876,",
    "name: app, token: huntersecret;",
    "configuration: local, secret: zircon9876,",
    "ordinary prefix, password: zircon9876, # local",
    '{"password":"default"}',
    '{"password":"sample"}',
    '{"token":"example"}',
    '{"token":"example value"}',
    "{password: default}",
    '{password: "default"}',
    "{token: sample}",
    "{secret: example}",
    "- password: default",
    "password: default # local only",
    "password: default",
    'password: "default"',
    "token: sample",
    "secret: example",
    "  password: default",
    "  password: sample",
    "\tpassword: example",
    "password: default, # local only",
    "password: default; # local only",
    "- password: default,",
    '- password: "default";',
    "password: default, username: admin",
    "token: sample, name: app",
    "secret: example, note: placeholder",
    "Password: default",
    "  Password: sample",
    "- Token: example # replace",
    "- SECRET: default",
    "'Password': default",
    "Password: default, Format: string",
    "name: app, Password: default",
    "Password: zircon9876, Username: admin",
    "Token: huntersecret, Name: app",
    "Secret: zircon9876, note: placeholder",
    "API key: alphasecret, Provider: GitHub",
    "Private key: huntersecret, Format: PEM",
    "Password: zircon9876, x/y: demo",
    "Token: abcdefghijklmnopqrstuvwxyz",
    "Password: correct-horse-battery-staple",
    "API key: AbCdEfGhIjKlMnOpQrStUvWxYz",
    "Token: correct-horse-battery-staple, Name: app",
    "Secret: AlphaBravoCharlieDelta # rotate",
    'Token: "correct horse battery staple"',
    "Password: sample",
    "Password: example",
    "Token: default",
    "Token: sample",
    "Secret: example",
    "API key: default",
    "Private key: sample",
    'Token: "sample"',
    "Token: default, Format: string",
    "Token: sample, Name: app",
    "Secret: example, note: placeholder",
    "API key: default, Provider: GitHub",
    "Private key: sample, Format: PEM",
    "Password: sample, Format: string",
    "Password: example, Username: admin",
    "Password: hunter2",
    "Password: p@ssw0rd",
    "Password: hunter2, Username: admin",
    "Token: abc12345",
    "Secret: test1234 # rotate",
    "API key: a1b2c3d4",
    "Private key: key12345",
    "Password: alpha-beta-gamma-delta",
    "Token: abcdefghijklmnopqrs",
    "  Password: hunter2",
    "Secret: s3cr3t, note: local",
    "Private key: key1234, Format: PEM",
    'Password: "user\'s correct-horse-battery-staple value"',
    'Token: "customer\'s AbCdEfGhIjKlMnOpQrStUvWxYz value"',
    "Password: CorrectHorseBatteryStaple, Username: admin.",
    "Token: abcdefghijklmnopqrs, Name: app!",
    "Secret: AlphaBravoCharlieDelta # rotate.",
    "API key: AbCdEfGhIjKlMnOpQrStUvWxYz, Provider: demo?",
    "Password: customer’s correct-horse-battery-staple value.",
    'Password: "correct horse battery staple", Username: admin.',
    "Token: abcdefghijklmnopqrstuvwxyz.",
    "Password: correct-horse-battery-staple.",
    "Password: letmein!",
    'Token: "correct horse battery staple."',
    "token: Argon2abcdefghijklmnopqrstuvwxyz",
    "private_key: RSA1234567890123456789012345",
    "token: SHA256",
    "  API key: OAuth2.1",
    "- Private key: RSA4096",
    "'Token': UUIDv4",
    "Password: user's value, S3cr3tP@ssw0rd",
    "Token: user's value; AbCdEfGhIjKlMnOpQrStUvWxYz",
    "password: correct horse battery staple",
    "Password: correct horse battery staple",
    "passphrase: alpha beta gamma delta",
    "token: alpha bravo charlie delta",
    "secret: my production secret value",
    "api_key: alpha bravo charlie delta",
    "password: correct horse battery staple # local",
    "password: correct horse battery staple, username: admin",
    "  password: correct horse battery staple",
    "- password: correct horse battery staple",
    '"password": correct horse battery staple',
    "name: app, password: correct horse battery staple",
    "password: strong-securely-generated-opaque-token",
    "  Token: generated-opaque-token-value",
    "- Secret: secure-opaque-generated-value",
    "'Password': hardware-backed-opaque-token",
    "name: app, Token: generated-opaque-token-value",
    "Password: user's value, https://S3cr3tP@ssw0rd",
    "Password: user's value, realm:CorrectHorseBatteryStaple",
    "Password: salted correct-horse-battery-staple",
    "Password: strong CorrectHorseBatteryStaple",
    "Secret: encrypted S3cr3tP@ssw0rd",
    "Token: OAuth2 abc12345",
    "API key: Base64 AbCdEfGhIjKlMnOpQrStUvWxYz",
    "Token: custom abc12345, format: opaque",
    "Token: opaque abcdefghijklmnopqrstuvwxyz # rotate",
    "password: strong-secure-token",
    "token: generated-opaque-token",
    "password: strong securely generated opaque token",
    'password: "strong securely generated opaque token"',
    "  Token: generated opaque token value",
    "- Secret: secure opaque generated value",
    "Token: AES-abcdefghijkl-mnopqrstuvwx-yzabcdef1234",
    "Secret: AES-abcdefgh1234-ijklmnop5678",
    "Password: generated huntersecret, Username: admin",
    "Token: provided abcdefghijklmnopqrs, Name: app",
    "Secret: encrypted CorrectHorseBatteryStaple, source: vault",
    "API key: vendor AbCdEfGhIjKlMnOpQrStUvWxYz, Provider: GitHub",
    "Private key: hardware correcthorsebatterystaple, Format: PEM",
    "Password: generated S3cr3tP@ssw0rd # local",
    "Token: bearer huntersecret, format: header",
    "Password: strong{S3cr3tP@ssw0rd",
    "Password: salted[correct-horse-battery-staple]",
    "Token: OAuth2[abc12345]",
    "API key: custom{AbCdEfGhIjKlMnOpQrStUvWxYz",
    "Token: opaque[abcdefghijklmnopqrstuvwxyz] # rotate",
    "password: never log secret token passphrase",
    "password: required {huntersecret}",
    "token: string {abc12345}",
    "Password: generated {huntersecret}",
    "password: required{huntersecret}",
    "token: string[abc12345]",
    "Password: 1 2 3 4",
    "Password: 1 2 3 4, Username: admin",
    "Token: 9 8 7 6 5 4, Name: app",
    "Password: user’s 1 2 3 4, Username: admin",
    "Token: 1-2-3-4-5-6-7-8-9-0",
    "Password: 1 2 3 4 5 6 7 8",
    "Secret: 1.2.3.4.5.6.7.8.9",
    "API key: value-1-2-3-4-5-6-7-8",
    "Token: JWT 12345678901234567890",
    "Token: JWT 1234 5678 9012 3456",
    "Token: OAuth2 98765432109876543210",
    "Password: string 12345678901234567890",
    "Token: JWT RFC 12345678901234567890",
    "Password: string minimum length 12345678901234567890",
    "Token: values [12345678901234567890]",
    "Token: values [1-2-3-4-5-6-7-8-9-0]",
    "Password: rules {12345678901234567890}",
    "Secret: metadata [98765432109876543210]",
    "Token: JWT RFC 4111 1111 1111 1111",
    "Token: JWT RFC 1234 5678 9012 3456",
    "Token: OAuth2 section 9876 5432 1098 7654",
    "Password: string minimum length 1234 5678 9012 3456",
    "Token: values [value 1234 5678 9012 3456]",
    "Secret: metadata [metadata 9876-5432-1098-7654]",
    "Password: rules {value 4111 1111 1111 1111}",
    "Password: string minimum 1234 5678 9012 3456",
    "Password: string recommended 1234-5678-9012-3456",
    "Token: OAuth2 RFC 1234 5678 9012 3456",
    "Token: JWT section 1234 5678 9012 3456, Name: app",
    "Password: string 1234 RFC 56 78, Username: admin",
    "Token: JWT RFC 4111-11-11, Name: app",
    "Password: string length 1234@to@4096, Username: admin",
    "Token: JWT RFC 4111@section@11@11@11, Name: app",
    "Password: string minimum length -1234 to -4096",
    "Token: JWT RFC -4111 section +11 +11",
    "Password: string length 1234,,,,to,,,,4096, Username: admin",
    "Token: JWT RFC 4111,,,,section,,,,11,,,,11, Name: app",
    "Token: JWT RFC (4111)section[11](11)",
    "Password: string length [1234] to (4096)",
    "Password: string length between 1234, 4096, Username: admin",
    "Password: string minimum length is between 1234, 4096, Username: admin",
    "Token: JWT RFC 4111section 11.11.11, Name: app",
    "Token: JWT RFC 4111,section 11.11.11, Name: app",
    "Token: JWT RFC 4111,RFC 1111, Name: app",
    "Token: JWT RFCs 4111,1111, Name: app",
    "Token: JWT,per RFC 4111, Name: app",
    "Token: JWT sections 11-11-11, Name: app",
    "Token: JWT sections 1.2.3-4.5.6-7.8.9, Name: app",
    "Token: JWT RFC 4111 sections 11-11-11, Name: app",
    "Password: string minimum length 1234-4096, Username: admin",
    "Password: string maximum length 1234 to 4096, Username: admin",
    "Password: string minimum length (1234-4096 chars)",
    "Password: string length (8-64 chars) chars",
    'password: zircon9876, "username": "admin"',
    "token: huntersecret, $schema: v1",
    "secret: zircon9876, 1: app",
    "password: zircon9876, username: admin",
    "token: huntersecret, name: app",
    "secret: zircon9876, note: placeholder",
    "password: zircon9876, token: placeholder,",
    "password: 'null''huntersecret'",
    "password: 'required''huntersecret'",
    String.raw`Configuration: "{\"token\":\"zircon9876\",\"name\":\"app\"}"`,
    String.raw`{"note":"embedded {\"token\":\"zircon9876\",\"name\":\"app\"}"}`,
    String.raw`Configuration: "[{\"password\":\"zircon9876\",\"mode\":\"local\"}]"`,
    String.raw`Configuration: "{\"note\":\"size is 5\\\"\",\"token\":\"zircon9876\"}"`,
    String.raw`Configuration: "[{\"note\":\"size is 5\\\"\",\"password\":\"zircon9876\"}]"`,
    String.raw`{"\u0074oken":"zircon9876","name":"app"}`,
    String.raw`Configuration: "{\"\\u0074oken\":\"zircon9876\"}"`,
    String.raw`Configuration: "{\"pass\\u0077ord\":\"zircon9876\"}"`,
    String.raw`Configuration: "prefix { marker \" then {\"token\":\"zircon9876\",\"name\":\"app\"}"`,
    String.raw`Configuration: "{\"note\":\"password=zircon9876\"}"`,
    String.raw`Configuration: "{\"note\":\"token=zircon9876\"}"`,
    'Configuration: "{\\"note\\":\\"password=\\`zircon9876\\`\\"}"',
    String.raw`Configuration: "{\"note\":\"secret={zircon9876}\"}"`,
    `Configuration: ${JSON.stringify(JSON.stringify(JSON.stringify({ note: "password=zircon9876" })))}`,
    `Configuration: ${JSON.stringify('{"note":"demo"} token: huntersecret')}`,
    `Configuration: ${JSON.stringify('prefix "name": app; passphrase: alpha-beta-gamma')}`,
  ])("omits a later or earlier credential among benign fields: %s", (text) => {
    expect(briefFor({ description: text }).excerpts).toEqual([]);
  });

  it.each([
    ["benign first", "Password: required.\ntoken: hunter2 # local"],
    ["credential first", "token: hunter2 # local\nPassword: required."],
  ])("does not join %s README credentials into evidence", (_label, lines) => {
    const brief = briefFor({
      files: [fetched("README.md", `## Overview\n\n${lines}`)],
    });

    expect(JSON.stringify(brief)).not.toContain("hunter2");
  });

  it("drops an entire multiline PEM private-key block without leaking its payload", () => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "## Overview",
            "",
            "-----BEGIN PRIVATE KEY-----",
            "Zml4dHVyZS1wcml2YXRlLWtleQ==",
            "-----END PRIVATE KEY-----",
            "",
            "Visible project purpose after the private material.",
          ].join("\n"),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Visible project purpose after the private material.",
        path: "README.md",
      },
    ]);
    expect(JSON.stringify(brief)).not.toContain("Zml4dHVyZS1wcml2YXRlLWtleQ");
  });

  it("accepts a same-marker fenced-code closer with three-space indentation and trailing whitespace", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "README.md",
            "# Title\n\n````text\nHidden code prose.\n   ```` \t\n\nActual public project purpose.",
          ),
        ],
      }).excerpts,
    ).toEqual([
      {
        source: "readme",
        text: "Actual public project purpose.",
        path: "README.md",
      },
    ]);
  });

  it.each([
    [
      "double-quoted link destination",
      '[Visible](https://example.invalid/path "quoted ) leaked-link") purpose text.',
      "Visible purpose text.",
    ],
    [
      "single-quoted link destination",
      "[Visible](ssh://example.invalid/path 'quoted ) leaked-link') purpose text.",
      "Visible purpose text.",
    ],
    [
      "double-quoted HTML attribute",
      'Visible <span data-note="quoted > leaked-attribute">project</span> purpose.',
      "Visible project purpose.",
    ],
    [
      "single-quoted HTML attribute",
      "Visible <span data-note='quoted > leaked-attribute'>project</span> purpose.",
      "Visible project purpose.",
    ],
  ])("does not leak a %s", (_label, prose, expected) => {
    const brief = briefFor({
      files: [fetched("README.md", `# Title\n\n${prose}`)],
    });

    expect(brief.excerpts).toEqual([
      { source: "readme", text: expected, path: "README.md" },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(
      /example\.invalid|leaked-link|leaked-attribute/u,
    );
  });

  it("keeps a leading HTML block hidden across inline comments and false closers", () => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "# Title",
            "",
            '<div data-note="</div>"><!-- inline </div> comment -->',
            "Hidden block purpose.",
            "<!--",
            "</div>",
            "-->",
            "Still hidden block purpose.",
            "</div>",
            "Actual public project purpose.",
          ].join("\n"),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual public project purpose.",
        path: "README.md",
      },
    ]);
  });

  it("keeps nested same-tag HTML hidden until the outer tag closes", () => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "# Title",
            "",
            '<div data-note="<div></div>">',
            "<!-- <div>fake nested block</div> -->",
            "<div>",
            "Nested hidden purpose.",
            "</div>",
            "Outer hidden purpose.",
            "</div>",
            "Actual public project purpose.",
          ].join("\n"),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual public project purpose.",
        path: "README.md",
      },
    ]);
    expect(JSON.stringify(brief)).not.toMatch(/Nested hidden|Outer hidden/u);
  });

  it.each([
    [
      "different nested tag",
      [
        "<div>",
        "<section>",
        "Different-tag hidden purpose.",
        "</section>",
        "</div>",
      ],
    ],
    [
      "self-closing same tag",
      ["<div>", "<div />", "Self-closing hidden purpose.", "</div>"],
    ],
    [
      "blank lines inside a nested same tag",
      [
        "<div>",
        "<div>",
        "",
        "Blank-line hidden purpose.",
        "",
        "</div>",
        "",
        "</div>",
      ],
    ],
  ])("handles a nearby HTML block case: %s", (_label, htmlLines) => {
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          ["# Title", "", ...htmlLines, "Actual public project purpose."].join(
            "\n",
          ),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual public project purpose.",
        path: "README.md",
      },
    ]);
    expect(JSON.stringify(brief)).not.toContain("hidden purpose");
  });

  it("fails closed when same-tag HTML nesting exceeds the scanner depth bound", () => {
    const openings = Array.from({ length: 130 }, () => "<div>");
    const closings = Array.from({ length: 130 }, () => "</div>");
    const brief = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "# Title",
            "",
            ...openings,
            "Deeply nested hidden purpose.",
            ...closings,
            "Must remain hidden after the bound is exceeded.",
          ].join("\n"),
        ),
      ],
    });

    expect(brief.excerpts).toEqual([]);
  });

  it("recognizes Setext titles and overview headings before selecting prose", () => {
    const title = briefFor({
      files: [
        fetched(
          "README.md",
          "Project Name\n============\nActual purpose after the title.",
        ),
      ],
    });
    const overview = briefFor({
      files: [
        fetched(
          "README.md",
          [
            "# Project Name",
            "",
            "Generic lead that should lose.",
            "",
            "Overview",
            "--------",
            "Actual overview purpose.",
          ].join("\n"),
        ),
      ],
    });

    expect(title.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual purpose after the title.",
        path: "README.md",
      },
    ]);
    expect(overview.excerpts).toEqual([
      {
        source: "readme",
        text: "Actual overview purpose.",
        path: "README.md",
      },
    ]);
  });

  it("reuses the unchanged preferred README ordering in both analyzers", () => {
    const files = [
      fetched(
        "README.zh-CN.md",
        "# 中文\n\nRoot Chinese purpose.\n\n## Installation",
      ),
      fetched(
        ".github/README.md",
        "# GitHub\n\nGitHub purpose.\n\n## Installation",
      ),
      fetched(
        "README.md",
        "# Root\n\nRoot default purpose.\n\n## Usage\n\npnpm test",
      ),
    ];
    const input = inputWith({ files: [...files].reverse() });
    const general = analyzeGeneralRepository(input);

    expect(preferredReadme(files)?.path).toBe("README.md");
    expect(general).toMatchObject({
      hasReadme: true,
      usageHeading: true,
      installHeading: false,
    });
    expect(analyzeProjectBrief(input, general).excerpts).toEqual([
      {
        source: "readme",
        text: "Root default purpose.",
        path: "README.md",
      },
    ]);
  });
});

describe("project kind and caution evidence", () => {
  it.each([
    [
      {
        files: [
          fetched(
            "package.json",
            JSON.stringify({
              scripts: { start: "node app.js" },
              browser: "app.js",
            }),
          ),
        ],
      },
      "application",
    ],
    [
      {
        files: [
          fetched(
            "package.json",
            JSON.stringify({ bin: { tool: "dist/cli.js" } }),
          ),
        ],
      },
      "command-line-tool",
    ],
    [
      {
        files: [
          fetched(
            "package.json",
            JSON.stringify({
              exports: "./dist/index.js",
              types: "./dist/index.d.ts",
            }),
          ),
        ],
      },
      "library",
    ],
    [
      {
        files: [
          fetched(".codex-plugin/plugin.json", "{}"),
          fetched("src/index.ts", "export {}"),
        ],
      },
      "plugin",
    ],
    [{ topics: ["repository-template"] }, "template"],
    [
      {
        files: [
          fetched("README.md", "Documentation only"),
          fetched("docs/guide.md", "Guide"),
        ],
      },
      "documentation",
    ],
  ] as const)("classifies structural %s evidence", (options, kind) => {
    expect(
      briefFor(options, { supportedSourceFileCount: 0 }).kinds.map(
        (fact) => fact.kind,
      ),
    ).toContain(kind);
  });

  it("classifies bounded pyproject structures with exact manifest paths", () => {
    const brief = briefFor({
      files: [
        fetched(
          "pyproject.toml",
          [
            "[project]",
            'name = "fixture"',
            "[project.scripts]",
            'fixture = "fixture.cli:main"',
            '[project.entry-points."fixture.plugins"]',
            'example = "fixture.plugin:Plugin"',
          ].join("\n"),
        ),
        fetched("src/fixture/__init__.py", ""),
      ],
    });

    expect(brief.kinds).toEqual([
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "pyproject.toml",
      },
      { kind: "library", source: "manifest", path: "pyproject.toml" },
      { kind: "plugin", source: "manifest", path: "pyproject.toml" },
    ]);
  });

  it("does not classify a CLI-only pyproject name as a library", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "pyproject.toml",
            [
              "[project]",
              'name = "fixture"',
              "[project.scripts]",
              'fixture = "fixture.cli:main"',
            ].join("\n"),
          ),
        ],
      }).kinds,
    ).toEqual([
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "pyproject.toml",
      },
    ]);
  });

  it("resolves Python library layout relative to a nested pyproject", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "packages/tool/pyproject.toml",
            [
              "[project]",
              'name = "tool"',
              "[project.scripts]",
              'tool = "tool.cli:main"',
            ].join("\n"),
          ),
          fetched("packages/tool/src/tool/__init__.py", ""),
        ],
      }).kinds,
    ).toEqual([
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "packages/tool/pyproject.toml",
      },
      {
        kind: "library",
        source: "manifest",
        path: "packages/tool/pyproject.toml",
      },
    ]);
  });

  it("does not borrow Python library layout from a root, sibling, or wrong-name package", () => {
    expect(
      briefFor({
        files: [
          fetched(
            "packages/tool/pyproject.toml",
            [
              "[project]",
              'name = "tool"',
              "[project.scripts]",
              'tool = "tool.cli:main"',
            ].join("\n"),
          ),
          fetched("src/tool/__init__.py", ""),
          fetched("packages/other/src/tool/__init__.py", ""),
          fetched("packages/tool/src/other/__init__.py", ""),
        ],
      }).kinds,
    ).toEqual([
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "packages/tool/pyproject.toml",
      },
    ]);
  });

  it("fails closed for malformed, oversized, deeply nested, and empty manifests", () => {
    const deepExports = `{"exports":${"[".repeat(150)}"./index.js"${"]".repeat(150)}}`;
    const oversized = JSON.stringify({
      bin: { tool: "dist/cli.js" },
      padding: "x".repeat(256 * 1024),
    });
    const brief = briefFor({
      files: [
        fetched("a/package.json", "{"),
        fetched("b/package.json", deepExports),
        fetched("c/package.json", oversized),
        fetched(
          "d/package.json",
          JSON.stringify({ bin: {}, exports: [], scripts: { start: "" } }),
        ),
        fetched("e/package.json", '{"bin":"\\ud800"}'),
        fetched("pyproject.toml", "[project\nname = broken"),
      ],
    });

    expect(brief.kinds).toEqual([]);
  });

  it.each([
    [
      "application",
      {
        files: [fetched("package.json", '{"scripts":{"start":"node app.js"}}')],
      },
      { hasConventionalEntryPoint: false },
    ],
    [
      "command-line-tool",
      { files: [fetched("package.json", '{"bin":{}}')] },
      {},
    ],
    ["library", { files: [fetched("package.json", '{"exports":{}}')] }, {}],
    [
      "plugin",
      { topics: ["plugins"], files: [fetched("plugins.json", "{}")] },
      {},
    ],
    [
      "template",
      { topics: ["templates"], files: [fetched("templates/file.txt", "x")] },
      {},
    ],
    [
      "documentation",
      { files: [fetched("README.md", "A documented runtime project.")] },
      { supportedSourceFileCount: 1 },
    ],
  ] as const)(
    "does not classify near-miss %s evidence",
    (kind, options, metrics) => {
      expect(
        briefFor(options, metrics).kinds.map((fact) => fact.kind),
      ).not.toContain(kind);
    },
  );

  it("uses frozen kind order, strongest evidence, a three-kind cap, and no unknown label", () => {
    const brief = briefFor({
      topics: ["template", "plugin"],
      files: [
        fetched("plugin.json", "{}"),
        fetched("cookiecutter.json", "{}"),
        fetched(
          "package.json",
          JSON.stringify({
            scripts: { start: "node app.js" },
            browser: "app.js",
            bin: { tool: "dist/cli.js" },
            exports: "./dist/index.js",
          }),
        ),
      ],
    });

    expect(Object.isFrozen(PROJECT_KINDS)).toBe(true);
    expect(Object.isFrozen(PROJECT_BRIEF_CAUTIONS)).toBe(true);
    expect(brief.kinds).toEqual([
      { kind: "application", source: "manifest", path: "package.json" },
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "package.json",
      },
      { kind: "library", source: "manifest", path: "package.json" },
    ]);
    expect(brief.kinds).toHaveLength(3);

    expect(
      briefFor({}, { supportedSourceFileCount: 0, hasReadme: false }).kinds,
    ).toEqual([]);
  });

  it("retains exact strongest tree and metadata evidence paths", () => {
    expect(
      briefFor({
        topics: ["plugin", "template"],
        files: [
          fetched(".codex-plugin/plugin.json", "{}"),
          fetched("cookiecutter.json", "{}"),
        ],
      }).kinds,
    ).toEqual([
      {
        kind: "plugin",
        source: "tree",
        path: ".codex-plugin/plugin.json",
      },
      {
        kind: "template",
        source: "tree",
        path: "cookiecutter.json",
      },
    ]);

    expect(briefFor({ topics: ["repository-template"] }).kinds).toEqual([
      {
        kind: "template",
        source: "github-metadata",
        path: null,
      },
    ]);
  });

  it("orders all applicable cautions and assigns bounded sources", () => {
    expect(
      briefFor(
        { archived: true, licenseSpdxId: null },
        {
          hasReadme: false,
          hasLicenseFile: false,
          apiLicenseDetected: false,
          hasStructuredEntryPoint: false,
          hasConventionalEntryPoint: false,
          supportedSourceFileCount: 0,
        },
      ).cautions,
    ).toEqual([
      { caution: "archived", source: "github-metadata", path: null },
      {
        caution: "insufficient-explanation",
        source: "analysis",
        path: null,
      },
      {
        caution: "license-evidence-absent",
        source: "analysis",
        path: null,
      },
      {
        caution: "entry-point-evidence-absent",
        source: "analysis",
        path: null,
      },
    ]);
  });

  it("is deterministic under shuffled files and never mutates frozen inputs", () => {
    const files = [
      fetched("README.md", "# Tool\n\nA deterministic project purpose."),
      fetched("plugin.json", "{}"),
      fetched(
        "package.json",
        JSON.stringify({
          bin: { tool: "dist/cli.js" },
          exports: "./dist/index.js",
        }),
      ),
    ];
    const left = inputWith({ topics: ["template"], files });
    const right = inputWith({
      topics: ["template"],
      files: [...files].reverse(),
    });
    Object.freeze(left.repository.topics);
    Object.freeze(left.repository);
    Object.freeze(left.tree.files);
    Object.freeze(left.tree.skippedEntries);
    Object.freeze(left.tree);
    for (const file of left.files) Object.freeze(file);
    Object.freeze(left.files);
    Object.freeze(left);

    expect(() =>
      analyzeProjectBrief(left, perfectGeneralMetrics),
    ).not.toThrow();
    expect(analyzeProjectBrief(left, perfectGeneralMetrics)).toEqual(
      analyzeProjectBrief(right, perfectGeneralMetrics),
    );
  });
});
