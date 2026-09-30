// Defines the serializable console bridge between the isolated prototype and its host.
export type PreviewConsoleLog = {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
};

// This function is serialized into srcDoc; keep all helpers inside it.
export function installPreviewConsole(buildId: string) {
  const serialize = (value: unknown): string => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try {
      const seen = new WeakSet<object>();
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === "bigint") return String(item);
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      }) ?? String(value);
    } catch {
      return String(value);
    }
  };
  for (const level of ["log", "info", "debug", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      parent.postMessage({ source: "local-prototype-preview", buildId, type: "console", level: level === "warn" || level === "error" ? level : "log", message: args.map(serialize).join(" "), timestamp: Date.now() }, "*");
    };
  }
}
