"use client";

// Tiny dependency-free markdown renderer for chat messages.

function inline(text, keyBase) {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(<code key={`${keyBase}-c${i}`}>{tok.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={`${keyBase}-i${i}`}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function InlineText({ text, kb }) {
  const parts = [];
  const blocks = text.split(/(\n)/g);
  let i = 0;
  for (const b of blocks) {
    if (b === "\n") continue;
    parts.push(<span key={`${kb}-s${i++}`}>{inline(b, `${kb}-${i}`)}</span>);
    parts.push(<br key={`${kb}-br${i}`} />);
  }
  return <>{parts}</>;
}

export default function Md({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (line.trim().startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={`pre${blocks.length}`}>
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // table
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      const split = (r) =>
        r
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const header = split(rows[0]);
      const body = rows.filter((r, idx) => idx !== 1 && r.includes("-") === false || idx > 1);
      blocks.push(
        <table key={`tbl${blocks.length}`}>
          <thead>
            <tr>
              {header.map((h, j) => (
                <th key={j}>{inline(h, `th${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {split(r).map((c, ci) => (
                  <td key={ci}>{inline(c, `td${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      const Tag = `h${Math.min(level + 1, 4)}`;
      blocks.push(<Tag key={`h${blocks.length}`}>{inline(h[2], `h${blocks.length}`)}</Tag>);
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`bq${blocks.length}`}>
          {buf.map((b, j) => (
            <span key={j}>
              <InlineText text={b} kb={`bq${blocks.length}-${j}`} />
            </span>
          ))}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul${blocks.length}`}>
          {items.map((it, j) => (
            <li key={j}>
              <InlineText text={it} kb={`li${j}`} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol${blocks.length}`}>
          {items.map((it, j) => (
            <li key={j}>
              <InlineText text={it} kb={`oli${j}`} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p${blocks.length}`}>
        <InlineText text={buf.join(" ")} kb={`p${blocks.length}`} />
      </p>
    );
  }

  return <div className="markdown-body">{blocks}</div>;
}