import { apiFetch } from "./fetch";

export type FeedbackResponse = { success: true };

export function requestFeedbackSubmission(content: string) {
  return apiFetch<FeedbackResponse>("/api/feedback", {
    method: "POST",
    json: { content },
  });
}
