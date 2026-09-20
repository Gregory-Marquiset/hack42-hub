import type { TFunction } from "i18next";

/** One card of the discovery panel: what the Hub does, and where to find it. */
export type DiscoveryFeature = {
  id: string;
  /** Material icon name, rendered with the icon font the app already loads. */
  icon: string;
  title: string;
  description: string;
  where: string;
};

export const getDiscoveryFeatures = (t: TFunction): DiscoveryFeature[] => [
  {
    id: "spaces",
    icon: "workspaces",
    title: t("Espaces and salons"),
    description: t(
      "An espace groups the salons of a team or a project. Favourites, salons and direct messages each keep their own list.",
    ),
    where: t("The rail on the left edge; « + » creates an espace or a salon."),
  },
  {
    id: "meetings",
    icon: "videocam",
    title: t("Meetings in the conversation"),
    description: t(
      "Start a call now or schedule it, with an agenda and documents. Ariane tells every member, and her message carries a button to join.",
    ),
    where: t("The camera button in the header of a salon."),
  },
  {
    id: "board",
    icon: "draw",
    title: t("Shared whiteboard"),
    description: t(
      "Open the whiteboard next to the call: every participant sees it at once, and each cursor carries its owner's name.",
    ),
    where: t("The whiteboard button in the meeting window."),
  },
  {
    id: "archive",
    icon: "inventory_2",
    title: t("Meeting archive"),
    description: t(
      "Once a meeting is closed, download its archive: agenda, participants, documents, transcript, call chat and whiteboard.",
    ),
    where: t("The meetings panel of a salon, under past meetings."),
  },
  {
    id: "documents",
    icon: "description",
    title: t("Documents"),
    description: t(
      "Share files from your device in a conversation, or link a Docs document to a meeting. They are encrypted when the conversation is.",
    ),
    where: t("The Documents tab of a conversation."),
  },
  {
    id: "search",
    icon: "search",
    title: t("Search everything"),
    description: t(
      "Find a conversation or a message, with filters such as from:, has: or before:. A result opens the message in its place.",
    ),
    where: t("Ctrl+K, or Cmd+K on a Mac."),
  },
  {
    id: "assistant",
    icon: "smart_toy",
    title: t("Ariane, the assistant"),
    description: t(
      "Mention @Ariane in a salon: she answers in a thread, from what she is allowed to read. /aide lists her commands.",
    ),
    where: t("Type @Ariane in the message field."),
  },
  {
    id: "encryption",
    icon: "lock",
    title: t("End-to-end encryption"),
    description: t(
      "Private messages are always encrypted. A salon is encrypted if you choose it when creating it.",
    ),
    where: t("The padlock beside a conversation's name."),
  },
  {
    id: "account",
    icon: "notifications",
    title: t("Presence, notifications and role"),
    description: t(
      "Say whether you are available or busy, choose who notifies you and how, and show your role (PO, PM, DEV…) beside your name.",
    ),
    where: t("Your account menu, at the bottom left."),
  },
];
