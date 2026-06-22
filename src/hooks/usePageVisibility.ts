import { useEffect, useState } from "react";

export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.hidden !== true;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      setIsVisible(document.hidden !== true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return isVisible;
}
