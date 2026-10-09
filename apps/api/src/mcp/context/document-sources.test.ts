// Verifies current DOCX text extraction, project isolation and version-bound document sources.
import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import type { DocumentLibrary, } from "../../documents/library/document-library.js";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import { readSavedDocumentText } from "../../documents/context/saved-document-text.js";
import { readDocumentSources } from "./document-sources.js";
import { buildContext, compareManifest } from "./implementation-context.js";

async function docx(body: string) {
  return new JSZip().file("word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>'
  ).generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
function item(id: string, projectId = "project-a"): DocumentLibraryItem {
  return { id, workspaceId: "workspace", projectId, documentKind: "softwareDesignSpec", title: "借阅设计说明书",
    fileName: "design.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 1, version: 1, status: "active", sourceRunId: null, createdAt: "now", updatedAt: "now" };
}
test("reads paragraph and table body text, decoding XML while omitting removed text and field instructions", async () => {
  const buffer = await docx('<w:p><w:r><w:t>最多借 &lt; 6 本</w:t></w:r><w:del><w:r><w:delText>旧规则</w:delText></w:r></w:del><w:r><w:instrText>SECRET FIELD</w:instrText></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>权限：学生 &amp; 管理员</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
  assert.deepEqual(await readSavedDocumentText(buffer), ["最多借 < 6 本", "权限：学生 & 管理员"]);
  await assert.rejects(readSavedDocumentText(Buffer.from("not a docx")));
  const bomb = await docx("<w:p><w:r><w:t>" + "a".repeat(4 * 1024 * 1024) + "</w:t></w:r></w:p>");
  await assert.rejects(readSavedDocumentText(bomb), /too_large/);
});
test("only current active project documents enter the snapshot, and saved body changes invalidate versions", async () => {
  let current = item("doc-a");
  let buffer = await docx("<w:p><w:r><w:t>每人最多借5本</w:t></w:r></w:p>");
  const reads: string[] = [];
  const library = {
    async listAllDocuments() { return [current, item("other", "project-b"), { ...item("deleted"), status: "deleted" }]; },
    async getDocumentBuffer(_workspace: string, id: string) { reads.push(id); return buffer; },
    async getDocument() { return current; },
  } as unknown as DocumentLibrary;
  const before = await readDocumentSources(library, "project-a");
  assert.deepEqual(reads, ["doc-a"]);
  assert.equal(before[0].payload.readStatus, "available");
  assert.doesNotMatch(JSON.stringify(before), /workspaceId|createdByUserId|sourceRunId/);
  const scope = { requirementIds: [], artifactIds: [] };
  const initial = buildContext({}, scope, before);
  buffer = await docx("<w:p><w:r><w:t>每人最多借8本</w:t></w:r></w:p>");
  current = { ...current, version: 2 };
  const changed = buildContext({}, scope, await readDocumentSources(library, "project-a"));
  assert.notEqual(initial.version, changed.version);
  assert.equal(compareManifest(initial.manifest, changed.manifest)[0].change, "modified");
});
test("save races and unreadable bodies produce explicit unavailable sources instead of silent omission", async () => {
  const original = item("doc-a");
  const library = {
    async listAllDocuments() { return [original]; },
    async getDocumentBuffer() { return docx("<w:p><w:r><w:t>旧版本</w:t></w:r></w:p>"); },
    async getDocument() { return { ...original, version: 2 }; },
  } as unknown as DocumentLibrary;
  const sources = await readDocumentSources(library, "project-a");
  assert.equal(sources[0].payload.readStatus, "unavailable");
  assert.deepEqual(sources[0].payload.paragraphs, []);
  assert.ok(sources[0].issues.length);
});
