// Displays bundled client marks, with honest generic symbols where no product mark is available.
import { CodeXml, Plug } from "lucide-react";
import claudeUrl from "@lobehub/icons-static-svg/icons/claude-color.svg?url";
import codexUrl from "@lobehub/icons-static-svg/icons/codex-color.svg?url";
import cursorUrl from "@lobehub/icons-static-svg/icons/cursor.svg?url";
import deepseekUrl from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import kimiUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg?url";
import minimaxUrl from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import qoderUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg?url";
import qwenUrl from "@lobehub/icons-static-svg/icons/qwen-color.svg?url";
import traeUrl from "@lobehub/icons-static-svg/icons/trae-color.svg?url";
import { cn } from "../../../shared/ui/utils";
import type { McpClientId } from "../model/client-configurations";

const clientMarks: Partial<Record<McpClientId, string>> = {
  claude: claudeUrl,
  codex: codexUrl,
  deepseek: deepseekUrl,
  kimi: kimiUrl,
  minimax: minimaxUrl,
  "minimax-cloud": minimaxUrl,
  qoder: qoderUrl,
  qwen: qwenUrl,
  trae: traeUrl,
};

export function ClientIcon({ clientId, className }: { clientId: McpClientId; className?: string }) {
  const mark = clientMarks[clientId];

  // Kimi's bundled mark has white lettering, while other color marks need a light tile.
  return <span aria-hidden="true" className={cn("inline-flex size-12 shrink-0 items-center justify-center", className)}>
    {clientId === "cursor" ? <span
      className="size-full bg-foreground"
      style={{
        maskImage: `url(${cursorUrl})`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url(${cursorUrl})`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    /> : mark ? <img alt="" src={mark} className={cn("size-full rounded-md object-contain p-1", clientId === "kimi" ? "bg-black" : "bg-white")} />
      : clientId === "vscode" ? <CodeXml className="size-10 text-foreground" strokeWidth={1.5} />
      : <Plug className="size-10 text-foreground" strokeWidth={1.5} />}
  </span>;
}
