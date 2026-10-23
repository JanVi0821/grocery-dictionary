import { BaseImage } from ".";

export function ErrorFallback() {
  return (
    <BaseImage
      src="/imgs/alien_1.png"
      alt=""
      fill
      sizes="(max-width: 32rem) calc(100vw - 2rem), 32rem"
      className="object-contain p-copy-gap"
    />
  );
}
