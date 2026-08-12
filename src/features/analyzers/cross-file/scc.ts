import { comparePathValues } from "./path-order";

export function stronglyConnectedComponents(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    const index = nextIndex;

    nextIndex += 1;
    indices.set(node, index);
    lowLinks.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? index, lowLinks.get(target) ?? index),
        );
      } else if (onStack.has(target)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? index, indices.get(target) ?? index),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component: string[] = [];
    for (;;) {
      const member = stack.pop();

      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
    }
    components.push(component.sort(comparePathValues));
  };

  for (const node of [...graph.keys()].sort(comparePathValues)) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return components;
}

export function compareComponents(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length !== right.length) {
    return right.length - left.length;
  }
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = comparePathValues(left[index] ?? "", right[index] ?? "");

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}
