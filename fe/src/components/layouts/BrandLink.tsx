import { getTranslations } from "next-intl/server";
import { BaseImage } from "@/components/image";
import { Link } from "@/i18n/navigation";

export async function BrandLink() {
  const t = await getTranslations("Brand");

  return (
    <Link
      href="/"
      className="focus-ring flex min-w-0 min-h-touch items-center gap-1 sm:gap-control-gap rounded-control"
      aria-label={t("homeLabel")}
    >
      <BaseImage
        src="/kiwi-dictionary-transparent.png"
        width={1254}
        height={1254}
        alt=""
        className="size-logo-mobile sm:size-logo"
      />
      <span className="truncate whitespace-nowrap text-label font-semibold">
        {t("name")}
      </span>
    </Link>
  );
}
