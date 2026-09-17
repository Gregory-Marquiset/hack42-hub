/**
 * Material icon names the rail draws espaces with.
 *
 * "forum" is deliberately absent: the "all conversations" bubble wears it, and
 * an espace repeating it would read as that bubble.
 */
export const SPACE_ICONS = [
  "groups",
  "code",
  "brush",
  "campaign",
  "gavel",
  "school",
  "science",
  "support_agent",
  "build",
  "shield",
  "public",
  "insights",
  "badge",
  "extension",
  "flag",
  "lightbulb",
] as const;

export type SpaceIcon = (typeof SPACE_ICONS)[number];

const hashString = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
};

/**
 * One icon per espace, all different.
 *
 * An espace prefers the icon its id hashes to, so its face survives a reload
 * and a rename. A preferred icon an earlier espace already took is stepped
 * over: two identical icons side by side on the rail tell the eye less than
 * initials did. Past the palette's size a repeat is unavoidable, and the hash
 * decides which.
 */
export const assignSpaceIcons = (
  ids: readonly string[],
): Map<string, SpaceIcon> => {
  const taken = new Set<SpaceIcon>();
  const icons = new Map<string, SpaceIcon>();
  for (const id of ids) {
    if (icons.has(id)) continue;
    const preferred = hashString(id) % SPACE_ICONS.length;
    let icon = SPACE_ICONS[preferred];
    for (
      let step = 1;
      step < SPACE_ICONS.length && taken.has(icon);
      step += 1
    ) {
      icon = SPACE_ICONS[(preferred + step) % SPACE_ICONS.length];
    }
    taken.add(icon);
    icons.set(id, icon);
  }
  return icons;
};
