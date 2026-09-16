import {
  ExternalLink,
  Maximize,
  Minimize,
  XMark,
} from "@gouvfr-lasuite/ui-components/icons";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

type ActiveMeetingContextValue = {
  /** Meet call currently shown, or `null` when the user is in no call. */
  url: string | null;
  isMinimized: boolean;
  /** Shows a call in the meeting window, replacing the current one. */
  openMeeting: (url: string) => void;
};

const ActiveMeetingContext = createContext<ActiveMeetingContextValue | null>(
  null,
);

export const useActiveMeeting = (): ActiveMeetingContextValue => {
  const value = useContext(ActiveMeetingContext);
  if (!value) {
    throw new Error(
      "useActiveMeeting must be used inside ActiveMeetingProvider.",
    );
  }
  return value;
};

type MeetingWindowProps = {
  url: string;
  isMinimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onLeave: () => void;
};

/**
 * The call window. Minimizing only moves and shrinks it: the frame stays
 * mounted, so the call goes on while the user keeps using the Hub.
 */
const MeetingWindow = ({
  url,
  isMinimized,
  onMinimize,
  onRestore,
  onLeave,
}: MeetingWindowProps) => {
  const { t } = useTranslation();

  return (
    <>
      {!isMinimized && (
        <div
          className="hub__meeting-window__backdrop"
          data-testid="meeting-window-backdrop"
          onClick={onMinimize}
        />
      )}
      <section
        className="hub__meeting-window"
        data-minimized={isMinimized || undefined}
        role="dialog"
        aria-modal={!isMinimized}
        aria-label={t("Meeting")}
      >
        <header className="hub__meeting-window__bar">
          <span className="hub__meeting-window__title">
            {isMinimized ? t("Meeting in progress") : t("Meeting")}
          </span>
          <span className="hub__meeting-window__actions">
            <a
              className="hub__meeting-window__button"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("Open in a new tab")}
              title={t("Open in a new tab")}
              // The call continues in the new tab: leave the embedded one so
              // the user is not in the call twice.
              onClick={onLeave}
            >
              <ExternalLink />
            </a>
            <button
              type="button"
              className="hub__meeting-window__button"
              aria-label={
                isMinimized
                  ? t("Restore the meeting")
                  : t("Minimize the meeting")
              }
              title={
                isMinimized
                  ? t("Restore the meeting")
                  : t("Minimize the meeting")
              }
              onClick={isMinimized ? onRestore : onMinimize}
            >
              {isMinimized ? <Maximize /> : <Minimize />}
            </button>
            <button
              type="button"
              className="hub__meeting-window__button"
              data-danger="true"
              aria-label={t("Leave the meeting")}
              title={t("Leave the meeting")}
              onClick={onLeave}
            >
              <XMark />
            </button>
          </span>
        </header>
        <iframe
          className="hub__meeting-window__frame"
          src={url}
          title={t("Meeting")}
          allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
          allowFullScreen
        />
      </section>
    </>
  );
};

/**
 * Holds the Meet call the user is in, above every page: the call survives
 * navigation between conversations, and its window can be minimized to use
 * the Hub at the same time.
 */
export const ActiveMeetingProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const openMeeting = useCallback((nextUrl: string) => {
    setUrl(nextUrl);
    setIsMinimized(false);
  }, []);

  const value = useMemo(
    () => ({ url, isMinimized, openMeeting }),
    [url, isMinimized, openMeeting],
  );

  return (
    <ActiveMeetingContext.Provider value={value}>
      {children}
      {url && (
        <MeetingWindow
          url={url}
          isMinimized={isMinimized}
          onMinimize={() => setIsMinimized(true)}
          onRestore={() => setIsMinimized(false)}
          onLeave={() => {
            setUrl(null);
            setIsMinimized(false);
          }}
        />
      )}
    </ActiveMeetingContext.Provider>
  );
};
