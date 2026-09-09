import { describe, expect, it } from "vitest";

import { normaliseAngle, parseChatCommand } from "./command";

describe("normaliseAngle", () => {
  it.each([
    [0, 0],
    [360, 0],
    [-20, 340],
    [370, 10],
    [720, 0],
    [-360, 0],
    [45.5, 45.5],
    [-0.5, 359.5],
  ])("normalise(%s) === %s", (input, expected) => {
    expect(normaliseAngle(input)).toBeCloseTo(expected, 6);
  });

  it("returns NaN for non-finite input", () => {
    expect(Number.isNaN(normaliseAngle(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe("parseChatCommand — accepted forms", () => {
  const ok = (input: string, angle: number, power: number) => {
    expect(parseChatCommand(input)).toEqual({ ok: true, kind: "swing", angle, power });
  };

  it("degree sign + comma", () => ok("!70°, 50", 70, 50));
  it("comma only", () => ok("!70, 50", 70, 50));
  it("space only", () => ok("!70 50", 70, 50));
  it("no separator, degree glued", () => ok("!70°50", 70, 50));
  it("no separator at all", () => ok("!70 50", 70, 50));
  it("negative direction is normalised", () => ok("!-20, 40", 340, 40));
  it("direction > 360 is normalised", () => ok("!370, 40", 10, 40));
  it("golf verb prefix", () => ok("!golf 70 50", 70, 50));
  it("g verb prefix", () => ok("!g 70 50", 70, 50));
  it("verbose dir/pow words", () => ok("!dir 70 pow 50", 70, 50));
  it("extra tokens are ignored", () => ok("!70, 50, 999 lets go", 70, 50));
  it("leading and trailing whitespace", () => ok("   !  70 , 50   ", 70, 50));
  it("power above 100 clamps to 100", () => ok("!90, 250", 90, 100));
  it("fractional angle rounds to 0.1", () => ok("!70.46, 50", 70.5, 50));
  it("fractional power rounds to an integer", () => ok("!70, 49.6", 70, 50));
  it("masculine ordinal sign is tolerated", () => ok("!70º,50", 70, 50));
  it("angle 359.99 wraps to 0", () => ok("!359.99, 50", 0, 50));
});

describe("parseChatCommand — rejected", () => {
  const reason = (input: string, expected: string) => {
    const result = parseChatCommand(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(expected);
  };

  it("no leading bang", () => reason("70 50", "not-a-command"));
  it("unknown verb (another bot)", () => reason("!sr https://y.tld/watch?v=12", "not-a-command"));
  it("song-request style", () => reason("!uptime", "not-a-command"));
  it("bang only", () => reason("!", "not-a-command"));
  it("known verb, no numbers", () => reason("!golf go", "no-numbers"));
  it("only one number", () => reason("!70", "missing-power"));
  it("explicit power zero", () => reason("!70, 0", "power-zero"));
  it("power that rounds to zero", () => reason("!70, 0.3", "power-zero"));
  it("negative power", () => reason("!70, -5", "bad-power"));
  it("non-string input", () => reason(undefined as unknown as string, "not-a-command"));
});

describe("parseChatCommand — fuzz: never throws, output always in range", () => {
  // Small deterministic LCG so the fuzz run is reproducible.
  const lcg = (seed: number) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  };
  const alphabet = "!0123456789 ,.°º-+golfdirpw\t\n";

  it("5000 random strings", () => {
    const rand = lcg(0xc0ffee);
    for (let i = 0; i < 5000; i++) {
      const len = Math.floor(rand() * 24);
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet.charAt(Math.floor(rand() * alphabet.length));

      const result = parseChatCommand(s);
      expect(typeof result.ok).toBe("boolean");
      if (result.ok) {
        expect(result.angle).toBeGreaterThanOrEqual(0);
        expect(result.angle).toBeLessThan(360);
        expect(result.power).toBeGreaterThan(0);
        expect(result.power).toBeLessThanOrEqual(100);
        expect(Number.isInteger(result.power)).toBe(true);
      }
    }
  });
});
