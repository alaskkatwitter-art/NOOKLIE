import type { jsPDF as PdfDocument } from 'jspdf';

type TextStyle = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; link?: string };
type Run = { text: string; style: TextStyle };
type Align = 'left' | 'center' | 'right' | 'justify';
type Block =
  | { kind: 'text'; runs: (Run | null)[]; size: number; align: Align; inset: number }
  | { kind: 'image'; image: HTMLImageElement }
  | { kind: 'rule' };

const plain: TextStyle = { bold: false, italic: false, underline: false, strike: false };
const blockTags = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI']);

function readBlocks(fragment: DocumentFragment) {
  const blocks: Block[] = [];

  function walk(parent: ParentNode, style: TextStyle, align: Align, size: number, inset: number, prefix?: string) {
    let runs: (Run | null)[] = prefix ? [{ text: prefix, style }] : [];
    function flush() {
      if (runs.some(run => run === null || run.text.trim())) blocks.push({ kind: 'text', runs, align, size, inset });
      runs = [];
    }
    function visit(node: Node, inherited: TextStyle) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) runs.push({ text: node.textContent, style: inherited });
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      const tag = node.tagName;
      const weight = node.style.fontWeight;
      const fontStyle = node.style.fontStyle;
      const decoration = node.style.textDecoration;
      const href = node instanceof HTMLAnchorElement ? node.getAttribute('href') : null;
      const next: TextStyle = {
        bold: weight ? weight === 'bold' || Number(weight) >= 600 : inherited.bold || ['B', 'STRONG'].includes(tag),
        italic: fontStyle ? fontStyle === 'italic' : inherited.italic || ['I', 'EM'].includes(tag),
        underline: decoration ? decoration.includes('underline') : inherited.underline || tag === 'U',
        strike: decoration ? decoration.includes('line-through') : inherited.strike || tag === 'S',
        link: href && /^(https?:\/\/|mailto:)/i.test(href) ? href : inherited.link,
      };
      if (tag === 'BR') {
        runs.push(null);
      } else if (tag === 'IMG' && node instanceof HTMLImageElement) {
        flush();
        blocks.push({ kind: 'image', image: node });
      } else if (tag === 'HR') {
        flush();
        blocks.push({ kind: 'rule' });
      } else if (blockTags.has(tag)) {
        flush();
        const alignment = ['left', 'center', 'right', 'justify'].includes(node.style.textAlign)
          ? node.style.textAlign as Align : align;
        if (tag === 'UL' || tag === 'OL') {
          const items = Array.from(node.children).filter(child => child.tagName === 'LI');
          items.forEach((item, index) => walk(item, next, alignment, size, Math.min(inset + 5, 22),
            tag === 'OL' ? `${index + 1}. ` : '• '));
        } else {
          const heading = /^H[1-4]$/.test(tag);
          walk(node, { ...next, bold: heading || next.bold }, alignment,
            heading ? 17 - Number(tag[1]) : size, tag === 'BLOCKQUOTE' ? Math.min(inset + 6, 22) : inset);
        }
      } else {
        node.childNodes.forEach(child => visit(child, next));
      }
    }
    parent.childNodes.forEach(node => visit(node, style));
    flush();
  }

  walk(fragment, plain, 'left', 11.5, 0);
  return blocks;
}

function font(doc: PdfDocument, style: TextStyle, size: number) {
  const variant = style.bold && style.italic ? 'bolditalic' : style.bold ? 'bold' : style.italic ? 'italic' : 'normal';
  doc.setFont('times', variant);
  doc.setFontSize(size);
}

function lineLayout(doc: PdfDocument, runs: (Run | null)[], size: number, width: number) {
  type MeasuredRun = Run & { width: number };
  type Line = { runs: MeasuredRun[]; width: number; wrapped: boolean };
  const lines: Line[] = [];
  let line: Line = { runs: [], width: 0, wrapped: false };
  let space: MeasuredRun | null = null;
  let word: MeasuredRun[] = [];
  const measure = (run: Run) => {
    font(doc, run.style, size);
    return { ...run, width: doc.getTextWidth(run.text) };
  };
  const add = (run: MeasuredRun) => {
    line.runs.push(run);
    line.width += run.width;
  };
  const endLine = (wrapped: boolean) => {
    lines.push({ ...line, wrapped });
    line = { runs: [], width: 0, wrapped: false };
    space = null;
  };
  function addWord() {
    if (!word.length) return;
    const length = word.reduce((total, run) => total + run.width, 0);
    if (line.runs.length && line.width + (space?.width ?? 0) + length > width) endLine(true);
    if (line.runs.length && space) add(space);
    space = null;
    for (const run of word) {
      if (length <= width) {
        add(run);
      } else {
        for (const character of run.text) {
          const letter = measure({ text: character, style: run.style });
          if (line.runs.length && line.width + letter.width > width) endLine(true);
          add(letter);
        }
      }
    }
    word = [];
  }
  for (const run of runs) {
    if (!run) {
      addWord();
      endLine(false);
      continue;
    }
    for (const token of run.text.match(/[^\t\r\n\f ]+|[\t\r\n\f ]+/g) ?? []) {
      if (!token.trim() && !token.includes('\u00a0')) {
        addWord();
        space = measure({ text: ' ', style: run.style });
      } else {
        word.push(measure({ text: token, style: run.style }));
      }
    }
  }
  addWord();
  if (line.runs.length) endLine(false);
  return lines;
}

