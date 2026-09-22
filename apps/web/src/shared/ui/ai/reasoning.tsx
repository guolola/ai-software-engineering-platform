// shadcn.io/ai Reasoning: collapsible thinking block for streaming stage output.
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

export function Reasoning({
  title,
  defaultOpen = false,
  children,
  className,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-slot="ai-reasoning" className={cn("rounded-lg border border-border bg-muted/40", className)}>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className="text-muted-foreground h-auto w-full justify-between gap-2 px-3 py-2 text-xs font-medium"
      >
        <span className="flex min-w-0 items-center gap-2">{title}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </Button>
      <div hidden={!open} className="text-muted-foreground break-words px-3 pb-3 text-xs leading-5 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}
