import { getTranslations } from "next-intl/server";
import { Languages } from "lucide-react";
import { LanguageSelector } from "@/components/layouts/LanguageSelector";
import { FeedbackForm } from "./_components/FeedbackForm";

const SettingsPage = async () => {
  const t = await getTranslations("Settings");

  return (
    <main className="flex min-h-home flex-col gap-section justify-between bg-background pb-bottom-nav lg:pb-section">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-control-gap px-page-x py-section">
        <h1 className="text-heading font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <section className="flex flex-col gap-control-gap rounded-page border border-border bg-surface p-4 shadow-control sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-control-gap">
            <span className="grid size-12 shrink-0 place-items-center rounded-control bg-brand-butter text-foreground">
              <Languages className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                id="settings-language-title"
                className="text-body font-semibold text-foreground"
              >
                {t("languageTitle")}
              </p>
              <p className="mt-1 text-label text-foreground-muted">
                {t("languageDescription")}
              </p>
            </div>
          </div>
          <div className="sm:pl-page-x">
            <LanguageSelector variant="settings" />
          </div>
        </section>
      </div>

      <div className="mx-auto w-full max-w-content px-page-x pb-section">
        <FeedbackForm />
      </div>
    </main>
  );
};

export default SettingsPage;
