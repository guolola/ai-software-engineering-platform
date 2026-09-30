// Expands the same preview DOM, with a viewport fallback when native fullscreen is unavailable.
import { useCallback, useEffect, useRef, useState } from "react";

export function usePreviewFullscreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => {
      setNativeFullscreen(Boolean(rootRef.current && document.fullscreenElement === rootRef.current));
      if (!document.fullscreenElement) returnFocusRef.current?.focus();
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        returnFocusRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [expanded]);

  const toggleFullscreen = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      returnFocusRef.current?.focus();
      return;
    }
    if (rootRef.current && document.fullscreenElement === rootRef.current) {
      await document.exitFullscreen();
      return;
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen();
        return;
      }
    } catch {
      // Browsers and embedded hosts may reject fullscreen; preserve the iframe in place.
    }
    setExpanded(true);
  }, [expanded]);

  return { rootRef, expanded, fullscreen: expanded || nativeFullscreen, toggleFullscreen };
}
