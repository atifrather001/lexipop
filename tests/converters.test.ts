/* LexiPop - unit tests for converters, text classification and chunking */
import { describe, it, expect } from "vitest";
import { parseQuantity, convertCurrency, convertUnit, convertTime } from "../src/shared/convert";
import { isRunningText, hasArabicScript } from "../src/shared/textkind";
import { chunkText } from "../src/providers/textTranslate";

const rates = { USD: 1, CAD: 1.4, PKR: 280, EUR: 0.9, GBP: 0.75, SAR: 3.75, AED: 3.6725, INR: 90 };

describe("parseQuantity", () => {
  it.each([
    ["$100", "currency", "USD", 100],
    ["C$ 50", "currency", "CAD", 50],
    ["Rs. 500", "currency", "PKR", 500],
    ["100 usd", "currency", "USD", 100],
    ["20€", "currency", "EUR", 20],
    ["20 canadian dollars", "currency", "CAD", 20],
    ["5 miles", "length", "mi", 5],
    ["5'10\"", "length", "in", 70],
    ["72 kg", "mass", "kg", 72],
    ["30°F", "temperature", "F", 30],
    ["-40 C", "temperature", "C", -40],
    ["100 km/h", "speed", "km/h", 100],
    ["10 marla", "area", "marla", 10],
  ])("%s", (text, kind, unit, value) => {
    const q = parseQuantity(text)!;
    expect(q.kind).toBe(kind);
    expect(q.unit).toBe(unit);
    expect(q.value).toBe(value);
  });

  it.each(["run", "2026", "5 PKT", "100 the", "the 5 boys", "Hello world"])("ignores %s", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });

  it("parses times with a zone", () => {
    const q = parseQuantity("3 PM EST")!;
    expect(q.kind).toBe("time");
    expect(q.hours).toBe(15);
  });
});

describe("conversions", () => {
  it("converts currency through USD", () => {
    const r = convertCurrency(parseQuantity("$100")!, rates)!;
    expect(r.rows.find((x) => x.label === "CAD")!.value).toContain("140.00");
    expect(r.rows.some((x) => x.label === "USD")).toBe(false);
  });
  it("converts temperature", () => {
    const r = convertUnit(parseQuantity("-40 C")!)!;
    expect(r.rows.find((x) => x.label === "°F")!.value).toBe("-40 °F");
  });
  it("hides silly magnitudes", () => {
    const labels = convertUnit(parseQuantity("10 km")!)!.rows.map((r) => r.label);
    expect(labels).not.toContain("cm");
    expect(labels).toContain("mi");
  });
  it("shows a height in ft + in", () => {
    const r = convertUnit(parseQuantity("178 cm")!)!;
    expect(r.rows.find((x) => x.label === "ft + in")!.value).toBe("5 ft 10.1 in");
  });
  it("handles daylight saving for generic ET", () => {
    expect(convertTime(parseQuantity("3pm ET")!, Date.UTC(2026, 6, 1, 12)).heading).toContain("UTC−4");
    expect(convertTime(parseQuantity("3pm ET")!, Date.UTC(2026, 0, 15, 12)).heading).toContain("UTC−5");
  });
  it("converts a fixed zone", () => {
    const r = convertTime(parseQuantity("15:30 GMT")!, Date.UTC(2026, 10, 23, 12));
    expect(r.rows.find((x) => x.label === "Toronto")!.value).toBe("Mon 10:30 AM");
    expect(r.rows.find((x) => x.label === "Karachi")!.value).toBe("Mon 8:30 PM");
  });
});

describe("text classification", () => {
  it("keeps words and short phrases for the dictionary", () => {
    expect(isRunningText("take off")).toBe(false);
    expect(isRunningText("New York City")).toBe(false);
  });
  it("treats sentences as running text", () => {
    expect(isRunningText("I am going home now")).toBe(true);
    expect(isRunningText("Hello. How are")).toBe(true);
  });
  it("detects Arabic script", () => {
    expect(hasArabicScript("اسپین")).toBe(true);
    expect(hasArabicScript("Spain")).toBe(false);
  });
});

describe("chunkText", () => {
  it("keeps every chunk under MyMemory's 500-byte limit", () => {
    const enc = new TextEncoder();
    const en = "This is a sentence about Spain. ".repeat(40);
    const ur = "یہ ایک لمبا جملہ ہے جس میں بہت سارے الفاظ ہیں ".repeat(30);
    for (const t of [en, ur]) expect(chunkText(t).every((c) => enc.encode(c).length <= 450)).toBe(true);
    expect(chunkText(en).join(" ")).toBe(en.trim());
  });
});
