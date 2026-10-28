import { describe, expect, it } from "vitest";
import { accountLabel } from "@/lib/account-label";

const mine = (name: string) => ({ id: name, name, ownerName: "Ann", isMine: true });
const theirs = (name: string) => ({ id: name, name, ownerName: "Ben", isMine: false });
const owner = { id: "u", name: "Ann", isMine: true };

describe("accountLabel", () => {
  it("keeps my own accounts plain", () => {
    expect(accountLabel({ account: mine("Cash"), transferTo: null, owner })).toBe("Cash");
    expect(accountLabel({ account: mine("Cash"), transferTo: mine("Bank"), owner })).toBe("Cash → Bank");
  });

  it("names the person for someone else's account", () => {
    expect(accountLabel({ account: theirs("Cash"), transferTo: null, owner })).toBe("Ben · Cash");
  });

  it("names both people when a transfer crosses profiles", () => {
    expect(accountLabel({ account: mine("Cash"), transferTo: theirs("Bank"), owner })).toBe("Ann · Cash → Ben · Bank");
    expect(accountLabel({ account: theirs("Bank"), transferTo: mine("Cash"), owner })).toBe("Ben · Bank → Ann · Cash");
  });
});
