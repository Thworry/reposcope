import type { FetchedTextFile } from "../../features/analysis/model";

import { fetchedTextFile } from "./text-files";

export const JAVASCRIPT_TYPESCRIPT_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const;

export function sourceFile(
  path: string,
  text: string,
  overrides: Partial<FetchedTextFile> = {},
): FetchedTextFile {
  const language = /\.(?:ts|tsx|mts|cts)$/iu.test(path)
    ? "typescript"
    : "javascript";

  return fetchedTextFile(path, text, {
    language,
    category: "source",
    ...overrides,
  });
}

export const compactChoiceSource = `/** Choose a value. */
export function choose(value: number | null) {
  if (value && value > 1) return value;
  return value ?? 0;
}`;

export const syntaxCoverageSource = `
import defaultValue, { type Model, helper as hp } from "./helper";
import type { OnlyType } from "./types";
import packageValue from "package-name";
export { hp } from "./re-export";
export type { Model } from "./model";
const lazy = import("./lazy");
const common = require("./common");

const expression = function namedExpression(a: number) { return a; };
const arrow = (b: number) => b > 0 ? b : 0;
function iterate(items: number[], record: Record<string, number>) {
  for (const item of items) void item;
  for (const key in record) void key;
}
const objectValue = {
  method(c: number) { return c; },
  get current() { return 1; },
  set current(d: number) { if (d) this.value = d; },
  value: 0,
};

@sealed
export class Service {
  @logged
  run(input: number) {
    for (let index = 0; index < input; index += 1) {
      if (index % 2) continue;
    }
    while (input > 0) input -= 1;
    do { input += 1; } while (input < 0);
    try {
      switch (input) {
        case 1: return input;
        case 2: return input && defaultValue;
        default: throw new Error("bad");
      }
    } catch (err) {
      return (input || packageValue) ?? common;
    }
  }
}
`;

export const bindingCoverageSource = `
import { a as q, api as api } from "./bindings";
const { property: uv, short, ok } = value;
const xy = ({ key: ab, longName = 1 }, ...zz) => {
  label: for (const cd of zz) {
    const object = { ef: cd, gh() { return cd; } };
    return <Widget ij={object.ef} />;
  }
};
class IJ { kl(mn) { return mn; } }
`;

export const malformedSource = "export function broken( {";

export const declarationImportSource = `import { runtimeValue } from "./runtime";
import runtimeEquals = require("./runtime-equals");
export { runtimeExport } from "./runtime-export";
export * from "./runtime-all";
export declare const declaredValue: typeof runtimeValue;`;

export const nestedTestSource = `
export function outer(flag: boolean) {
  if (flag) {
    function inner() {
      while (flag) return true;
      return false;
    }
    return inner();
  } else {
    return false;
  }
}`;
