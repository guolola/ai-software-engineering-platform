// Exposes only current project document bodies with explicit extraction and provenance limits.
import { createHash } from "node:crypto";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { readSavedDocumentText } from "../../documents/context/saved-document-text.js";
import { contentHash, type SourceArtifact } from "./source-artifacts.js";

export async function readDocumentSources(library: DocumentLibrary, projectId: string): Promise<SourceArtifact[]> {
  const documents = (await library.listAllDocuments({ projectId }))
    .filter((item) => item.projectId === projectId && item.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (documents.length > 100) throw new Error("Too many project documents to read consistently");
  const artifacts: SourceArtifact[] = [];
  for (const item of documents) {
    let paragraphs: string[] = [];
    let bodyHash: string | null = null;
    const issues: string[] = [];
    try {
      if (item.byteLength > 20 * 1024 * 1024) throw new Error("document_too_large");
      const buffer = await library.getDocumentBuffer(item.workspaceId, item.id);
      if (!buffer) throw new Error("document_missing");
      bodyHash = `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
      paragraphs = await readSavedDocumentText(buffer);
      // A save or deletion during extraction must not become a mixed-version source.
      const after = await library.getDocument(item.workspaceId, item.id);
      if (!after || after.version !== item.version || after.projectId !== projectId || after.status !== "active") {
        throw new Error("document_changed_during_read");
      }
    } catch {
      paragraphs = [];
      issues.push("说明书正文无法完整读取或读取期间已变化；请在平台检查后重新读取，不能认定相关约束已覆盖。");
    }
    const id = `document:${item.id}`;
    const payload = {
      document: { id: item.id, kind: item.documentKind, title: item.title, version: item.version, contentHash: bodyHash },
      readStatus: issues.length ? "unavailable" : "available",
      paragraphs,
      limitations: [
        "只读取当前已保存 DOCX 的正文文字（含表格单元格文字）；不含图片、嵌入对象、批注、页眉页脚和未保存编辑。",
        "说明书与当前需求/模型的语义一致性和生成来源未经核验；同类多份说明书不自动判定哪份优先，约束矛盾必须列出。",
      ],
    };
    artifacts.push({
      id, stage: "documents", title: item.title, requirementIds: [], dependencies: [],
      reviewStatus: "unknown", sourceConsistency: "unknown", issues, payload,
      version: { artifactId: id, contentHash: contentHash({ payload, issues }), inputFingerprint: null, freshness: "unknown" },
    });
  }
  return artifacts;
}
