"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";

const MAX_FEEDBACK_LENGTH = 5000;

export function FeedbackForm() {
  const t = useTranslations("Settings.feedback");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error("Feedback request failed");
      setContent("");
      setResult("success");
    } catch {
      setResult("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-auto border bg-surface p-4 shadow-control">
      <form className="space-y-control-gap" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="settings-feedback">
          {t("label")}
        </label>
        <textarea
          id="settings-feedback"
          className="focus-ring min-h-20 w-full resize-y border border-border bg-background px-2 py-2 text-label text-foreground placeholder:text-foreground-muted"
          maxLength={MAX_FEEDBACK_LENGTH}
          onChange={(event) => {
            setContent(event.target.value);
            setResult(null);
          }}
          placeholder={t("placeholder")}
          required
          value={content}
        />
        <div className="flex flex-col gap-control-gap sm:flex-row sm:items-center sm:justify-between">
          <p className="text-label text-foreground-muted" aria-live="polite">
            {result === "success"
              ? t("success")
              : result === "error"
                ? t("error")
                : ""}
          </p>
          <button
            className="focus-ring inline-flex items-center justify-center gap-control-gap bg-primary p-2 text-label font-semibold text-primary-foreground hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || content.trim().length === 0}
            type="submit"
          >
            <Send aria-hidden="true" className="size-4" />
            <span>{isSubmitting ? t("submitting") : t("submit")}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
