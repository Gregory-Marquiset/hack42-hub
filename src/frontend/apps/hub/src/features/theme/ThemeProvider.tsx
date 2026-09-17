import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "hub-theme";

type ThemeContextValue = {
  theme: Theme;
  cunninghamTheme: "dsfr-light" | "dsfr-dark";
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getStoredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "light";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      cunninghamTheme: theme === "dark" ? "dsfr-dark" : "dsfr-light",
      toggleTheme: () => {
        setTheme((currentTheme) => {
          const nextTheme = currentTheme === "light" ? "dark" : "light";
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
          return nextTheme;
        });
      },
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
