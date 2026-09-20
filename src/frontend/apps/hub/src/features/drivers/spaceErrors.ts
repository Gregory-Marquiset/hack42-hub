/**
 * The current user may not list a room in this espace (in Matrix, their power
 * level is below the one `m.space.child` requires). Raised before the room is
 * created, so none is left outside its espace.
 */
export class SpaceChildNotAllowedError extends Error {
  constructor(spaceId: string) {
    super(`Adding a room to espace "${spaceId}" is not allowed.`);
    this.name = "SpaceChildNotAllowedError";
  }
}
