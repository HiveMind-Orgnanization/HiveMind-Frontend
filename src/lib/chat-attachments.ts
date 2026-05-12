/**
 * Client-side file ingestion for chat composer attachments.
 *
 * Three categories, each handled differently because the LLM only consumes
 * text and the persist layer only stores artifact contents — there's no
 * dedicated binary upload endpoint:
 *
 *   1. text / code / markdown — read as UTF-8, attached as a fenced code
 *      block in the next prompt. Saved as a mission artifact under uploads/.
 *   2. PDF — parsed client-side with pdfjs-dist. Extracted text is treated
 *      the same as a markdown upload.
 *   3. image — read as a base64 data URL for inline chip preview. Most of
 *      our agents are text-only Groq/OpenAI calls without vision, so the
 *      content can't go into the prompt; the agent gets a textual
 *      reference like "Reference image: uploads/<name>.png — operator
 *      attached a screenshot". Stored as a mission artifact so it shows
 *      up in the file tree alongside the rest of the project.
 *
 * Returns a normalized ChatAttachment so the composer doesn't need to know
 * about the underlying parsing pipeline.
 */
export type ChatAttachmentKind = "image" | "text" | "pdf";

export type ChatAttachment = {
  id: string;
  kind: ChatAttachmentKind;
  name: string;
  /** Suggested artifact path: `uploads/<safe-name>`. */
  path: string;
  /** Bytes (approx) — for the chip preview line. */
  sizeBytes: number;
  /** Image-only: base64 data URL for the preview thumbnail. */
  dataUrl?: string;
  /** Text/PDF: extracted UTF-8 text content. */
  text?: string;
  /** MIME type from the File API. */
  mime: string;
};

const IMAGE_MIME_RE = /^image\//i;
const PDF_MIME_RE = /^application\/pdf$/i;
const TEXT_EXT_RE = /\.(txt|md|markdown|json|jsonl|xml|csv|tsv|ts|tsx|js|jsx|mjs|cjs|css|scss|sass|less|html|htm|svg|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cc|hh|cs|php|sh|bash|zsh|fish|yml|yaml|toml|ini|env|conf|cfg|sql|graphql|gql|prisma|astro|vue|svelte|lua|r|jl|ex|exs|elm|hs|clj|cljs|ml|fs|fsx|nim|dart|gd|wasm\.txt)$/i;

export const ACCEPTED_FILE_TYPES =
  "image/*," +
  "application/pdf," +
  ".txt,.md,.markdown,.json,.xml,.csv,.tsv," +
  ".ts,.tsx,.js,.jsx,.mjs,.cjs," +
  ".css,.scss,.sass,.less,.html,.htm,.svg," +
  ".py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cc,.hh,.cs,.php," +
  ".sh,.bash,.yml,.yaml,.toml,.ini,.env,.conf,.cfg,.sql,.graphql,.gql," +
  ".prisma,.astro,.vue,.svelte,.lua,.r,.jl,.ex,.exs,.elm,.hs,.clj,.cljs," +
  ".ml,.fs,.fsx,.nim,.dart,.gd";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file — keeps prompt size sane

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function classify(file: File): ChatAttachmentKind | null {
  if (IMAGE_MIME_RE.test(file.type)) return "image";
  if (PDF_MIME_RE.test(file.type) || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("text/") || TEXT_EXT_RE.test(file.name) || file.type === "application/json") return "text";
  return null;
}

async function readAsText(file: File): Promise<string> {
  return await file.text();
}

async function readAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Lazy-load pdfjs to keep the dashboard bundle small — most users never
 * attach a PDF, so we avoid paying the 600 KB cost up front. We also set
 * the worker source to the bundled mjs so Vite serves it correctly.
 */
async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n\n").trim();
}

export async function ingestFile(file: File): Promise<ChatAttachment | { error: string }> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: `${file.name} is over 8 MB. Trim it and try again.` };
  }
  const kind = classify(file);
  if (!kind) {
    return { error: `${file.name}: unsupported file type. Use image, PDF, or text/code.` };
  }
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeName(file.name);
  const path = `uploads/${safeName}`;
  try {
    if (kind === "image") {
      const dataUrl = await readAsDataUrl(file);
      return {
        id, kind, name: file.name, path, sizeBytes: file.size, dataUrl,
        mime: file.type || "image/*",
      };
    }
    if (kind === "pdf") {
      const text = await readPdfText(file);
      return {
        id, kind, name: file.name, path, sizeBytes: file.size, text,
        mime: file.type || "application/pdf",
      };
    }
    const text = await readAsText(file);
    return {
      id, kind, name: file.name, path, sizeBytes: file.size, text,
      mime: file.type || "text/plain",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `${file.name}: ${msg.slice(0, 120)}` };
  }
}

/**
 * Build a context block that gets prepended to the user's message so agents
 * see the attachment contents. Each text/PDF file gets a fenced code block;
 * images get a one-line reference (no inline base64 — that would balloon the
 * prompt to MB).
 */
export function buildAttachmentContextBlock(attachments: ChatAttachment[]): string {
  if (attachments.length === 0) return "";
  const lines: string[] = [];
  lines.push("## Operator attached files");
  lines.push("");
  for (const a of attachments) {
    lines.push(`### ${a.path}`);
    lines.push(`Type: ${a.kind} · Size: ${formatBytes(a.sizeBytes)}`);
    if (a.kind === "image") {
      lines.push(`Image reference saved at \`${a.path}\`. Reference it in your design/copy as appropriate.`);
    } else if (a.text && a.text.trim().length > 0) {
      lines.push("");
      lines.push("```");
      // Truncate to ~16 KB per file to keep prompts manageable; agents always
      // get the most informative head/tail of the document.
      lines.push(a.text.length > 16_000 ? `${a.text.slice(0, 14_000)}\n…\n${a.text.slice(-1500)}` : a.text);
      lines.push("```");
    } else {
      lines.push("(no extractable text)");
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
