import ReactMarkdown from "react-markdown";

function normalizeMarkdown(value: string) {
  return value
    .replace(/\*{4}(?=\S)/g, "**")
    .replace(/([^\s*])[\t ]+(\*{1,3})(?=$|\s|[\p{P}\p{S}])/gu, "$1$2");
}

export function MarkdownContent({ value }: { value: string | null | undefined }) {
  if (!value) return null;

  return (
    <ReactMarkdown
      allowedElements={["p", "strong", "em", "ul", "ol", "li", "br"]}
      unwrapDisallowed
      components={{
        p: ({ children }) => <p className="whitespace-pre-wrap [&+p]:mt-control-gap">{children}</p>,
        strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
        ul: ({ children }) => <ul className="ml-copy-gap list-disc space-y-control-gap">{children}</ul>,
        ol: ({ children }) => <ol className="ml-copy-gap list-decimal space-y-control-gap">{children}</ol>,
      }}
    >
      {normalizeMarkdown(value)}
    </ReactMarkdown>
  );
}
