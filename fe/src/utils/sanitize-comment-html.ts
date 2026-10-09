import "server-only";
import sanitizeHtml from "sanitize-html";

export function sanitizeCommentHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "s", "span", "ul", "ol", "li"],
    allowedAttributes: { span: ["style"] },
    allowedStyles: {
      span: {
        color: [
          /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i,
          /^rgb\(\s*(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*){2}(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)$/i,
        ],
      },
    },
  }).trim();
}
