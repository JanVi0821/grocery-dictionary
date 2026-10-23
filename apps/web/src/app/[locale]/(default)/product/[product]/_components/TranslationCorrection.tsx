"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { useSupabaseBrowserClient } from "@/lib/supabase/client";
import { ApiError } from "@/requests/fetch";
import {
  requestProductTranslationFields,
  requestProductTranslationUpdate,
} from "@/requests/translation";
import type { TranslationField } from "@/utils/translation-fields";
import { Edit } from "lucide-react";
import clsx from "clsx";

export function TranslationCorrection({
  productId,
  locale,
  adminUserIds,
}: {
  productId: number;
  locale: string;
  adminUserIds: string[];
}) {
  const t = useTranslations("Product.translationCorrection");
  const router = useRouter();
  const supabase = useSupabaseBrowserClient((state) => state.client);
  const [userId, setUserId] = useState<string | null>(null);
  const [fields, setFields] = useState<TranslationField[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const allowed =
    process.env.NODE_ENV === "development" ||
    (userId !== null && adminUserIds.includes(userId));

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!allowed) return;

    let cancelled = false;

    requestProductTranslationFields(productId, locale)
      .then((data) => {
        if (!cancelled) setFields(data.fields);
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApiError && error.status === 404) {
          setFields([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowed, productId, locale]);

  if (!allowed || !fields?.length) return null;

  function startEdit(field: TranslationField) {
    setEditingKey(field.key);
    setDraft(field.value);
    setFailed(false);
  }

  async function save(field: TranslationField) {
    if (savingKey) return;
    if (draft === field.value) {
      setEditingKey(null);
      return;
    }

    setSavingKey(field.key);
    setFailed(false);

    try {
      const updated = await requestProductTranslationUpdate(
        productId,
        locale,
        field.key,
        draft,
      );
      setFields(
        (current) =>
          current?.map((item) => (item.key === field.key ? updated : item)) ??
          null,
      );
      setEditingKey(null);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={clsx(
          "focus-ring flex items-center gap-control-gap mt-4 cursor-pointer self-center text-label font-semibold",
          "text-primary hover:text-foreground",
        )}
        onClick={() => {
          setEditingKey(null);
          setFailed(false);
          setOpen(true);
        }}
      >
        {t("trigger")}

        <Edit className="size-4" />
      </button>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!savingKey) setOpen(next);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(100%-2rem,40rem)] w-[min(100%-2rem,36rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-control border border-border bg-surface">
            <Dialog.Title className="px-copy-gap pt-copy-gap text-base font-bold text-foreground">
              {t("title")}
            </Dialog.Title>
            <ul className="mt-copy-gap min-h-0 flex-1 overflow-y-auto px-copy-gap pb-copy-gap">
              {fields.map((field) => {
                const editing = editingKey === field.key;
                const saving = savingKey === field.key;

                return (
                  <li
                    key={field.key}
                    className="border-t border-border py-copy-gap"
                  >
                    <div className="flex items-start justify-between gap-control-gap">
                      <p className="text-label font-semibold text-foreground-muted">
                        {field.key}
                      </p>
                      {editing ? null : (
                        <button
                          type="button"
                          className="focus-ring shrink-0 cursor-pointer text-primary disabled:opacity-60"
                          disabled={savingKey !== null}
                          onClick={() => startEdit(field)}
                        >
                          <Edit className="size-4" />
                        </button>
                      )}
                    </div>
                    {editing ? (
                      <div className="mt-control-gap">
                        <textarea
                          className="focus-ring min-h-24 w-full rounded-control border border-border bg-background px-control-x py-2 text-label text-foreground"
                          value={draft}
                          disabled={saving}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                        <div className="mt-control-gap flex justify-end gap-control-gap">
                          <button
                            type="button"
                            className="focus-ring min-h-touch rounded-control px-control-x text-label font-semibold text-foreground"
                            disabled={saving}
                            onClick={() => {
                              setEditingKey(null);
                              setFailed(false);
                            }}
                          >
                            {t("cancel")}
                          </button>
                          <button
                            type="button"
                            className="focus-ring min-h-touch rounded-control bg-primary px-control-x text-label font-semibold text-primary-foreground disabled:opacity-60"
                            disabled={saving}
                            onClick={() => void save(field)}
                          >
                            {saving ? t("saving") : t("save")}
                          </button>
                        </div>
                        {failed ? (
                          <p className="mt-control-gap text-label text-danger">
                            {t("error")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-control-gap whitespace-pre-wrap break-words text-label leading-6 text-foreground">
                        {field.value}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
