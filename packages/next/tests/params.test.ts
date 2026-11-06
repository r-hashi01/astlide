import { describe, expect, it } from "vitest";
import { deckByParam } from "../src/params";

const decks = [{ name: "tour" }, { name: "50% off" }, { name: "a%41" }];

describe("deckByParam", () => {
	it("finds a deck by its name, decoded or as it is in the URL", () => {
		expect(deckByParam(decks, "tour")?.name).toBe("tour");
		expect(deckByParam(decks, "50% off")?.name).toBe("50% off");
		expect(deckByParam(decks, "50%25%20off")?.name).toBe("50% off");
	});

	it("doesn't decode a name that is already decoded", () => {
		expect(deckByParam(decks, "a%41")?.name).toBe("a%41");
	});

	it("finds nothing for an unknown name, malformed escapes included", () => {
		expect(deckByParam(decks, "nope")).toBeUndefined();
		expect(deckByParam(decks, "%E0%A4%A")).toBeUndefined();
	});
});
