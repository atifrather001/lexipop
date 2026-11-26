/* LexiPop - Arabic-script normalisation */
import { describe, it, expect } from "vitest";
import { lookupCandidates, stripArabicMarks } from "../src/providers/arabicScript";

describe("Arabic script helpers", () => {
  it("strips vowel marks and tatweel", () => {
    expect(stripArabicMarks("تَبَرُّعًا")).toBe("تبرعا");
    expect(stripArabicMarks("كتـــاب")).toBe("كتاب");
  });
  it("guesses the dictionary form", () => {
    const c = lookupCandidates("تبرعًا", "ar");
    expect(c[0]).toBe("تبرعًا");
    expect(c).toContain("تبرعا");
    expect(c).toContain("تبرع");
    expect(lookupCandidates("والكتاب", "ar")).toContain("كتاب");
    expect(lookupCandidates("المكتبة", "ar")).toContain("مكتب");
  });
  it("only strips marks for Urdu", () => {
    expect(lookupCandidates("کِتاب", "ur")).toEqual(["کِتاب", "کتاب"]);
  });
});

import { detectLang, resolveLang } from "../src/shared/textkind";

describe("Auto language detection", () => {
  it("tells English, Arabic and Urdu apart", () => {
    expect(detectLang("world")).toBe("en");
    expect(detectLang("تبرعًا")).toBe("ar");
    expect(detectLang("أعضاء")).toBe("ar");
    expect(detectLang("مكتبة")).toBe("ar");
    expect(detectLang("ٹھیک")).toBe("ur");
    expect(detectLang("کہاں")).toBe("ur");
    expect(detectLang("بڑا")).toBe("ur");
  });
  it("respects an explicit choice", () => {
    expect(resolveLang("عضو", "auto")).toBe("ar");
    expect(resolveLang("عضو", "ur")).toBe("ur");
    expect(resolveLang("عضو", "en")).toBe("ar");
    expect(resolveLang("world", "auto")).toBe("en");
  });
});
