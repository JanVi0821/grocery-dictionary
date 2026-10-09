"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type CollectionNode = {
  id: number;
  name: string;
  children: CollectionNode[];
};

function CollectionNodes({
  depth,
  nodes,
}: {
  depth: number;
  nodes: CollectionNode[];
}) {
  const t = useTranslations("Explore");

  return (
    <ul>
      {nodes.map((node) => (
        <li
          key={node.id}
          className={cn(
            "border-t border-border",
            depth === 0 && "first:border-t-0",
          )}
        >
          {node.children.length > 0 ? (
            <Collapsible>
              <div
                className="flex items-center pr-control-x hover:bg-surface-muted focus-within:bg-surface-muted"
                style={{
                  paddingInlineStart: `calc(var(--spacing-control-x) * ${depth})`,
                }}
              >
                <CollapsibleTrigger
                  className="group focus-ring grid size-touch shrink-0 place-items-center text-foreground-muted hover:text-foreground"
                  aria-label={t("toggleSubcollections", { name: node.name })}
                >
                  <ChevronRight
                    className="size-nav-icon transition-transform duration-150 ease-out group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <Link
                  href={`/explore/${node.id}`}
                  className={cn(
                    "focus-ring flex min-h-touch min-w-0 flex-1 items-center font-semibold text-foreground",
                    depth > 0 && "text-label",
                  )}
                >
                  <span className="truncate">{node.name}</span>
                </Link>
              </div>
              <CollapsibleContent>
                <CollectionNodes depth={depth + 1} nodes={node.children} />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <Link
              href={`/explore/${node.id}`}
              className={cn(
                "focus-ring flex min-h-touch items-center pr-control-x font-medium text-foreground hover:bg-surface-muted focus-visible:bg-surface-muted",
                depth > 0 && "text-label",
              )}
              style={{
                paddingInlineStart: `calc(var(--spacing-control-x) * ${depth} + var(--spacing-touch))`,
              }}
            >
              <span className="truncate">{node.name}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CollectionTreeView({ nodes }: { nodes: CollectionNode[] }) {
  return (
    <div className="mt-control-gap overflow-hidden rounded-control border border-border bg-surface">
      <CollectionNodes depth={0} nodes={nodes} />
    </div>
  );
}
