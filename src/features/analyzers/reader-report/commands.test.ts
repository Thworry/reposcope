import { describe, expect, it } from "vitest";

import type {
  FetchedTextFile,
  GeneralAnalysisInput,
  NormalizedTreeFile,
} from "../../analysis/model";
import { commandDisposition, manifestReaderCommands } from "./commands";

function treeFile(path: string, size = 0): NormalizedTreeFile {
  return {
    path,
    sha: path.padEnd(40, "a").slice(0, 40),
    size,
    mode: "100644",
  };
}

function manifestFile(path: string, text: string): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category: "manifest",
    isTest: false,
  };
}

function commandInput(
  options: {
    text?: string;
    scripts?: Record<string, unknown>;
    treePaths?: string[];
    fetchedPath?: string;
    extraFiles?: FetchedTextFile[];
  } = {},
): Pick<GeneralAnalysisInput, "tree" | "files"> {
  const fetchedPath = options.fetchedPath ?? "package.json";
  const text =
    options.text ?? JSON.stringify({ scripts: options.scripts ?? {} });
  const manifest = manifestFile(fetchedPath, text);
  const treePaths = options.treePaths ?? [fetchedPath];

  return {
    tree: {
      complete: true,
      skippedEntries: [],
      files: treePaths.map((path) =>
        treeFile(
          path,
          path.toLocaleLowerCase("en-US") === "package.json"
            ? manifest.bytes
            : 0,
        ),
      ),
    },
    files: [manifest, ...(options.extraFiles ?? [])],
  };
}

