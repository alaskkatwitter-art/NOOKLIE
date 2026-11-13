import type { StructTreeNode, TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

export type PdfFont = { bold?: boolean; italic?: boolean; name?: string };
type Run = { text: string; bold: boolean; italic: boolean };
type Line = { mark?: string; runs: Run[]; left: number; right: number; baseline: number; size: number };

export function readPdfLines(items: (TextItem | TextMarkedContent)[], fonts: Map<string, PdfFont>): Line[] {
  const lines: Line[] = [];
  const marks: (string | undefined)[] = [];
  let line: Line | undefined;
  let previousEnd = 0;
  for (const item of items) {
    if (!('str' in item)) {
      if (item.type === 'endMarkedContent') marks.pop();
      else marks.push(item.type === 'beginMarkedContentProps' ? item.id : undefined);
      continue;
    }
    const mark = marks.findLast(Boolean);
    const [a, b, c, d, x, y] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || 12;
    if (item.str.trim()) {
      if (!line || mark !== line.mark || Math.abs(line.baseline - y) > Math.min(line.size, size) * 0.5) {
        line = { mark, runs: [], left: x, right: x + item.width, baseline: y, size };
        lines.push(line);
      }
      const last = line.runs.at(-1);
      if (last && item.dir === 'ltr' && x - previousEnd > size * 0.15 && !/^\s/.test(item.str) && !/\s$/.test(last.text)) {
        last.text += ' ';
      }
      const font = fonts.get(item.fontName);
      const bold = Boolean(font?.bold || /bold|demi|black|heavy/i.test(font?.name ?? ''));
      const italic = Boolean(font?.italic || /italic|oblique/i.test(font?.name ?? '') || (a && Math.abs(c / a) > 0.1 && Math.abs(b / a) < 0.1));
      if (last && last.bold === bold && last.italic === italic) last.text += item.str;
      else line.runs.push({ text: item.str, bold, italic });
      line.left = Math.min(line.left, x);
      line.right = Math.max(line.right, x + item.width);
      previousEnd = x + item.width;
    } else if (line && item.str) {
      line.runs[line.runs.length - 1].text += item.str;
      previousEnd = x + item.width;
    }
    if (item.hasEOL) line = undefined;
  }
  return lines;
}

function contentIds(node: StructTreeNode): string[] {
  return node.children.flatMap(child => 'children' in child ? contentIds(child) : child.type === 'content' ? [child.id] : []);
}

export function recordPdfBlocks(tree: StructTreeNode | null, blocks: Map<string, string>) {
  if (!tree) return;
  const visit = (node: StructTreeNode) => {
    if (/^(P|H[1-6]?|LBody|BlockQuote|Caption)$/.test(node.role)) {
      const ids = contentIds(node);
      for (const id of ids) blocks.set(id, ids[0]);
    }
    for (const child of node.children) {
      if ('children' in child) visit(child);
    }
  };
  visit(tree);
}

export function groupPdfParagraphs(pages: Line[][], blocks: Map<string, string>): Run[][] {
  const paragraphs: Run[][] = [];
  let previous: Line | undefined;
  let previousPageRight = 0;
  for (const lines of pages) {
    if (!lines.length) {
      previous = undefined;
      continue;
    }
    const pageLeft = Math.min(...lines.map(line => line.left));
    const pageRight = Math.max(...lines.map(line => line.right));
    const lineGaps = lines.slice(1).flatMap((line, index) => {
      const gap = lines[index].baseline - line.baseline;
      return gap >= line.size * 0.8 && gap <= line.size * 1.8 ? [gap] : [];
    }).sort((a, b) => a - b);
    for (const [index, line] of lines.entries()) {
      const spacing = lineGaps[Math.floor(lineGaps.length / 3)] ?? line.size * 1.2;
      const gap = previous ? previous.baseline - line.baseline : 0;
      const previousText = previous?.runs.at(-1)?.text.trimEnd() ?? '';
      const lineText = line.runs.map(run => run.text).join('');
      const dialogue = /^\s*[—–─]\s/.test(lineText);
      const indented = line.left - pageLeft > line.size * 0.7 && Math.abs(line.left - (previous?.left ?? pageLeft)) > line.size * 0.7;
      const previousLineWasShort = previous && (index ? pageRight : previousPageRight) - previous.right > previous.size * 2.5;
      const sizeChanged = previous && Math.abs(previous.size - line.size) > line.size * 0.25;
      const block = line.mark && blocks.get(line.mark);
      const previousBlock = previous?.mark && blocks.get(previous.mark);
      // Some PDF exporters assign a new tag when a paragraph continues on the next page.
      const continuesOnNextPage = index === 0 && previous && !previousLineWasShort && !indented && !sizeChanged
        && /\p{L}$/u.test(previousText) && /^\s*\p{Ll}/u.test(lineText);
      const newBlock = block && previousBlock
        ? block !== previousBlock && !continuesOnNextPage
        : !previous || dialogue || indented || sizeChanged || (index > 0 && (gap <= 0 || gap > spacing * 1.35))
          || (previousLineWasShort && /[.!?…:][”’"')\]]*$/.test(previousText));
      if (newBlock) paragraphs.push([]);
      const paragraph = paragraphs[paragraphs.length - 1];
      if (paragraph.length && !previousText.endsWith('\u00ad')) paragraph.push({ text: ' ', bold: false, italic: false });
      const runs = line.runs.map(run => ({ ...run, text: run.text.replace(/\u00ad/g, '') }));
      runs[0].text = runs[0].text.trimStart();
      runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
      paragraph.push(...runs);
      previous = line;
    }
    previousPageRight = pageRight;
  }
  return paragraphs;
}
