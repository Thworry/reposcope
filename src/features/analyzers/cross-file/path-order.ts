export function comparisonPath(path: string): string {
  return path.toLocaleLowerCase("en-US");
}

export function comparePathValues(left: string, right: string): number {
  const normalizedLeft = comparisonPath(left);
  const normalizedRight = comparisonPath(right);

  return (
    normalizedLeft.localeCompare(normalizedRight, "en-US") ||
    left.localeCompare(right, "en-US")
  );
}
