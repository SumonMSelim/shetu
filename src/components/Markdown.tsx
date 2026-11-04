"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant messages written in Markdown.
 *
 * Uses react-markdown (no raw HTML, so model output cannot inject markup) plus
 * remark-gfm for tables, strikethrough, and autolinks. Element styles are kept
 * inline so the component is self-contained and matches the chat theme. Links
 * open in a new tab and carry rel="noopener" since they point to external
 * official sources.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="shetu-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "10px 0" }}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
      <style>{`
        .shetu-md { font-size: 15.5px; line-height: 1.65; }
        .shetu-md > :first-child { margin-top: 0; }
        .shetu-md > :last-child { margin-bottom: 0; }
        .shetu-md p { margin: 0 0 10px; }
        .shetu-md h1, .shetu-md h2, .shetu-md h3, .shetu-md h4 {
          margin: 16px 0 8px; line-height: 1.3; font-weight: 700;
        }
        .shetu-md h1 { font-size: 20px; }
        .shetu-md h2 { font-size: 18px; }
        .shetu-md h3 { font-size: 16.5px; }
        .shetu-md h4 { font-size: 15.5px; }
        .shetu-md ul, .shetu-md ol { margin: 0 0 10px; padding-left: 22px; }
        .shetu-md li { margin: 0 0 5px; }
        .shetu-md a { color: var(--primary-dark); text-decoration: underline; word-break: break-word; }
        .shetu-md code {
          background: rgba(16, 163, 127, 0.1); padding: 1px 5px; border-radius: 5px;
          font-size: 13.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .shetu-md pre {
          background: #0f2a22; color: #eafaf4; padding: 12px 14px; border-radius: 10px;
          overflow-x: auto; margin: 10px 0;
        }
        .shetu-md pre code { background: transparent; padding: 0; color: inherit; }
        .shetu-md table { border-collapse: collapse; width: 100%; font-size: 14px; }
        .shetu-md th, .shetu-md td {
          border: 1px solid var(--border); padding: 7px 10px; text-align: left; vertical-align: top;
        }
        .shetu-md th { background: var(--bg); font-weight: 700; }
        .shetu-md blockquote {
          margin: 10px 0; padding: 6px 14px; border-left: 3px solid var(--primary);
          background: var(--bg); border-radius: 0 8px 8px 0;
        }
        .shetu-md hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
      `}</style>
    </div>
  );
}
