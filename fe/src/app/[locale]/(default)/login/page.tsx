import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "./_components/GoogleSignInButton";

export default async function LoginPage({
  searchParams,
}: PageProps<"/[locale]/login">) {
  const t = await getTranslations("Auth");
  const { authError } = await searchParams;

  return (
    <section className="mx-auto flex min-h-[calc(100svh-var(--spacing-header))] w-full max-w-content items-center justify-center px-page-x py-section pb-bottom-nav lg:pb-section">
      <div className="w-full max-w-md rounded-page border border-border bg-surface p-page-x shadow-control">
        <p className="text-center font-bold mt-control-gap text-body text-foreground-muted">
          {t("loginTitle")}
        </p>
        <div className="mt-5">
          <GoogleSignInButton />
          {authError && (
            <p className="mt-control-gap text-label text-danger" role="alert">
              {t("signInFailed")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
