export interface PythonNode {
  type: string;
  from: number;
  to: number;
  parent: number | null;
  children: number[];
  error: boolean;
}

export interface MetricEntry {
  index: number;
  depth: number;
}

export type LineLookup = (offset: number) => number;
