import { useRouter } from "next/router";
import { useEffect } from "react";

import { readChatRef } from "@/features/chat/chatRefs";
import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { ChatRef } from "@/features/drivers/types";
import { HubLayout } from "@/features/layouts/HubLayout";
import type { NextPageWithLayout } from "@/features/layouts/NextPageWithLayout";

import { ChatSurface } from "./ChatSurface";

/**
 * A conversation addressed without its account — as the assistant's links
 * are, the server not knowing the account ids — read on a Hub that has only
 * one account. With several, the address is ambiguous and is left alone.
 */
const soleAccountChatRef = (
  query: ReturnType<typeof useRouter>["query"],
  entries: ReturnType<typeof useDriverEntries>,
): ChatRef | null =>
  typeof query.chat === "string" && query.account === undefined
    ? entries.length === 1
      ? { accountId: entries[0].accountId, chatId: query.chat }
      : null
    : null;

/**
 * Shared page component for both `/chat/new` and `/chat` (an existing
 * conversation, addressed by the `?account=&chat=` query). Rendering a single
 * `<ChatSurface>` for both routes — instead of swapping between a new-chat view
 * and a conversation view — keeps that surface (and its virtualized message
 * list) mounted across the transition, so committing the URL when the user
 * sends the first message to an existing conversation is seamless.
 */
const ChatRoute: NextPageWithLayout = () => {
  const router = useRouter();
  const entries = useDriverEntries();
  const isNew = router.pathname === "/chat/new";
  const urlChatRef = router.isReady
    ? (readChatRef(router.query) ?? soleAccountChatRef(router.query, entries))
    : null;
  const hasKnownAccount = Boolean(
    urlChatRef &&
    entries.some((entry) => entry.accountId === urlChatRef.accountId),
  );
  const mustRedirect = router.isReady && !isNew && !hasKnownAccount;

  useEffect(() => {
    if (mustRedirect) {
      void router.replace("/chat/new");
    }
  }, [mustRedirect, router]);

  if (mustRedirect) {
    return null;
  }

  return <ChatSurface isNew={isNew} urlChatRef={urlChatRef} />;
};

ChatRoute.getLayout = (page) => <HubLayout>{page}</HubLayout>;

export default ChatRoute;
