import type {
  FoodstuffsProductDetail,
  WoolworthsProductDetail,
} from "@/types/grocer-detail";
import { OriginalReference, shouldShowOriginal } from "./DetailPrimitives";

export function FoodstuffsProductDescription({
  detail,
  originalDetail,
}: {
  detail: FoodstuffsProductDetail;
  originalDetail?: FoodstuffsProductDetail;
}) {
  if (!detail.description) return null;

  return (
    <div className="mt-copy-gap">
      <p className="whitespace-pre-wrap text-body text-foreground">
        {detail.description}
      </p>
      {shouldShowOriginal(detail.description, originalDetail?.description) ? (
        <OriginalReference>
          <p className="whitespace-pre-wrap">{originalDetail?.description}</p>
        </OriginalReference>
      ) : null}
    </div>
  );
}

export function WoolworthsProductDescription({
  detail,
  originalDetail,
}: {
  detail: WoolworthsProductDetail;
  originalDetail?: WoolworthsProductDetail;
}) {
  if (!detail.description) return null;

  return (
    <div className="mt-copy-gap">
      <div
        className="space-y-control-gap text-body text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-copy-gap [&_ol]:list-decimal [&_p+p]:mt-control-gap [&_sup]:align-baseline [&_sup]:text-[inherit] [&_sup]:leading-[inherit] [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: detail.description }}
      />
      {shouldShowOriginal(detail.description, originalDetail?.description) ? (
        <OriginalReference>
          <div
            className="[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-copy-gap [&_ol]:list-decimal [&_p+p]:mt-control-gap [&_sup]:align-baseline [&_sup]:text-[inherit] [&_sup]:leading-[inherit] [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: originalDetail?.description ?? "" }}
          />
        </OriginalReference>
      ) : null}
    </div>
  );
}
