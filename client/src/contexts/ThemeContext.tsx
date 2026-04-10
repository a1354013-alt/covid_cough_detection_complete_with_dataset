import type React from "react";
import { useEffect } from "react";

interface ThemeProviderProps {
  children: React.ReactNode;
  theme?: "light" | "dark";
}

export function ThemeProvider({ children, theme = "light" }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return <>{children}</>;
}
