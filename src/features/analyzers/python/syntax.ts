import type { TreeCursor } from "@lezer/common";
import { parser } from "@lezer/python";

import type { LineLookup, PythonNode } from "./model";

function flattenCursor(cursor: TreeCursor): PythonNode[] {
  const nodes: PythonNode[] = [];
  const parents: number[] = [];

  for (;;) {
    const parent = parents.at(-1) ?? null;
    const index = nodes.length;
    const node: PythonNode = {
      type: cursor.type.name,
      from: cursor.from,
      to: cursor.to,
      parent,
      children: [],
      error: cursor.type.isError,
    };

    nodes.push(node);
    if (parent !== null) {
      nodes[parent]?.children.push(index);
    }

    if (cursor.firstChild()) {
      parents.push(index);
      continue;
    }

    while (!cursor.nextSibling()) {
      if (!cursor.parent()) {
        return nodes;
      }
      parents.pop();
    }
  }
}

export function parsePython(text: string): PythonNode[] | null {
  try {
    const nodes = flattenCursor(parser.parse(text).cursor());

    return nodes.some((node) => node.error) ? null : nodes;
  } catch {
    return null;
  }
}

export function nodeText(node: PythonNode, text: string): string {
  return text.slice(node.from, node.to);
}

export function nodeTextAt(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): string {
  const node = nodes[index];

  return node === undefined ? "" : nodeText(node, text);
}

export function createPythonLineLookup(text: string): LineLookup {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number): number => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
      throw new Error("Invalid text offset");
    }

    let low = 0;
    let high = lineStarts.length;

    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const start = lineStarts[middle];

      if (start !== undefined && start <= offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  };
}

function firstLineAtOrAfter(lines: readonly number[], target: number): number {
  let low = 0;
  let high = lines.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const line = lines[middle];

    if (line !== undefined && line < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function logicalLinesInRange(
  lines: readonly number[],
  startLine: number,
  endLine: number,
): number {
  return (
    firstLineAtOrAfter(lines, endLine + 1) -
    firstLineAtOrAfter(lines, startLine)
  );
}
