import { describe, expect, it } from "vitest";

import { planRoomCreation } from "../matrixRoomCreation";

const ASSISTANT = "@ariane:localhost";
const BOB = "@bob:localhost";
const CAROL = "@carol:localhost";

describe("planRoomCreation", () => {
  it("encrypts a one-to-one between humans, whatever was asked", () => {
    expect(planRoomCreation([BOB], { encrypted: false })).toEqual({
      isDirect: true,
      wantsEncryption: true,
      invite: [BOB],
    });
  });

  it("never encrypts a one-to-one with the assistant", () => {
    expect(
      planRoomCreation([ASSISTANT], {
        encrypted: true,
        assistantUserId: ASSISTANT,
      }),
    ).toEqual({ isDirect: true, wantsEncryption: false, invite: [ASSISTANT] });
  });

  it("invites the assistant into a clear group", () => {
    expect(
      planRoomCreation([BOB, CAROL], { assistantUserId: ASSISTANT }),
    ).toEqual({
      isDirect: false,
      wantsEncryption: false,
      invite: [BOB, CAROL, ASSISTANT],
    });
  });

  it("keeps the assistant out of an encrypted group", () => {
    expect(
      planRoomCreation([BOB, CAROL], {
        encrypted: true,
        assistantUserId: ASSISTANT,
      }).invite,
    ).toEqual([BOB, CAROL]);
  });

  it("does not invite the assistant twice", () => {
    expect(
      planRoomCreation([BOB, ASSISTANT], { assistantUserId: ASSISTANT }).invite,
    ).toEqual([BOB, ASSISTANT]);
  });
});
