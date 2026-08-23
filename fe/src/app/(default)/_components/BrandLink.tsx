import Image from "next/image";
import Link from "next/link";

export function BrandLink() {
  return (
    <Link href="/" className="focus-ring flex min-h-touch items-center gap-control-gap rounded-control" aria-label="Grocery Dictionary home">
      <Image
        src="/kiwi-dictionary-transparent.png"
        width={1254}
        height={1254}
        alt=""
        className="size-logo"
      />
      <span className="whitespace-nowrap text-label font-semibold">Grocery Dictionary</span>
    </Link>
  );
}