type Book = { title: string; author: string; chapters: { title: string; html: string }[] };

export async function generateBookPdf(
  book: Book,
  permission: string,
  chapterDocument: (html: string) => DocumentFragment,
  loadImage: (image: HTMLImageElement) => Promise<Blob>,
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a5', unit: 'mm', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = width - margin * 2;
  const bottom = height - 17;
  const credit = `@${book.author}`;
  const destinations: { page: number; y: number }[] = [];
  const chapters: number[] = [];
  let y = margin;

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function ensureSpace(space: number) {
    if (y > margin && y + space > bottom) newPage();
  }

  function paragraph(runs: (Run | null)[], size: number, align: Align = 'left', inset = 0) {
    const lineHeight = size * 0.50;
    const available = contentWidth - inset;
    const lines = lineLayout(doc, runs, size, available);
    if (lines.length > 1) ensureSpace(lineHeight * 2);
    for (const line of lines) {
      ensureSpace(lineHeight);
      let x = margin + inset;
      if (align === 'center') x += (available - line.width) / 2;
      if (align === 'right') x += available - line.width;
      const spaces = line.runs.filter(run => run.text === ' ').length;
      const spacing = align === 'justify' && line.wrapped && spaces ? (available - line.width) / spaces : 0;
      const baseline = y + lineHeight * 0.73;
      for (const run of line.runs) {
        font(doc, run.style, size);
        doc.setTextColor(run.style.link ? '#8a2653' : '#202020');
        doc.text(run.text, x, baseline);
        if (run.style.underline || run.style.strike) {
          const lineY = baseline + (run.style.strike ? -size * .10 : .4);
          doc.setLineWidth(.16);
          doc.line(x, lineY, x + run.width, lineY);
        }
        if (run.style.link) doc.link(x, y, run.width, lineHeight, { url: run.style.link });
        x += run.width + (run.text === ' ' ? spacing : 0);
      }
      y += lineHeight;
    }
    y += size > 13 ? 3 : 2;
  }

  function text(value: string, size: number, align: Align = 'left', bold = false) {
    paragraph([{ text: value, style: { ...plain, bold } }], size, align);
  }

  doc.setProperties({ title: book.title, author: credit, creator: 'Nooklie' });
  y = 64;
  text(book.title, 24, 'center', true);
  text(credit, 15, 'center');
  text(permission, 10, 'center');

  newPage();
  text('Sumário', 19, 'left', true);
  for (const [index, chapter] of book.chapters.entries()) {
    ensureSpace(12);
    destinations.push({ page: doc.getNumberOfPages(), y });
    text(`${index + 1}. ${chapter.title}`, 11.5, 'left');
  }

  for (const chapter of book.chapters) {
    newPage();
    chapters.push(doc.getNumberOfPages());
    text(chapter.title, 19, 'left', true);
    y += 3;
    for (const block of readBlocks(chapterDocument(chapter.html))) {
      if (block.kind === 'text') paragraph(block.runs, block.size, block.align, block.inset);
      if (block.kind === 'rule') {
        ensureSpace(8);
        doc.setDrawColor('#999999');
        doc.line(width / 2 - 12, y + 3, width / 2 + 12, y + 3);
        y += 8;
      }
      if (block.kind === 'image') {
        const bitmap = await createImageBitmap(await loadImage(block.image));
        const canvas = document.createElement('canvas');
        try {
          const pixels = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          canvas.width = Math.max(1, Math.round(bitmap.width * pixels));
          canvas.height = Math.max(1, Math.round(bitmap.height * pixels));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Não foi possível preparar uma imagem do PDF.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const preferredScale = Math.min(contentWidth / bitmap.width, (bottom - margin - 4) / bitmap.height, 0.35);
          const remainingScale = (bottom - y - 4) / bitmap.height;
          if (remainingScale < preferredScale * .72) newPage();
          const scale = Math.min(preferredScale, (bottom - y - 4) / bitmap.height);
          const imageWidth = bitmap.width * scale;
          const imageHeight = bitmap.height * scale;
          doc.addImage(canvas.toDataURL('image/jpeg', .88), 'JPEG', (width - imageWidth) / 2, y, imageWidth, imageHeight);
          y += imageHeight + 4;
        } finally {
          bitmap.close();
        }
      }
    }
  }

  destinations.forEach((destination, index) => {
    doc.setPage(destination.page);
    doc.link(margin, destination.y, contentWidth, 7, { pageNumber: chapters[index] });
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    font(doc, plain, 9);
    doc.setTextColor('#595959');
    doc.text(credit, margin, height - 8);
    doc.text(String(page), width - margin, height - 8, { align: 'right' });
  }
  return doc.output('blob');
}
