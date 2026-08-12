import type { ImportingFile } from "../../analysis/model";

export interface GraphFile {
  path: string;
  comparisonPath: string;
  language: ImportingFile["language"];
  relativeImports: readonly string[];
  relativeImportCandidates: readonly string[];
  topLevelDefinedNames: readonly string[];
}
