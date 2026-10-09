// Reads saved DOCX body text without following links or interpreting embedded instructions.
import JSZip from "jszip";
import type { Readable } from "node:stream";
import { SaxesParser } from "saxes";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function readSavedDocumentText(buffer: Buffer): Promise<string[]> {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("document_too_large");
  const archive = await JSZip.loadAsync(buffer);
  const body = archive.file("word/document.xml");
  if (!body) throw new Error("document_body_missing");
  // Limit the expanded XML as it streams, including highly compressed archives.
  const xml = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = body.nodeStream("nodebuffer") as Readable;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_XML_BYTES) { reject(new Error("document_body_too_large")); stream.destroy(); }
      else chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
  const paragraphs: string[] = [];
  let paragraph = "";
  let textDepth = 0;
  let deletedDepth = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => { throw new Error("document_doctype_not_allowed"); });
  parser.on("opentag", (tag) => {
    if (tag.uri !== WORD_NS) return;
    if (tag.local === "del") deletedDepth++;
    if (deletedDepth) return;
    if (tag.local === "t") textDepth++;
    if (tag.local === "tab") paragraph += "\t";
    if (tag.local === "br") paragraph += "\n";
  });
  parser.on("text", (value) => { if (textDepth && !deletedDepth) paragraph += value; });
  parser.on("closetag", (tag) => {
    if (tag.uri !== WORD_NS) return;
    if (tag.local === "del") { deletedDepth--; return; }
    if (deletedDepth) return;
    if (tag.local === "t") textDepth--;
    if (tag.local === "p") {
      if (paragraph.trim()) paragraphs.push(paragraph.trim());
      paragraph = "";
    }
  });
  parser.write(xml).close();
  if (!paragraphs.length) throw new Error("document_body_empty");
  return paragraphs;
}
