import { LoaderCircle } from "lucide-react";

export function Loading() {
  return (
    <div className="mt-control-gap flex justify-center">
      <LoaderCircle
        className="size-nav-icon animate-spin text-foreground-muted motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}
