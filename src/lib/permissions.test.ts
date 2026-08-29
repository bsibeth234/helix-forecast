import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTrade, canViewMarket, forbiddenTopicReason } from "./permissions.ts";

describe("permissions", () => {
  it("blocks observers from trading", () => {
    assert.equal(canTrade("observer"), false);
    assert.equal(canTrade("participant"), true);
  });

  it("hides restricted individual markets from unrelated peers", () => {
    const market = {
      privacy: "restricted" as const,
      teamId: "tm_charlie",
      subjectUserId: "usr_harper",
      ownerUserId: "usr_jordan",
      status: "open",
    };
    assert.equal(
      canViewMarket({ role: "participant", userId: "usr_jamie", teamId: "tm_charlie" }, market),
      false,
    );
    assert.equal(
      canViewMarket({ role: "participant", userId: "usr_harper", teamId: "tm_charlie" }, market),
      true,
    );
    assert.equal(
      canViewMarket({ role: "sales_manager", userId: "usr_casey", teamId: "tm_charlie" }, market),
      true,
    );
  });

  it("rejects sensitive personal topics", () => {
    assert.ok(forbiddenTopicReason("Will Avery be fired this quarter?"));
    assert.equal(forbiddenTopicReason("Will Team Alpha hit 100% of quota?"), null);
  });
});
