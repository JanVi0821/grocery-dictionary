"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AuthControl() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [supabase] = useState(createSupabaseBrowserClient);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(false);

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(true);
      setIsSigningOut(false);
      return;
    }

    router.refresh();
  }

  if (isLoading) {
    return (
      <div
        className="flex min-h-touch shrink-0 items-center px-2 sm:px-control-x"
        aria-hidden="true"
      >
        <UserRound
          className="size-nav-icon-mobile text-foreground-muted opacity-50 sm:size-nav-icon"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="focus-ring flex min-h-touch shrink-0 items-center gap-1 sm:gap-control-gap rounded-control px-2 sm:px-control-x text-label font-semibold text-foreground hover:bg-surface/70"
      >
        <UserRound
          className="size-nav-icon-mobile sm:size-nav-icon"
          aria-hidden="true"
        />
        <span>{t("signIn")}</span>
      </Link>
    );
  }

  const name = [user.user_metadata.full_name, user.user_metadata.name].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const avatarUrl = [
    user.user_metadata.avatar_url,
    user.user_metadata.picture,
  ].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const initials = (name || user.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-ring flex min-h-touch shrink-0 items-center rounded-control px-1 text-label font-semibold text-foreground cursor-pointer"
        aria-label={t("accountMenu")}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="size-8 sm:size-9 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-8 sm:size-9 place-items-center rounded-full bg-surface text-label font-bold text-foreground">
            {initials}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          {name && <p className="truncate font-semibold">{name}</p>}
          {user.email && (
            <p className="truncate text-foreground-muted">{user.email}</p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
          disabled={isSigningOut}
        >
          {isSigningOut ? t("signingOut") : t("signOut")}
        </DropdownMenuItem>
        {error && (
          <p
            className="px-control-x pb-control-gap text-label text-danger"
            role="status"
          >
            {t("signOutFailed")}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
