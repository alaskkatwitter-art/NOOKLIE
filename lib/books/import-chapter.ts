import { groupPdfParagraphs, readPdfLines, recordPdfBlocks, type PdfFont } from './pdf-paragraphs';

export type ImportedChapter = { html: string; images: { token: string; file: File }[]; notice?: string };

export async function importChapter(file: File, remainingImages: number): Promise<ImportedChapter> {
  if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter até 20 MB.');
  if (/\.doc$/i.test(file.name)) throw new Error('Abra o arquivo no Word ou no Google Docs e salve uma cópia em .docx.');
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer(), fontExtraProperties: true, disableFontFace: true, maxImageSize: 1 });
    const pages: ReturnType<typeof readPdfLines>[] = [];
    const blocks = new Map<string, string>();
    const fonts = new Map<string, PdfFont>();
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 150) throw new Error('Importe até 150 páginas por capítulo.');
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const [text, tree] = await Promise.all([page.getTextContent({ includeMarkedContent: true }), page.getStructTree()]);
        recordPdfBlocks(tree, blocks);
        const newFonts = [...new Set(text.items.flatMap(item => 'str' in item ? [item.fontName] : []))]
          .filter(name => name && !fonts.has(name));
        if (newFonts.length) {
          const operators = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
          const dependencies = new Set(operators.fnArray.flatMap((op, index) => (
            op === pdfjs.OPS.dependency ? operators.argsArray[index] as string[] : []
          )));
          for (const name of newFonts) {
            if (!dependencies.has(name)) continue;
            const font = await new Promise<unknown>(resolve => page.commonObjs.get(name, resolve, () => resolve(null)));
            if (font && typeof font === 'object') fonts.set(name, font);
          }
        }
        pages.push(readPdfLines(text.items, fonts));
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
    const paragraphs = document.createElement('div');
    for (const runs of groupPdfParagraphs(pages, blocks)) {
      const paragraph = document.createElement('p');
      for (const run of runs) {
        let content: Node = document.createTextNode(run.text);
        if (run.italic) {
          const em = document.createElement('em');
          em.append(content);
          content = em;
        }
        if (run.bold) {
          const strong = document.createElement('strong');
          strong.append(content);
          content = strong;
        }
        paragraph.append(content);
      }
      paragraphs.append(paragraph);
    }
    if (!paragraphs.textContent?.trim()) throw new Error('Este PDF não tem texto selecionável. Use um .docx ou um PDF que já tenha passado por OCR.');
    return { html: paragraphs.innerHTML, images: [], notice: 'Texto do PDF importado. Revise as quebras de parágrafo. Para importar também as imagens do documento, use uma cópia em .docx.' };
  }

  if (!/\.docx$/i.test(file.name)) throw new Error('Selecione um arquivo .docx ou .pdf.');
  const [mammoth, purifier] = await Promise.all([import('mammoth'), import('dompurify')]);
  const images: ImportedChapter['images'] = [];
  let skipped = 0;
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
    externalFileAccess: false,
    includeEmbeddedStyleMap: false,
    convertImage: mammoth.images.imgElement(async image => {
      if (images.length >= remainingImages || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.contentType)) {
        skipped++;
        return { src: '' };
      }
      const bytes = await image.readAsArrayBuffer();
      if (bytes.byteLength > 5 * 1024 * 1024) {
        skipped++;
        return { src: '' };
      }
      const token = crypto.randomUUID();
      images.push({ token, file: new File([bytes], token, { type: image.contentType }) });
      return { src: '#import-' + token };
    }),
  });
  const parsed = document.createElement('template');
  parsed.innerHTML = purifier.default.sanitize(result.value, {
    ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'hr', 'a', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt'],
  });
  for (const image of parsed.content.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    const imported = images.find(entry => source === '#import-' + entry.token);
    if (!imported) { image.remove(); continue; }
    const marker = document.createElement('div');
    marker.className = 'chapter-media-placeholder';
    marker.dataset.pendingMediaId = imported.token;
    marker.textContent = image.alt || 'Imagem importada';
    image.replaceWith(marker);
  }
  if (!parsed.content.textContent?.trim() && !images.length) throw new Error('O documento não tem conteúdo compatível.');
  return {
    html: parsed.innerHTML,
    images,
    notice: skipped ? `${skipped} imagem(ns) excederam os limites do editor ou usavam formato incompatível.` : undefined,
  };
}
