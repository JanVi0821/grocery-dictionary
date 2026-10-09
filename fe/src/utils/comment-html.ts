export const MAX_COMMENT_LENGTH = 20000;

export function isCommentHtmlEmpty(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim()
    .length === 0;
}
