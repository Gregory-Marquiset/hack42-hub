import { LaGaufreV2 } from "@gouvfr-lasuite/ui-components";
import { useEffect } from "react";

import { useConfig } from "@/features/config/ConfigProvider";
import { useTheme } from "@/features/theme/ThemeProvider";

import cunningham from "@cunningham";

const GAUFRE_SHADOW_HOST_SELECTOR = "#lasuite-widget-lagaufre-shadow";
const GAUFRE_DARK_STYLE_ID = "hub-gaufre-dark-theme";
const GAUFRE_DARK_STYLES = `
  #wrapper.wrapper-dialog,
  #more-apps {
    background-color: var(--c--contextuals--background--surface--secondary);
    color: var(--c--contextuals--content--semantic--neutral--primary);
  }

  #wrapper.wrapper-dialog {
    border-color: var(--c--contextuals--border--surface--primary);
  }

  #header {
    border-bottom-color: var(--c--contextuals--border--surface--primary);
  }

  #footer,
  #more-apps {
    border-top-color: var(--c--contextuals--border--surface--primary);
  }

  .service-name {
    color: var(--c--contextuals--content--semantic--neutral--primary);
  }

  #close,
  #loading,
  #show-more-button {
    color: var(--c--contextuals--content--semantic--neutral--secondary);
  }

  .service-card:hover,
  #close:hover,
  #show-more-button:hover {
    background-color: var(
      --c--contextuals--background--semantic--overlay--primary-hover
    );
  }

  .maturity-badge {
    background-color: var(
      --c--contextuals--background--semantic--neutral--tertiary
    );
    color: var(--c--contextuals--content--semantic--neutral--secondary);
  }

  #content {
    scrollbar-color: var(
        --c--contextuals--background--semantic--neutral--primary
      )
      var(--c--contextuals--background--semantic--contextual--transparent);
  }

  #content::-webkit-scrollbar-track {
    background: var(
      --c--contextuals--background--semantic--contextual--transparent
    );
  }

  #content::-webkit-scrollbar-thumb {
    background: var(--c--contextuals--background--semantic--neutral--primary);
  }

  #content::-webkit-scrollbar-thumb:hover {
    background: var(--c--contextuals--background--palette--gray--secondary);
  }
`;

// Cunningham emits theme tokens as CSS-style quoted strings ("'value'"). The
// LaGaufreV2 component expects bare strings.
const stripQuotes = (value: string) => value.replace(/^['"]|['"]$/g, "");

export const Gaufre = () => {
  const { config } = useConfig();
  const { theme, cunninghamTheme } = useTheme();

  useEffect(() => {
    const removeDarkStyles = () => {
      document.querySelectorAll(GAUFRE_SHADOW_HOST_SELECTOR).forEach((host) => {
        host.shadowRoot?.getElementById(GAUFRE_DARK_STYLE_ID)?.remove();
      });
    };

    if (theme !== "dark") {
      removeDarkStyles();
      return removeDarkStyles;
    }

    const applyDarkStyles = () => {
      document.querySelectorAll(GAUFRE_SHADOW_HOST_SELECTOR).forEach((host) => {
        const shadowRoot = host.shadowRoot;
        if (!shadowRoot || shadowRoot.getElementById(GAUFRE_DARK_STYLE_ID)) {
          return;
        }

        const style = document.createElement("style");
        style.id = GAUFRE_DARK_STYLE_ID;
        style.textContent = GAUFRE_DARK_STYLES;
        shadowRoot.appendChild(style);
      });
    };

    applyDarkStyles();

    const observer = new MutationObserver(applyDarkStyles);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      removeDarkStyles();
    };
  }, [theme]);

  if (config?.FRONTEND_HIDE_GAUFRE) {
    return null;
  }

  const gaufre = cunningham.themes[cunninghamTheme].components.gaufre;
  return (
    <LaGaufreV2
      widgetPath={stripQuotes(gaufre.widgetPath)}
      apiUrl={stripQuotes(gaufre.apiUrl)}
    />
  );
};
