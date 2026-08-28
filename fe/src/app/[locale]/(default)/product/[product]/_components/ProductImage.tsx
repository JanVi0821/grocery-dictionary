import { BaseImage } from "@/components/image";

type ProductImageProps = {
  alt: string;
  fallbackLabel: string;
  src: string | null;
};

export function ProductImage({ alt, fallbackLabel, src }: ProductImageProps) {
  return (
    <div className="relative aspect-square w-full max-w-product-image shrink-0 self-center overflow-hidden rounded-surface bg-missing-background lg:self-start">
      <BaseImage
        src={src}
        alt={alt}
        fill
        loading="eager"
        sizes="(min-width: 1024px) 20rem, calc(100vw - 2rem)"
        className="object-contain p-copy-gap"
        fallbackLabel={fallbackLabel}
        fallbackClassName="p-page-x [&_svg]:size-logo"
      />
    </div>
  );
}
