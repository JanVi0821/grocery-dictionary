"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { useSupabaseBrowserClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const t = useTranslations("Auth");
  const supabase = useSupabaseBrowserClient((state) => state.client);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignIn() {
    setIsLoading(true);
    setError(false);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    const { error: signInError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });

    if (signInError) {
      setError(true);
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        className="focus-ring flex min-h-touch w-full items-center justify-center gap-control-gap rounded-control border border-border bg-surface px-control-x text-label font-semibold text-foreground shadow-control hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
      >
        <GoogleIcon className="size-6 shrink-0" />
        <span>
          {isLoading ? t("connectingGoogle") : t("continueWithGoogle")}
        </span>
      </button>
      {error && (
        <p className="mt-control-gap text-label text-danger" role="alert">
          {t("signInFailed")}
        </p>
      )}
    </div>
  );
}
