export type ImportedChapter = { html: string; images: { token: string; file: File }[]; notice?: string };

export async function importChapter(file: File, remainingImages: number): Promise<ImportedChapter> {
  if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter até 20 MB.');
  if (/\.doc$/i.test(file.name)) throw new Error('Abra o arquivo no Word ou no Google Docs e salve uma cópia em .docx.');
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const paragraphs = document.createElement('div');
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 150) throw new Error('Importe até 150 páginas por capítulo.');
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const text = await page.getTextContent();
        let paragraph = document.createElement('p');
        for (const item of text.items) {
          if (!('str' in item)) continue;
          const style = text.styles[item.fontName]?.fontFamily ?? '';
          const bold = /bold/i.test(style);
          const italic = /italic|oblique/i.test(style);
          const run = document.createElement(bold ? 'strong' : italic ? 'em' : 'span');
          run.textContent = item.str + (item.hasEOL ? '' : ' ');
          if (bold && italic) run.style.fontStyle = 'italic';
          paragraph.append(run);
          if (item.hasEOL) {
            if (paragraph.textContent?.trim()) paragraphs.append(paragraph);
            paragraph = document.createElement('p');
          }
        }
        if (paragraph.textContent?.trim()) paragraphs.append(paragraph);
      }
    } finally {
      await task.destroy();
    }
    if (!paragraphs.textContent?.trim()) throw new Error('Este PDF não tem texto selecionável. Use um .docx ou um PDF que já tenha passado por OCR.');
    return { html: paragraphs.innerHTML, images: [], notice: 'Texto do PDF importado. Revise a ordem e a formatação. As imagens do PDF podem ser adicionadas pelo editor.' };
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
