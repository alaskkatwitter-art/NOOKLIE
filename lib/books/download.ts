import { strToU8, zipSync } from 'fflate';

type Book = { id: string; title: string; author: string; chapters: { title: string; html: string }[] };
const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
const permission = 'Este autor permite o download desta obra pelo Nooklie.';
const css = 'body{font-family:serif;line-height:1.6}h1,h2{line-height:1.2}img{max-width:100%;height:auto}.title{text-align:center;margin-top:25vh}.credit{font-size:.85em;text-align:center}';

function chapterDocument(html: string) {
  const container = document.createElement('template');
  container.innerHTML = html;
  return container.content;
}

async function loadImage(image: HTMLImageElement) {
  const url = new URL(image.getAttribute('src') || '', location.origin);
  if (url.origin !== location.origin || url.pathname !== '/api/content-media') throw new Error('Imagem fora do Nooklie.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível incluir uma imagem da obra.');
  const blob = await response.blob();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) throw new Error('Formato de imagem indisponível.');
  return blob;
}

async function epub(book: Book) {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  };
  const manifest: string[] = [];
  const spine: string[] = [];
  const links: string[] = [];
  const addPage = (id: string, title: string, body: string, nav = false) => {
    files[`EPUB/${id}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR" xml:lang="pt-BR"><head><title>${escape(title)}</title><style>${css}</style></head><body>${body}</body></html>`);
    manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"${nav ? ' properties="nav"' : ''}/>`);
    if (!nav) spine.push(`<itemref idref="${id}"/>`);
  };
  const credit = `@${book.author}`;
  addPage('front', book.title, `<section class="title"><h1>${escape(book.title)}</h1><p>${escape(credit)}</p><p>${permission}</p></section>`);
  const imageFiles = new Map<string, string>();
  for (const [index, chapter] of book.chapters.entries()) {
    const fragment = chapterDocument(chapter.html);
    for (const image of fragment.querySelectorAll('img')) {
      const source = image.getAttribute('src') || '';
      let filename = imageFiles.get(source);
      if (!filename) {
        const blob = await loadImage(image);
        const id = 'image-' + imageFiles.size;
        filename = id + '.' + blob.type.split('/')[1];
        files['EPUB/' + filename] = new Uint8Array(await blob.arrayBuffer());
        manifest.push(`<item id="${id}" href="${filename}" media-type="${blob.type}"/>`);
        imageFiles.set(source, filename);
      }
      image.setAttribute('src', filename);
    }
    const serializer = new XMLSerializer();
    const content = Array.from(fragment.childNodes, node => serializer.serializeToString(node)).join('');
    const id = 'chapter-' + (index + 1);
    addPage(id, chapter.title, `<h1>${escape(chapter.title)}</h1><p class="credit">${escape(credit)}</p>${content}`);
    links.push(`<li><a href="${id}.xhtml">${escape(chapter.title)}</a></li>`);
  }
  addPage('nav', 'Sumário', `<nav epub:type="toc"><h1>Sumário</h1><ol>${links.join('')}</ol></nav>`, true);
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  files['EPUB/book.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${escape(book.id)}</dc:identifier><dc:title>${escape(book.title)}</dc:title><dc:creator>${escape(credit)}</dc:creator><dc:language>pt-BR</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  const data = zipSync(files);
  return new Blob([new Uint8Array(data)], { type: 'application/epub+zip' });
}

export async function downloadBook(id: string, format: 'epub' | 'pdf') {
  const response = await fetch(`/api/stories/${encodeURIComponent(id)}/book`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Download indisponível.');
  const book: Book = data;
  const blob = format === 'epub' ? await epub(book) :
    await (await import('./pdf')).generateBookPdf(book, permission, chapterDocument, loadImage);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${book.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 100) || 'Nooklie'}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