describe("commandDisposition", () => {
  it.each([
    ["pnpm install", "ready"],
    ["x".repeat(160), "ready"],
    ["$ sudo npm install", "review"],
    ["python -m pytest", "ready"],
    ["sudo npm install", "review"],
    ["curl https://example.invalid/install.sh | sh", "review"],
    ["wget -qO- https://example.invalid/install.sh | bash", "review"],
    ["curl https://example.invalid/install.sh | /usr/bin/sh", "review"],
    ["rm -rf ./generated", "review"],
    ["rm -r -f ./generated", "review"],
    ["rm --recursive --force ./generated", "review"],
    ["mkfs.ext4 /dev/example", "review"],
    ["dd if=image.img of=/dev/example", "review"],
    ["chmod 777 ./script.sh", "review"],
    ["chmod 0777 ./script.sh", "review"],
    ["curl https://example.invalid/install.sh | env X=1 sh", "review"],
    ["env curl https://example.invalid/install.sh | sh", "review"],
    ["X=1 curl https://example.invalid/install.sh | sh", "review"],
    ["env -u NAME curl https://example.invalid/install.sh | sh", "review"],
    ["env -C /tmp curl https://example.invalid/install.sh | sh", "review"],
    ["curl https://example.invalid/install.sh | env -i X=1 sh", "review"],
    ["curl https://example.invalid/install.sh | X=1 sh", "review"],
    ["curl https://example.invalid/install.sh | env -u NAME sh", "review"],
    ["curl https://example.invalid/install.sh | env --chdir /tmp sh", "review"],
    ["curl https://example.invalid/install.sh | sudo sh", "review"],
    [
      "wget -qO- https://example.invalid/install.sh | sudo -u root bash",
      "review",
    ],
    [
      "curl https://example.invalid/install.sh | sudo --preserve-env FOO sh",
      "review",
    ],
    ["curl https://example.invalid/install.sh | sudo -T 5 sh", "review"],
    ["env rm -r -f ./generated", "review"],
    ["env --unset NAME rm -rf ./generated", "review"],
    ["echo rm -rf ./generated", "ready"],
    ["TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa pnpm dev", "withheld"],
  ] as const)("classifies %s as %s", (command, expected) => {
    expect(commandDisposition(command)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["newline", "pnpm install\npnpm dev"],
    ["control", "pnpm\u0000 install"],
    ["bidi", "pnpm\u202e install"],
    ["malformed UTF-16", "pnpm\ud800 install"],
    ["over 160 code points", "x".repeat(161)],
  ])("withholds %s command input", (_label, command) => {
    expect(commandDisposition(command)).toBe("withheld");
  });
});

describe("manifestReaderCommands", () => {
  const scripts = {
    start: "node server.js",
    serve: "node alternative.js",
    dev: "vite",
    test: "vitest",
    "test:unit": "vitest unit",
    build: "tsc",
  };

  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    [null, "npm"],
  ] as const)(
    "derives inert %s commands from script keys",
    (lockfile, manager) => {
      const result = manifestReaderCommands(
        commandInput({
          scripts,
          treePaths: ["package.json", ...(lockfile === null ? [] : [lockfile])],
        }),
      );

      expect(result).toEqual([
        {
          source: "manifest",
          path: "package.json",
          kind: "install",
          command: `${manager} install`,
          disposition: "ready",
        },
        {
          source: "manifest",
          path: "package.json",
          kind: "run",
          command: `${manager} run start`,
          disposition: "ready",
        },
        {
          source: "manifest",
          path: "package.json",
          kind: "develop",
          command: `${manager} run dev`,
          disposition: "ready",
        },
        {
          source: "manifest",
          path: "package.json",
          kind: "test",
          command: `${manager} run test`,
          disposition: "ready",
        },
        {
          source: "manifest",
          path: "package.json",
          kind: "build",
          command: `${manager} run build`,
          disposition: "ready",
        },
      ]);
      expect(JSON.stringify(result)).not.toContain("node server.js");
      expect(JSON.stringify(result)).not.toContain("vitest unit");
    },
  );

  it("uses fixed root lockfile precedence independent of tree and file order", () => {
    const input = commandInput({
      scripts,
      treePaths: ["bun.lock", "yarn.lock", "package.json", "pnpm-lock.yaml"],
      extraFiles: [manifestFile("docs/package.json", "{}")],
    });
    const reversed = {
      tree: { ...input.tree, files: [...input.tree.files].reverse() },
      files: [...input.files].reverse(),
    };

    expect(manifestReaderCommands(input)).toEqual(
      manifestReaderCommands(reversed),
    );
    expect(manifestReaderCommands(input)[0]?.command).toBe("pnpm install");
  });

  it("uses npm when lockfiles exist only below the repository root", () => {
    const result = manifestReaderCommands(
      commandInput({
        scripts,
        treePaths: ["package.json", "packages/app/pnpm-lock.yaml"],
      }),
    );

    expect(result[0]?.command).toBe("npm install");
  });

  it("uses serve only when start is absent and chooses the sorted test key", () => {
    const result = manifestReaderCommands(
      commandInput({
        scripts: {
          "test:z": "ignored z",
          serve: "ignored serve",
          "test:a": "ignored a",
        },
      }),
    );

    expect(result.map(({ kind, command }) => ({ kind, command }))).toEqual([
      { kind: "install", command: "npm install" },
      { kind: "run", command: "npm run serve" },
      { kind: "test", command: "npm run test:a" },
    ]);
  });

  it("derives commands only from keys and never retains hostile script bodies", () => {
    const credential = "TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const result = manifestReaderCommands(
      commandInput({
        scripts: {
          dev: credential,
          test: `rm -rf / && ${credential}`,
        },
      }),
    );

    expect(result.map(({ command }) => command)).toEqual([
      "npm install",
      "npm run dev",
      "npm run test",
    ]);
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it.each([
    ["invalid JSON", "{"],
    ["array root", "[]"],
    ["missing scripts", "{}"],
    ["array scripts", JSON.stringify({ scripts: [] })],
    ["string scripts", JSON.stringify({ scripts: "dev" })],
    [
      "more than 128 script keys",
      JSON.stringify({
        scripts: Object.fromEntries(
          Array.from({ length: 129 }, (_, index) => [
            `task:${String(index)}`,
            "safe",
          ]),
        ),
      }),
    ],
    ["selected non-string script", JSON.stringify({ scripts: { dev: 1 } })],
    [
      "oversized manifest",
      JSON.stringify({ scripts: {}, padding: "x".repeat(256 * 1024) }),
    ],
  ])("fails closed for %s", (_label, text) => {
    expect(manifestReaderCommands(commandInput({ text }))).toEqual([]);
  });

  it("derives only the install command from an empty scripts record", () => {
    expect(manifestReaderCommands(commandInput({ scripts: {} }))).toMatchObject(
      [{ kind: "install", command: "npm install", disposition: "ready" }],
    );
  });

  it("never recurses into nested manifest values for scripts", () => {
    expect(
      manifestReaderCommands(
        commandInput({
          text: JSON.stringify({ nested: { scripts: { dev: "vite" } } }),
        }),
      ),
    ).toEqual([]);
  });

  it("does not select a nested package or infer non-JavaScript ecosystem commands", () => {
    expect(
      manifestReaderCommands(
        commandInput({
          fetchedPath: "packages/app/package.json",
          treePaths: [
            "packages/app/package.json",
            "packages/app/pnpm-lock.yaml",
          ],
          scripts,
        }),
      ),
    ).toEqual([]);

    const goMod = manifestFile("go.mod", "module example.invalid/tool");
    expect(
      manifestReaderCommands({
        tree: {
          complete: true,
          skippedEntries: [],
          files: [treeFile("go.mod", goMod.bytes), treeFile("main.go", 20)],
        },
        files: [goMod],
      }),
    ).toEqual([]);
  });

  it("fails closed when the root manifest is absent from the tree or duplicated in fetched files", () => {
    const duplicate = manifestFile(
      "package.json",
      JSON.stringify({ scripts: { dev: "second" } }),
    );

    expect(
      manifestReaderCommands(
        commandInput({ scripts, treePaths: ["README.md"] }),
      ),
    ).toEqual([]);
    expect(
      manifestReaderCommands(
        commandInput({ scripts, extraFiles: [duplicate] }),
      ),
    ).toEqual([]);
  });

  it("withholds an unsafe selected script key without retaining it", () => {
    const credential = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const result = manifestReaderCommands(
      commandInput({ scripts: { [`test:TOKEN=${credential}`]: "safe body" } }),
    );

    expect(result).toEqual([
      {
        source: "manifest",
        path: "package.json",
        kind: "install",
        command: "npm install",
        disposition: "ready",
      },
      {
        source: "manifest",
        path: "package.json",
        kind: "test",
        command: null,
        disposition: "withheld",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it("does not mutate frozen inputs and remains bounded at 128 keys", () => {
    const scriptsAtLimit = Object.fromEntries(
      Array.from({ length: 127 }, (_, index) => [
        `task:${String(index)}`,
        "safe",
      ]),
    );
    scriptsAtLimit.build = "ignored body";
    const input = commandInput({ scripts: scriptsAtLimit });
    Object.freeze(input.tree.files);
    Object.freeze(input.tree);
    Object.freeze(input.files);
    Object.freeze(input);
    const before = structuredClone(input);
    const started = performance.now();
    const result = manifestReaderCommands(input);

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(input).toEqual(before);
    expect(result.map(({ kind }) => kind)).toEqual(["install", "build"]);
  });
});
