/**
 * Partial-JSON parser tuned for the swarm "live coding" feature.
 *
 * The LLM emits a single JSON envelope per role:
 *
 *   {
 *     "summary": "...",
 *     "artifacts": [
 *       { "path": "frontend/src/App.tsx", "language": "tsx", "content": "import React..." },
 *       { "path": "frontend/package.json", "language": "json", "content": "{ ... }" }
 *     ]
 *   }
 *
 * Until the model finishes generating, the buffer is malformed JSON — strings
 * are unterminated, arrays are open, etc. Standard JSON.parse would always
 * throw. We don't actually need to parse the whole envelope; the UI only wants
 * the path + content of the file currently being written. We can find that
 * deterministically with a small state machine that scans the buffer for the
 * most recent `"path": "<value>"` followed by `"content": "<value...>"`.
 *
 * Caveats this handles:
 *   - JSON string escape sequences (\n, \t, \", \\, \uXXXX)
 *   - Buffer ending mid-string (the in-flight file)
 *   - Buffer ending right after `"content":` but before the opening quote
 *   - Multiple completed artifacts followed by one in-flight artifact
 *
 * What it intentionally doesn't do:
 *   - Validate the full envelope structure
 *   - Distinguish completed files from in-flight ones (the caller doesn't
 *     care — it just renders whatever is most recent)
 */

export type StreamingArtifact = {
  /** File path the model is writing. */
  path: string;
  /** Partial content decoded so far (escape sequences resolved). */
  content: string;
  /**
   * True if the closing quote of "content" has been seen — i.e. this file's
   * write is complete and the model has moved on. Callers can choose to
   * de-emphasize the streaming pulse in that case.
   */
  completed: boolean;
};

/** Decode a JSON-escaped string body. Stops at the first unescaped `"`. Returns
 *  the decoded content and whether the closing quote was found. Input starts
 *  just AFTER the opening `"`. */
function decodeJsonString(input: string, startIndex: number): { content: string; endIndex: number; closed: boolean } {
  let out = "";
  let i = startIndex;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '"') {
      return { content: out, endIndex: i, closed: true };
    }
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[i + 1]!;
      switch (next) {
        case "n": out += "\n"; i += 2; break;
        case "t": out += "\t"; i += 2; break;
        case "r": out += "\r"; i += 2; break;
        case '"': out += '"';  i += 2; break;
        case "\\": out += "\\"; i += 2; break;
        case "/": out += "/";  i += 2; break;
        case "b": out += "\b"; i += 2; break;
        case "f": out += "\f"; i += 2; break;
        case "u": {
          if (i + 5 < input.length) {
            const hex = input.slice(i + 2, i + 6);
            const code = Number.parseInt(hex, 16);
            if (Number.isFinite(code)) {
              out += String.fromCharCode(code);
              i += 6;
              break;
            }
          }
          // Incomplete \u escape at end of buffer — stop, caller will see
          // it on the next chunk when the rest arrives.
          return { content: out, endIndex: i, closed: false };
        }
        default:
          out += next;
          i += 2;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return { content: out, endIndex: i, closed: false };
}

/** Find the start index of the value of a JSON string field. Returns the index
 *  of the character just AFTER the opening quote, or -1 if not found. */
function findFieldValueStart(buffer: string, fieldName: string, searchStart: number): number {
  // The exact match: `"fieldName"` followed by optional whitespace, then `:`,
  // optional whitespace, then `"`.
  const needle = `"${fieldName}"`;
  let idx = searchStart;
  while (true) {
    const found = buffer.indexOf(needle, idx);
    if (found < 0) return -1;
    let j = found + needle.length;
    // skip whitespace
    while (j < buffer.length && /\s/.test(buffer[j]!)) j += 1;
    if (buffer[j] !== ":") {
      idx = found + needle.length;
      continue;
    }
    j += 1;
    while (j < buffer.length && /\s/.test(buffer[j]!)) j += 1;
    if (buffer[j] !== '"') return -1; // no opening quote yet — wait for more
    return j + 1;
  }
}

/** Extract the most recently-started artifact (path + partial content) from a
 *  buffer that may be mid-write. Returns null if no path/content pair has
 *  begun yet (still streaming the envelope preamble or the summary field). */
export function parseStreamingArtifact(buffer: string): StreamingArtifact | null {
  if (!buffer || buffer.length < 12) return null;
  // Walk forward through `"path"` occurrences, tracking the latest one that's
  // followed by a `"content"`. The last such pair is the file in flight.
  let cursor = 0;
  let latest: StreamingArtifact | null = null;
  while (cursor < buffer.length) {
    const pathStart = findFieldValueStart(buffer, "path", cursor);
    if (pathStart < 0) break;
    const pathDecoded = decodeJsonString(buffer, pathStart);
    if (!pathDecoded.closed) {
      // path is itself still streaming — we can't show a file without a path,
      // so fall back to whatever we had previously. (Rare: paths are short.)
      return latest;
    }
    const contentStart = findFieldValueStart(buffer, "content", pathDecoded.endIndex + 1);
    if (contentStart < 0) {
      // Path complete but `"content":"` hasn't begun streaming yet. Return
      // the path with empty content so the UI can already open the file.
      latest = { path: pathDecoded.content, content: "", completed: false };
      break;
    }
    const contentDecoded = decodeJsonString(buffer, contentStart);
    latest = {
      path: pathDecoded.content,
      content: contentDecoded.content,
      completed: contentDecoded.closed,
    };
    if (!contentDecoded.closed) break; // we're inside the in-flight file — stop here
    cursor = contentDecoded.endIndex + 1;
  }
  return latest;
}
