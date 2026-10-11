/*
 * Tiny Markdown renderer for chat answers.
 *
 * Handles what the model is asked to produce: headings, paragraphs,
 * bullet and numbered lists (nested by indentation), **bold**,
 * *italic*, `code`, and — just in case — simple tables.
 * It builds React elements directly (no innerHTML), so model output
 * can never inject markup.
 */

import { Fragment, type ReactNode } from "react";

/* ---------------- Inline: **bold**, *italic*, `code` ---------------- */

function renderInline(text: string, keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: bold (** or __) before italic (* or _)
  const pattern = /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\4(?![\w*])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[2] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {renderInline(match[2], key)}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key} className="rounded-md bg-black/30 px-1.5 py-0.5 text-[0.9em]">
          {match[3]}
        </code>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {renderInline(match[5], key)}
        </em>,
      );
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ---------------- Blocks ---------------- */

type ListItem = { text: string; children: ListBlock[] };
type ListBlock = { kind: "list"; ordered: boolean; items: ListItem[] };
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | ListBlock;

const LIST_ITEM = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/;

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Indentation width, treating tabs as 4 spaces */
const indentOf = (raw: string) => raw.replace(/\t/g, "    ").length;

function parseList(lines: string[], start: number): { block: ListBlock; next: number } {
  const first = lines[start].match(LIST_ITEM)!;
  const baseIndent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const block: ListBlock = { kind: "list", ordered, items: [] };
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // A blank line ends the list unless another item at this level follows
      const nextItem = lines.slice(i + 1).find((l) => l.trim());
      const m = nextItem?.match(LIST_ITEM);
      if (m && indentOf(m[1]) >= baseIndent) {
        i++;
        continue;
      }
      break;
    }

    const m = line.match(LIST_ITEM);
    if (m) {
      const indent = indentOf(m[1]);
      if (indent < baseIndent) break;
      if (indent > baseIndent && block.items.length) {
        const nested = parseList(lines, i);
        block.items[block.items.length - 1].children.push(nested.block);
        i = nested.next;
        continue;
      }
      if (/\d/.test(m[2]) !== ordered && indent === baseIndent && block.items.length) break;
      block.items.push({ text: m[3], children: [] });
      i++;
      continue;
    }

    // Continuation line of the previous item
    if (/^\s+\S/.test(line) && block.items.length) {
      block.items[block.items.length - 1].text += ` ${line.trim()}`;
      i++;
      continue;
    }
    break;
  }

  return { block, next: i };
}

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].replace(/#+$/, "").trim() });
      i++;
      continue;
    }

    // A line that is only bold text acts as a heading ("**Main pattern:**")
    const boldHeading = trimmed.match(/^\*\*([^*]+)\*\*:?$/);
    if (boldHeading) {
      blocks.push({ kind: "heading", level: 4, text: boldHeading[1].replace(/:$/, "") });
      i++;
      continue;
    }

    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:-]+\|[\s|:-]*$/)) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    // Paragraph: gather until a blank line or another block starts
    const paragraph: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !LIST_ITEM.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|")
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

/* ---------------- Rendering ---------------- */

function List({ block, depth = 0 }: { block: ListBlock; depth?: number }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag
      className={`space-y-1.5 pl-5 ${depth > 0 ? "mt-1.5" : ""} ${
        block.ordered ? "list-decimal marker:text-[#7fdcc0]" : "list-disc marker:text-[#3fae8f]"
      }`}
    >
      {block.items.map((item, index) => (
        <li key={index} className="pl-1">
          {renderInline(item.text, `li${depth}-${index}`)}
          {item.children.map((child, childIndex) => (
            <List key={childIndex} block={child} depth={depth + 1} />
          ))}
        </li>
      ))}
    </Tag>
  );
}

export default function Markdown({ children }: { children: string }) {
  const blocks = parse(children);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return block.level <= 3 ? (
              <h3 key={index} className={`text-base font-semibold text-white ${index > 0 ? "pt-2" : ""}`}>
                {renderInline(block.text, `h${index}`)}
              </h3>
            ) : (
              <h4 key={index} className={`font-semibold text-[#c9f2e4] ${index > 0 ? "pt-1" : ""}`}>
                {renderInline(block.text, `h${index}`)}
              </h4>
            );
          case "paragraph":
            return (
              <p key={index}>
                {block.text.split("\n").map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInline(line, `p${index}-${lineIndex}`)}
                  </Fragment>
                ))}
              </p>
            );
          case "list":
            return <List key={index} block={block} />;
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[#a7b3ae]">
                      {block.header.map((cell, c) => (
                        <th key={c} className="py-1.5 pr-4 font-normal">
                          {renderInline(cell, `th${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-white/[0.05] last:border-0">
                        {row.map((cell, c) => (
                          <td key={c} className="py-1.5 pr-4">
                            {renderInline(cell, `td${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
