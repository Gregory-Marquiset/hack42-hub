import { Avatar, AvatarSize } from "@/features/ui/components/avatar/Avatar";
import { AssistantGlyph } from "@/features/ui/components/avatar/AssistantGlyph";
import type { AvatarColor } from "@/features/ui/components/avatar/palette";

import { useAssistant } from "../hooks/useAssistant";

type AssistantAvatarProps = {
  label: string;
  size?: AvatarSize;
  decorative?: boolean;
  className?: string;
};

/**
 * The assistant's bubble, the same everywhere she appears: one fixed palette
 * colour instead of a hash of her name, and her face instead of an initial,
 * so she is told apart from a person at a glance.
 */
export const AssistantAvatar = ({
  label,
  size,
  decorative,
  className,
}: AssistantAvatarProps) => (
  <Avatar
    label={label}
    color="brand"
    size={size}
    decorative={decorative}
    className={className}
  >
    <AssistantGlyph />
  </Avatar>
);

type UserAvatarProps = AssistantAvatarProps & {
  /** Matrix id of the user, compared with the assistant's. */
  userId: string;
  color?: AvatarColor;
  initials?: string;
};

/**
 * A person's avatar, or the assistant's when the id is hers.
 *
 * Every place that shows who wrote or who is listed goes through here, so the
 * assistant never falls back to an initial in one corner of the app.
 */
export const UserAvatar = ({
  userId,
  label,
  color,
  initials,
  size,
  decorative,
  className,
}: UserAvatarProps) => {
  const assistant = useAssistant();
  // Until her id is known - and for good if the request failed - she gets the
  // same initials avatar as anyone: a degraded state, never a wrong one.
  if (assistant.userId !== "" && userId === assistant.userId) {
    return (
      <AssistantAvatar
        label={label}
        size={size}
        decorative={decorative}
        className={className}
      />
    );
  }
  return (
    <Avatar
      label={label}
      color={color}
      size={size}
      decorative={decorative}
      className={className}
    >
      {initials}
    </Avatar>
  );
};
