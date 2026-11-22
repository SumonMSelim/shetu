/**
 * Answer text filters (pure, unit-tested).
 *
 * 1. ThinkingFilter: Nova-family models sometimes emit their reasoning as
 *    plain `<thinking>...</thinking>` text. The student must never see it, so
 *    the chat stream pushes every text delta through this stateful filter,
 *    which suppresses anything inside the tags and handles tags split across
 *    deltas.
 *
 * 2. sanitizeAnswerLinks: models occasionally invent plausible-looking URLs
 *    (for example turning an internal tool name into a link on a domain we do
 *    not own). Markdown links whose host is not in the allowlist — built from
 *    the URLs the tools actually returned, plus our own pages — are reduced
 *    to their link text. An unverifiable link must not render as a link.
 */

const OPEN = "<thinking>";
const CLOSE = "</thinking>";

export class ThinkingFilter {
  private buffer = "";
  private inThinking = false;

  /** Longest suffix of `text` that is a prefix of `tag` (partial-tag hold). */
  private static holdPartial(text: string, tag: string): number {
    for (let len = Math.min(text.length, tag.length - 1); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }

  push(delta: string): string {
    this.buffer += delta;
    let out = "";
    for (;;) {
      if (!this.inThinking) {
        const open = this.buffer.indexOf(OPEN);
        if (open === -1) {
          const hold = ThinkingFilter.holdPartial(this.buffer, OPEN);
          out += this.buffer.slice(0, this.buffer.length - hold);
          this.buffer = this.buffer.slice(this.buffer.length - hold);
          return out;
        }
        out += this.buffer.slice(0, open);
        this.buffer = this.buffer.slice(open + OPEN.length);
        this.inThinking = true;
        continue;
      }
      const close = this.buffer.indexOf(CLOSE);
      if (close === -1) {
        const hold = ThinkingFilter.holdPartial(this.buffer, CLOSE);
        this.buffer = this.buffer.slice(this.buffer.length - hold);
        return out; // suppress everything inside thinking
      }
      this.buffer = this.buffer.slice(close + CLOSE.length);
      this.inThinking = false;
    }
  }

  /** Emit what remains once the stream has ended. */
  flush(): string {
    if (this.inThinking) {
      this.buffer = "";
      return "";
    }
    const out = this.buffer;
    this.buffer = "";
    return out;
  }
}

/** Hosts allowed to appear as Markdown links in an answer. */
export function extractHosts(text: string): string[] {
  const hosts = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s"')\]]+/g)) {
    try {
      const u = new URL(match[0]);
      hosts.add(u.hostname.replace(/^www\./, ""));
    } catch {
      // Unparseable URL in tool output: ignore.
    }
  }
  return [...hosts];
}

/**
 * Reduce Markdown links whose host is not allowed to their link text. Text
 * outside links is untouched; an unverifiable link must not render as a link.
 */
export function sanitizeAnswerLinks(answer: string, allowedDomains: string[]): string {
  return answer.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (match, text: string, href: string) => {
    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return text;
    }
    const allowed = allowedDomains.some((d) => host === d || host.endsWith("." + d));
    return allowed ? match : text;
  });
}
