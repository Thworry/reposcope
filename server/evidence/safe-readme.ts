import type { EvidenceTextFile } from "../github/model.js";
import type { SanitizedEvidenceDocument } from "./model.js";
import { sanitizeEvidenceDocument } from "./safe-document.js";

export function sanitizeReadmeForModel(
  file: EvidenceTextFile,
): SanitizedEvidenceDocument {
  return sanitizeEvidenceDocument(file, "readme");
}
