"use client";

import { useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import {
  requestProductCommentDelete,
  type ProductComment,
} from "@/requests/comments";
import { formatDateTime } from "@/utils/datetime";

const COMMENT_HTML_CLASS =
  "text-label leading-6 text-foreground [&_li]:ml-copy-gap [&_ol]:list-decimal [&_p+p]:mt-control-gap [&_ul]:list-disc";

export function CommentItem({
  productId,
  comment,
}: {
  productId: number;
  comment: ProductComment;
}) {
  const t = useTranslations("Product.comments");
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteFailed(false);

    try {
      await requestProductCommentDelete(productId, comment.id);
      await queryClient.invalidateQueries({
        queryKey: ["product-comments", productId],
      });
    } catch {
      setDeleteFailed(true);
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <li className="py-copy-gap">
      <div className="flex items-center justify-between gap-control-gap text-label">
        {comment.authorName ? (
          <span className="flex min-w-0 items-center gap-control-gap">
            {comment.avatarUrl ? (
              <Image
                src={comment.avatarUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground-muted">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
            )}
            <span className="truncate font-semibold text-foreground">
              {comment.authorName}
            </span>
          </span>
        ) : (
          <span className="text-foreground-muted">{t("anonymous")}</span>
        )}
        <span className="flex shrink-0 items-center gap-control-gap">
          <time dateTime={comment.createdAt} className="text-foreground-muted">
            {formatDateTime(comment.createdAt)}
          </time>
          {comment.owned ? (
            <button
              type="button"
              className="focus-ring cursor-pointer min-h-touch px-2 text-label text-danger disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => setConfirmOpen(true)}
            >
              {t("delete")}
            </button>
          ) : null}
          <Dialog.Root
            open={confirmOpen}
            onOpenChange={(open) => {
              if (!isDeleting) setConfirmOpen(open);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
              <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-control border border-border bg-surface p-copy-gap">
                <Dialog.Title className="text-base font-bold text-foreground">
                  {t("deleteConfirmTitle")}
                </Dialog.Title>
                <div className="mt-copy-gap flex justify-end gap-control-gap">
                  <button
                    type="button"
                    className="focus-ring min-h-touch rounded-control px-control-x text-label font-semibold text-foreground"
                    disabled={isDeleting}
                    onClick={() => setConfirmOpen(false)}
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    className="focus-ring min-h-touch rounded-control bg-danger px-control-x text-label font-semibold text-primary-foreground disabled:opacity-60"
                    disabled={isDeleting}
                    onClick={() => void handleDelete()}
                  >
                    {t("delete")}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </span>
      </div>
      <div
        className={`mt-control-gap ${COMMENT_HTML_CLASS}`}
        dangerouslySetInnerHTML={{ __html: comment.content }}
      />
      {deleteFailed ? (
        <p className="mt-control-gap text-label text-danger" role="alert">
          {t("deleteFailed")}
        </p>
      ) : null}
    </li>
  );
}
