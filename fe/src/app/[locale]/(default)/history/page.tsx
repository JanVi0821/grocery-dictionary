import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { HistoryList } from "./_components/HistoryList";

export default async function HistoryPage({
  params,
}: PageProps<"/[locale]/history">) {
  const { locale } = await params;
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect({ href: "/login", locale });
  const t = await getTranslations("History");

  return (
    <section className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <div className="mx-auto w-full max-w-content px-page-x py-section">
        <p className="mb-control-gap text-label text-foreground-muted">
          {t("retentionDescription")}
        </p>
        <HistoryList locale={locale} />
      </div>
    </section>
  );
}
