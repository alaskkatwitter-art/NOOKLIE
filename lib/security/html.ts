import sanitizeHtml from "sanitize-html";
export function safeChapterHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "ul",
      "ol",
      "li",
      "hr",
      "a",
      "img",
    ],
    allowedAttributes: {
      img: ["src", "alt", "title", "data-media-id"],
      a: ["href", "title", "target", "rel"],
      "*": ["style"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(bold|normal|[1-9]00)$/],
        "font-style": [/^(italic|normal)$/],
        "text-decoration": [/^(underline|line-through|none)$/],
      },
    },
    transformTags: {
      img: (_tag, attrs) => {
        let src: string | undefined;
        try {
          if (attrs.src?.startsWith("/api/content-media?")) {
            const u = new URL(attrs.src, "https://nooklie.invalid");
            if (
              u.searchParams.get("bucket") === "chapter-media" &&
              u.searchParams.get("path")
            )
              src = attrs.src;
          } else {
            const u = new URL(attrs.src);
            const configured =
              process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
            if (
              configured &&
              u.origin === new URL(configured).origin &&
              u.pathname.startsWith("/storage/v1/object/public/chapter-media/")
            )
              src =
                "/api/content-media?bucket=chapter-media&path=" +
                encodeURIComponent(
                  decodeURIComponent(
                    u.pathname.slice(
                      "/storage/v1/object/public/chapter-media/".length,
                    ),
                  ),
                );
          }
        } catch {}
        return {
          tagName: src ? "img" : "span",
          attribs: src
            ? {
                src,
                alt: attrs.alt || "Imagem do capítulo",
                ...(attrs["data-media-id"]
                  ? { "data-media-id": attrs["data-media-id"] }
                  : {}),
              }
            : {},
        };
      },
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  });
}
