import { compareChats } from "@/features/chat/chatSorting";
import type { Chat } from "@/features/drivers/types";

/** The three lists the side panel is made of. */
export type ChatSectionId = "favourites" | "rooms" | "directs";

/** How many a collapsed section shows before "see all" is the only way on. */
export const SECTION_PREVIEW_COUNT = 5;

export type ChatSections = Record<ChatSectionId, Chat[]>;

/**
 * Splits conversations into the three lists, most recent first.
 *
 * A conversation appears exactly once: a favourite room is in Favourites and
 * nowhere else, because seeing it twice in one panel says nothing the first
 * row did not already say.
 */
export const partitionChats = (chats: Chat[]): ChatSections => {
  const sections: ChatSections = { favourites: [], rooms: [], directs: [] };
  for (const chat of chats) {
    if (chat.section === "favourites") {
      sections.favourites.push(chat);
    } else if (chat.kind === "direct") {
      sections.directs.push(chat);
    } else {
      sections.rooms.push(chat);
    }
  }
  for (const list of Object.values(sections)) {
    list.sort(compareChats);
  }
  return sections;
};

/**
 * Keeps the conversations one espace groups, or all of them when none is
 * chosen.
 *
 * A direct message is never filtered out: it belongs to no espace, so an
 * espace could only ever empty that list, and a panel answering "no
 * conversation" for someone's whole address book reads as broken rather than
 * as a filter. An espace groups rooms, so that is what it narrows.
 */
export const filterChatsBySpace = (
  chats: Chat[],
  chatIds: ReadonlySet<string> | null,
): Chat[] =>
  chatIds
    ? chats.filter((chat) => chat.kind === "direct" || chatIds.has(chat.id))
    : chats;
