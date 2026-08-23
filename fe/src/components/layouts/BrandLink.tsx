import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function BrandLink() {
  const t = await getTranslations("Brand");

  return (
    <Link
      href="/"
      className="focus-ring flex min-h-touch items-center gap-control-gap rounded-control"
      aria-label={t("homeLabel")}
    >
      <Image
        src="/kiwi-dictionary-transparent.png"
        width={1254}
        height={1254}
        alt=""
        className="size-logo"
      />
      <span className="whitespace-nowrap text-label font-semibold">
        {t("name")}
      </span>
    </Link>
  );
}
