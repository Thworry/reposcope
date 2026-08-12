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

export interface TopLevelBindingMetadata {
  finalNames: string[];
  namesBeforeImport: ReadonlyMap<number, ReadonlySet<string>>;
}

export interface BindingFlowContext {
  nodes: readonly PythonNode[];
  text: string;
  namesBeforeImport: Map<number, ReadonlySet<string>>;
}

export interface BindingFlowResult {
  normal: Set<string>;
  exceptional: Set<string> | null;
  breaks?: Set<string> | null;
  continues?: Set<string> | null;
  returns?: Set<string> | null;
  normalReachable?: boolean;
}

export const MAX_BINDING_FLOW_DEPTH = 128;
