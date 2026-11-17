import sanitizeHtml from 'sanitize-html';

export function safeBetaHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['p','br','div','h2','h3','strong','em','u','s','blockquote','ul','ol','li','hr'],
    allowedAttributes: {},
  });
}
