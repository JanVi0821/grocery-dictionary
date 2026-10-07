import NewWorldLogo from "@/components/brands/logos/new-world.svg";
import PaknSaveLogo from "@/components/brands/logos/paknsave.svg";
import WoolworthsLogo from "@/components/brands/logos/woolworths.svg";
import { useTranslations } from "next-intl";

const retailers = [
  { Logo: WoolworthsLogo, name: "Woolworths", showName: true },
  { Logo: PaknSaveLogo, name: "PAK'nSAVE" },
  { Logo: NewWorldLogo, name: "New World" },
] as const;

export function SupportedRetailers() {
  const t = useTranslations("Home");

  return (
    <ul
      aria-label={t("supportedRetailers")}
      className="mx-auto mt-copy-gap flex w-fit max-w-full flex-wrap items-center justify-center gap-x-control-x gap-y-control-gap rounded-control px-control-x py-control-gap"
    >
      {retailers.map(({ Logo, name, ...retailer }) => (
        <li
          className="flex h-retailer-logo-height w-retailer-logo-width items-center justify-center"
          key={name}
        >
          <Logo
            aria-hidden="true"
            className={
              "showName" in retailer ? "h-full w-auto" : "h-full w-full"
            }
            focusable="false"
          />
          {"showName" in retailer ? (
            <span className="text-label font-bold text-retailer-woolworths">
              {name}
            </span>
          ) : (
            <span className="sr-only">{name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
