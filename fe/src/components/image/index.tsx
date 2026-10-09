"use client";

import NextImage, { type ImageProps as NextImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type ImageProps = Omit<NextImageProps, "src"> & {
  fallbackClassName?: string;
  fallbackLabel?: string;
  src?: NextImageProps["src"] | null;
};

export function BaseImage({
  alt,
  className,
  fallbackClassName,
  fallbackLabel,
  fill,
  onError,
  src,
  unoptimized = true,
  ...props
}: ImageProps) {
  const srcKey =
    typeof src === "string"
      ? src
      : src && "src" in src
        ? src.src
        : src?.default.src;
  const [failedSrcKey, setFailedSrcKey] = useState<string>();

  if (!src || !srcKey || failedSrcKey === srcKey) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-hidden={alt ? undefined : true}
        className={cn(
          "flex size-full flex-col items-center justify-center gap-control-gap bg-missing-background p-copy-gap text-center text-label text-missing-foreground",
          fill && "absolute inset-0",
          className,
          fallbackClassName,
        )}
      >
        <ImageOff className="size-nav-icon" aria-hidden="true" />
        {fallbackLabel && <span>{fallbackLabel}</span>}
      </div>
    );
  }

  return (
    <NextImage
      {...props}
      src={src}
      alt={alt}
      className={className}
      fill={fill}
      unoptimized={unoptimized}
      onError={(event) => {
        setFailedSrcKey(srcKey);
        onError?.(event);
      }}
    />
  );
}
