/* LexiPop - unit tests for the encyclopedia provider helpers */
import { describe, it, expect } from "vitest";
import { trimExtract, parseCountryBindings } from "../src/providers/wikipedia";

const v = (value: string) => ({ value });

describe("trimExtract", () => {
  it("keeps short text as is", () => {
    expect(trimExtract("Spain is a country.")).toBe("Spain is a country.");
  });
  it("cuts long text at a sentence end", () => {
    const text = "First sentence here. ".repeat(80);
    const out = trimExtract(text, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".")).toBe(true);
  });
  it("cuts Urdu text at the Urdu full stop", () => {
    const text = "اسپین یورپ کا ایک ملک ہے۔ ".repeat(60);
    expect(trimExtract(text, 150).endsWith("۔")).toBe(true);
  });
});

describe("parseCountryBindings", () => {
  it("returns null for no rows (not a country)", () => {
    expect(parseCountryBindings([])).toBeNull();
  });
  it("merges multi-valued rows and de-duplicates", () => {
    const rows = [
      { iso: v("ES"), capitalLabel: v("Madrid"), population: v("47000000"), area: v("505990"), currencyLabel: v("euro"), languageLabel: v("Spanish"), flag: v("http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Spain.svg") },
      { iso: v("ES"), capitalLabel: v("Madrid"), population: v("48000000"), area: v("505990"), currencyLabel: v("euro"), languageLabel: v("Spanish") },
    ];
    const c = parseCountryBindings(rows)!;
    expect(c.iso2).toBe("ES");
    expect(c.capital).toEqual(["Madrid"]);
    expect(c.population).toBe(48000000);
    expect(c.languages).toEqual(["Spanish"]);
    expect(c.flagUrl).toMatch(/^https:.*\?width=120$/);
  });
});
