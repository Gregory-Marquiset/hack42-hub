import {
  QuickSearchItem,
  QuickSearchItemTemplate,
} from "@gouvfr-lasuite/ui-components";
import { useTranslation } from "react-i18next";

import type { MessageSearchResult } from "@/features/chat/search/types";

import { HighlightedExcerpt } from "./highlightExcerpt";

export type MessageSearchResultRowProps = {
  id: string;
  result: MessageSearchResult;
  accountLabel?: string;
  onSelect: () => void;
};

export const MessageSearchResultRow = ({
  id,
  result,
  accountLabel,
  onSelect,
}: MessageSearchResultRowProps) => {
  const { t } = useTranslation();

  const timestamp = new Date(result.timestamp);
  const timeString = timestamp.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <QuickSearchItem id={id} onSelect={onSelect}>
      <QuickSearchItemTemplate
        alwaysShowRight
        left={
          <span className="hub__message-search-row">
            <span className="hub__message-search-row__sender">
              {result.senderName}
              {accountLabel && (
                <span className="hub__message-search-row__account">
                  {" "}
                  · {accountLabel}
                </span>
              )}
              <span className="hub__message-search-row__timestamp">
                {" "}
                · {timeString}
              </span>
            </span>
            <span className="hub__message-search-row__excerpt">
              <HighlightedExcerpt
                excerpt={result.excerpt}
                matchRanges={result.matchRanges}
              />
            </span>
          </span>
        }
        right={
          <span className="hub__message-search-row__action">
            {t("Jump to message")}
            <span className="material-icons" aria-hidden="true">
              arrow_forward
            </span>
          </span>
        }
      />
    </QuickSearchItem>
  );
};
