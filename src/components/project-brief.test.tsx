/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ProjectBrief,
  ProjectBriefCaution,
} from "../features/analysis/model";
import { ProjectBriefView } from "./project-brief";

const commitSha = "a".repeat(40);

const completeBrief = {
  excerpts: [
    {
      source: "github-description",
      text: '<img src=x onerror="alert(1)">',
      path: null,
    },
    {
      source: "readme",
      text: "Compares public API schemas.",
      path: "docs/README.md",
    },
  ],
  kinds: [
    {
      kind: "command-line-tool",
      source: "manifest",
      path: "package.json",
    },
  ],
  cautions: [
    {
      caution: "license-evidence-absent",
      source: "analysis",
      path: null,
    },
  ],
} satisfies ProjectBrief;

describe("ProjectBriefView", () => {
  it("renders a semantic English brief and treats repository prose as text", () => {
    const { container } = render(
      <ProjectBriefView
        brief={completeBrief}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="en"
      />,
    );

    const region = screen.getByRole("region", { name: "Project brief" });
    expect(
      within(region).getByRole("heading", {
        level: 3,
        name: "Project brief",
      }),
    ).toBeVisible();
    for (const name of [
      "What it does",
      "Likely fit",
      "What it is",
      "Before you use it",
    ]) {
      expect(
        within(region).getByRole("heading", { level: 4, name }),
      ).toBeVisible();
    }

    expect(
      within(region).getByText('<img src=x onerror="alert(1)">'),
    ).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
    expect(within(region).getByText("Command-line tool")).toBeVisible();
    expect(
      within(region).getByText(
        "Worth considering if you need a Command-line tool for the stated purpose above.",
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole("link", {
        name: /README\.md at inspected commit/i,
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/docs/README.md`,
    );
    expect(
      within(region).getByRole("link", {
        name: /package\.json at inspected commit/i,
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/package.json`,
    );
  });

  it("localizes structure without changing repository-authored prose", () => {
    const bilingualBrief = {
      ...completeBrief,
      excerpts: [
        {
          source: "github-description",
          text: "English purpose — 中文用途。",
          path: null,
        },
      ],
    } satisfies ProjectBrief;
    const { rerender } = render(
      <ProjectBriefView
        brief={bilingualBrief}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="en"
      />,
    );

    const sourceText = screen.getByText("English purpose — 中文用途。");
    expect(sourceText.textContent).toBe("English purpose — 中文用途。");

    rerender(
      <ProjectBriefView
        brief={bilingualBrief}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="zh-CN"
      />,
    );

    expect(screen.getByRole("region", { name: "项目速览" })).toBeVisible();
    for (const name of ["项目用途", "可能适用", "项目类型", "使用前注意"]) {
      expect(screen.getByRole("heading", { level: 4, name })).toBeVisible();
    }
    expect(screen.getByText("English purpose — 中文用途。").textContent).toBe(
      "English purpose — 中文用途。",
    );
    expect(screen.getByText("命令行工具")).toBeVisible();
    expect(screen.queryByText("Command-line tool")).toBeNull();
  });

  it("renders honest purpose and kind fallbacks without inventing a source link", () => {
    render(
      <ProjectBriefView
        brief={{ excerpts: [], kinds: [], cautions: [] }}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="en"
      />,
    );

    expect(
      screen.getByText(
        "Public repository evidence is insufficient to explain this project reliably.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Compare the stated purpose with your needs; the repository type could not be established reliably.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Unknown from public evidence.")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each<[ProjectBriefCaution, string]>([
    ["archived", "This repository is archived."],
    [
      "insufficient-explanation",
      "The public description and README do not explain the project clearly enough.",
    ],
    ["license-evidence-absent", "No recognized license evidence was detected."],
    [
      "entry-point-evidence-absent",
      "No structured or conventional entry point was detected.",
    ],
  ])("renders the %s caution with its source", (caution, expected) => {
    render(
      <ProjectBriefView
        brief={{
          excerpts: [],
          kinds: [],
          cautions: [
            {
              caution,
              source: caution === "archived" ? "github-metadata" : "analysis",
              path: null,
            },
          ],
        }}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="en"
      />,
    );

    const item = screen.getByText(expected).closest("li");
    expect(item).not.toBeNull();
    expect(item).toHaveTextContent(
      caution === "archived"
        ? "GitHub repository metadata"
        : "Repository inspection evidence",
    );
  });

  it("encodes owner, repository, and each evidence path segment independently", () => {
    render(
      <ProjectBriefView
        brief={{
          excerpts: [
            {
              source: "readme",
              text: "Purpose.",
              path: "docs & notes/README #1.md",
            },
          ],
          kinds: [],
          cautions: [],
        }}
        owner="owner name"
        repo="repo#name"
        commitSha={commitSha}
        language="en"
      />,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://github.com/owner%20name/repo%23name/blob/${commitSha}/docs%20%26%20notes/README%20%231.md`,
    );
  });

  it("formats multiple kinds and keeps each structural source adjacent", () => {
    render(
      <ProjectBriefView
        brief={{
          excerpts: [
            {
              source: "github-description",
              text: "A composable command-line package.",
              path: null,
            },
          ],
          kinds: [
            {
              kind: "command-line-tool",
              source: "tree",
              path: "src/cli entry.ts",
            },
            {
              kind: "library",
              source: "github-metadata",
              path: null,
            },
          ],
          cautions: [],
        }}
        owner="owner"
        repo="repo"
        commitSha={commitSha}
        language="en"
      />,
    );

    expect(
      screen.getByText(
        "Worth considering if you need a Command-line tool and Library for the stated purpose above.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "src/cli entry.ts at inspected commit",
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/src/cli%20entry.ts`,
    );
    const libraryItem = screen.getByText("Library").closest("li");
    expect(libraryItem).not.toBeNull();
    expect(libraryItem).toHaveTextContent("GitHub repository metadata");
  });

  it("keeps evidence links touch-sized and long content wrap-safe", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

    expect(css).toMatch(
      /\.project-brief__source\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
    expect(css).toMatch(
      /\.project-brief blockquote,[\s\S]*?\.project-brief a\s*\{[^}]*overflow-wrap:\s*anywhere/isu,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*64rem\)[\s\S]*?\.project-brief__grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.4fr\)\s+minmax\(16rem,\s*0\.6fr\)/isu,
    );
  });
});
