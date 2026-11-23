/* LexiPop - number / unit / currency / time-zone detection and conversion (pure, shared) */

export type QuantityKind =
  | "currency"
  | "length"
  | "mass"
  | "volume"
  | "temperature"
  | "speed"
  | "area"
  | "time";

export interface ParsedQuantity {
  kind: QuantityKind;
  value: number;
  /** Canonical unit / currency code / zone key. */
  unit: string;
  /** Set when a symbol was ambiguous (e.g. "$" read as USD). */
  assumed?: string;
  /** time only */
  hours?: number;
  minutes?: number;
}

export interface ConversionRow {
  label: string;
  value: string;
}

export interface ConversionResult {
  kind: QuantityKind;
  input: string;
  heading: string;
  rows: ConversionRow[];
  note?: string;
  source?: string;
}

/* ---------------- numbers ---------------- */

const NUM = String.raw`[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|[-−]?\.\d+`;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, "").replace("−", "-"));
}

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a !== 0 && a < 0.001) return n.toExponential(3);
  const opts: Intl.NumberFormatOptions =
    a >= 1000 ? { maximumFractionDigits: a >= 100000 ? 0 : 2 } : { maximumSignificantDigits: 4 };
  return new Intl.NumberFormat("en-US", opts).format(n);
}

/* ---------------- currency ---------------- */

/** ISO codes we accept in text (any of these must also exist in the rate table). */
export const CURRENCY_CODES = [
  "USD", "CAD", "PKR", "EUR", "GBP", "SAR", "AED", "INR", "JPY", "CNY", "AUD", "NZD", "CHF",
  "TRY", "QAR", "KWD", "BHD", "OMR", "BDT", "MYR", "IDR", "EGP", "MXN", "BRL", "ZAR", "SGD",
  "HKD", "KRW", "SEK", "NOK", "DKK", "AFN", "IRR", "IQD", "JOD",
] as const;

/** Currencies every conversion is shown in (the source is skipped). */
export const CURRENCY_TARGETS = ["CAD", "USD", "PKR", "EUR", "GBP", "SAR", "AED", "INR"];

const CURRENCY_SYMBOLS: Array<[RegExp, string, string?]> = [
  [/^(?:C\$|CA\$|CAD\$)/i, "CAD"],
  [/^US\$/i, "USD"],
  [/^A\$/i, "AUD"],
  [/^\$/, "USD", "“$” read as US dollars"],
  [/^€/, "EUR"],
  [/^£/, "GBP"],
  [/^₹/, "INR"],
  [/^₨|^Rs\.?/i, "PKR", "“Rs” read as Pakistani rupees"],
  [/^¥/, "JPY"],
  [/^﷼/, "SAR"],
];

const CURRENCY_WORDS: Record<string, [string, string?]> = {
  dollar: ["USD", "“dollars” read as US dollars"],
  dollars: ["USD", "“dollars” read as US dollars"],
  bucks: ["USD", "“bucks” read as US dollars"],
  euro: ["EUR"],
  euros: ["EUR"],
  rupee: ["PKR", "“rupees” read as Pakistani rupees"],
  rupees: ["PKR", "“rupees” read as Pakistani rupees"],
  riyal: ["SAR"],
  riyals: ["SAR"],
  dirham: ["AED"],
  dirhams: ["AED"],
  yen: ["JPY"],
  yuan: ["CNY"],
};

function parseCurrency(t: string): ParsedQuantity | null {
  const codes = new Set<string>(CURRENCY_CODES);
  // code before / after: "USD 100", "100 usd", "100CAD"
  let m = new RegExp(`^([A-Za-z]{3})\\s*(${NUM})$`).exec(t);
  if (m && codes.has(m[1]!.toUpperCase())) return { kind: "currency", value: toNumber(m[2]!), unit: m[1]!.toUpperCase() };
  m = new RegExp(`^(${NUM})\\s*([A-Za-z]{3})$`).exec(t);
  if (m && codes.has(m[2]!.toUpperCase())) return { kind: "currency", value: toNumber(m[1]!), unit: m[2]!.toUpperCase() };
  // symbol before: "$100", "C$ 50", "Rs. 500"
  for (const [re, code, assumed] of CURRENCY_SYMBOLS) {
    const s = re.exec(t);
    if (!s) continue;
    const rest = t.slice(s[0].length).trim();
    const n = new RegExp(`^(${NUM})$`).exec(rest);
    if (n) return { kind: "currency", value: toNumber(n[1]!), unit: code, assumed };
  }
  // symbol after: "100€", "100 $"
  m = new RegExp(`^(${NUM})\\s*([€£₹¥$])$`).exec(t);
  if (m) {
    const sym = m[2]!;
    const code = sym === "€" ? "EUR" : sym === "£" ? "GBP" : sym === "₹" ? "INR" : sym === "¥" ? "JPY" : "USD";
    return { kind: "currency", value: toNumber(m[1]!), unit: code, assumed: sym === "$" ? "“$” read as US dollars" : undefined };
  }
  // words: "100 dollars", "500 rupees", "20 canadian dollars"
  m = new RegExp(`^(${NUM})\\s*(canadian|us|american|australian)?\\s*([a-z]+)$`, "i").exec(t);
  if (m) {
    const word = m[3]!.toLowerCase();
    const adj = m[2]?.toLowerCase();
    if ((word === "dollar" || word === "dollars") && adj) {
      const code = adj === "canadian" ? "CAD" : adj === "australian" ? "AUD" : "USD";
      return { kind: "currency", value: toNumber(m[1]!), unit: code };
    }
    const hit = CURRENCY_WORDS[word];
    if (hit && !adj) return { kind: "currency", value: toNumber(m[1]!), unit: hit[0], assumed: hit[1] };
  }
  return null;
}

/** rates = units of each currency per 1 USD (open.er-api.com format). */
export function convertCurrency(q: ParsedQuantity, rates: Record<string, number>): ConversionResult | null {
  const from = rates[q.unit];
  if (!from) return null;
  const usd = q.value / from;
  const money = (n: number, code: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "code" }).format(n);
  const rows = CURRENCY_TARGETS.filter((c) => c !== q.unit && rates[c]).map((c) => ({
    label: c,
    value: money(usd * rates[c]!, c),
  }));
  return {
    kind: "currency",
    input: `${q.value} ${q.unit}`,
    heading: money(q.value, q.unit),
    rows,
    note: q.assumed,
  };
}

/* ---------------- units ---------------- */

interface UnitDef {
  kind: Exclude<QuantityKind, "currency" | "time" | "temperature">;
  code: string;
  /** factor to base unit (m, kg, L, m/s, m²) */
  f: number;
  aliases: string[];
}

const UNITS: UnitDef[] = [
  // length (m)
  { kind: "length", code: "mm", f: 0.001, aliases: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"] },
  { kind: "length", code: "cm", f: 0.01, aliases: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"] },
  { kind: "length", code: "m", f: 1, aliases: ["m", "meter", "meters", "metre", "metres"] },
  { kind: "length", code: "km", f: 1000, aliases: ["km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"] },
  { kind: "length", code: "in", f: 0.0254, aliases: ["in", "inch", "inches", '"', "″"] },
  { kind: "length", code: "ft", f: 0.3048, aliases: ["ft", "foot", "feet", "'", "′"] },
  { kind: "length", code: "yd", f: 0.9144, aliases: ["yd", "yds", "yard", "yards"] },
  { kind: "length", code: "mi", f: 1609.344, aliases: ["mi", "mile", "miles"] },
  // mass (kg)
  { kind: "mass", code: "mg", f: 1e-6, aliases: ["mg", "milligram", "milligrams"] },
  { kind: "mass", code: "g", f: 0.001, aliases: ["g", "gm", "gram", "grams", "gramme", "grammes"] },
  { kind: "mass", code: "kg", f: 1, aliases: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"] },
  { kind: "mass", code: "t", f: 1000, aliases: ["tonne", "tonnes", "metric ton", "metric tons"] },
  { kind: "mass", code: "oz", f: 0.028349523125, aliases: ["oz", "ounce", "ounces"] },
  { kind: "mass", code: "lb", f: 0.45359237, aliases: ["lb", "lbs", "pound", "pounds"] },
  { kind: "mass", code: "st", f: 6.35029318, aliases: ["st", "stone", "stones"] },
  // volume (L)
  { kind: "volume", code: "ml", f: 0.001, aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"] },
  { kind: "volume", code: "L", f: 1, aliases: ["l", "liter", "liters", "litre", "litres", "ltr"] },
  { kind: "volume", code: "tsp", f: 0.00492892159375, aliases: ["tsp", "teaspoon", "teaspoons"] },
  { kind: "volume", code: "tbsp", f: 0.01478676478125, aliases: ["tbsp", "tablespoon", "tablespoons"] },
  { kind: "volume", code: "fl oz", f: 0.0295735295625, aliases: ["fl oz", "fl. oz", "fluid ounce", "fluid ounces"] },
  { kind: "volume", code: "cup", f: 0.2365882365, aliases: ["cup", "cups"] },
  { kind: "volume", code: "pt", f: 0.473176473, aliases: ["pt", "pint", "pints"] },
  { kind: "volume", code: "qt", f: 0.946352946, aliases: ["qt", "quart", "quarts"] },
  { kind: "volume", code: "gal", f: 3.785411784, aliases: ["gal", "gallon", "gallons"] },
  // speed (m/s)
  { kind: "speed", code: "m/s", f: 1, aliases: ["m/s", "mps"] },
  { kind: "speed", code: "km/h", f: 1 / 3.6, aliases: ["km/h", "kmh", "kph", "kmph", "km/hr"] },
  { kind: "speed", code: "mph", f: 0.44704, aliases: ["mph", "mi/h", "miles per hour"] },
  { kind: "speed", code: "kn", f: 1852 / 3600, aliases: ["kn", "kt", "knot", "knots"] },
  // area (m²)
  { kind: "area", code: "m²", f: 1, aliases: ["m²", "m2", "sq m", "sqm", "square meter", "square meters", "square metre", "square metres"] },
  { kind: "area", code: "km²", f: 1e6, aliases: ["km²", "km2", "sq km", "square kilometer", "square kilometers", "square kilometre", "square kilometres"] },
  { kind: "area", code: "ft²", f: 0.09290304, aliases: ["ft²", "ft2", "sq ft", "sqft", "square foot", "square feet"] },
  { kind: "area", code: "yd²", f: 0.83612736, aliases: ["yd²", "yd2", "sq yd", "square yard", "square yards"] },
  { kind: "area", code: "acre", f: 4046.8564224, aliases: ["acre", "acres", "ac"] },
  { kind: "area", code: "ha", f: 10000, aliases: ["ha", "hectare", "hectares"] },
  { kind: "area", code: "mi²", f: 2589988.110336, aliases: ["mi²", "mi2", "sq mi", "square mile", "square miles"] },
  { kind: "area", code: "marla", f: 25.2928526, aliases: ["marla", "marlas"] },
  { kind: "area", code: "kanal", f: 505.857052, aliases: ["kanal", "kanals"] },
];

const UNIT_TARGETS: Record<UnitDef["kind"], string[]> = {
  length: ["cm", "m", "km", "in", "ft", "yd", "mi"],
  mass: ["g", "kg", "oz", "lb", "st"],
  volume: ["ml", "L", "cup", "fl oz", "gal"],
  speed: ["km/h", "mph", "m/s", "kn"],
  area: ["m²", "ft²", "acre", "ha", "km²", "marla", "kanal"],
};

const ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) for (const a of u.aliases) ALIAS.set(a.toLowerCase(), u);
const byCode = (code: string) => UNITS.find((u) => u.code === code)!;

const TEMP: Record<string, string> = {
  c: "C", "°c": "C", "º c": "C", "°": "C", celsius: "C", centigrade: "C", "degrees c": "C", "degrees celsius": "C",
  f: "F", "°f": "F", fahrenheit: "F", "degrees f": "F", "degrees fahrenheit": "F",
  k: "K", kelvin: "K",
};

function parseUnit(t: string): ParsedQuantity | null {
  // 5'10" / 5 ft 10 in  -> inches
  const h = /^(\d+)\s*(?:'|′|ft|feet|foot)\s*(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)?$/i.exec(t);
  if (h) return { kind: "length", value: Number(h[1]) * 12 + Number(h[2]), unit: "in" };

  const m = new RegExp(`^(${NUM})\\s*(.+)$`).exec(t);
  if (!m) return null;
  const value = toNumber(m[1]!);
  const unitText = m[2]!.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  const temp = TEMP[unitText.replace(/^º/, "°")];
  if (temp) return { kind: "temperature", value, unit: temp };
  const u = ALIAS.get(unitText);
  if (u) return { kind: u.kind, value, unit: u.code };
  return null;
}

function convertTemperature(q: ParsedQuantity): ConversionResult {
  const c = q.unit === "C" ? q.value : q.unit === "F" ? ((q.value - 32) * 5) / 9 : q.value - 273.15;
  const all: Array<[string, number]> = [
    ["°C", c],
    ["°F", (c * 9) / 5 + 32],
    ["K", c + 273.15],
  ];
  const srcLabel = q.unit === "K" ? "K" : `°${q.unit}`;
  return {
    kind: "temperature",
    input: `${q.value} ${srcLabel}`,
    heading: `${fmt(q.value)} ${srcLabel}`,
    rows: all.filter(([l]) => l !== srcLabel).map(([label, v]) => ({ label, value: `${fmt(Math.round(v * 10) / 10)} ${label}` })),
  };
}

export function convertUnit(q: ParsedQuantity): ConversionResult | null {
  if (q.kind === "temperature") return convertTemperature(q);
  const src = UNITS.find((u) => u.code === q.unit);
  if (!src) return null;
  const base = q.value * src.f;
  const all = UNIT_TARGETS[src.kind]
    .filter((c) => c !== src.code)
    .map((c) => ({ code: c, n: base / byCode(c).f }));
  // hide silly magnitudes (10 km in cm, a height in km) unless nothing else is left
  const sensible = all.filter(({ n }) => Math.abs(n) >= 0.01 && Math.abs(n) < 100000);
  const rows: ConversionRow[] = (sensible.length ? sensible : all).map(({ code, n }) => ({
    label: code,
    value: `${fmt(n)} ${code}`,
  }));
  // heights: also show feet + inches
  if (src.kind === "length") {
    const inches = base / 0.0254;
    if (inches >= 12 && inches < 12 * 10) {
      const ft = Math.floor(inches / 12);
      const inch = Math.round((inches - ft * 12) * 10) / 10;
      rows.push({ label: "ft + in", value: `${ft} ft ${fmt(inch)} in` });
    }
  }
  const heading = src.code === "in" && q.value >= 12 && Number.isInteger(q.value)
    ? `${Math.floor(q.value / 12)} ft ${q.value % 12} in`
    : `${fmt(q.value)} ${src.code}`;
  return { kind: src.kind, input: `${q.value} ${src.code}`, heading, rows };
}

/* ---------------- time zones ---------------- */

/** Fixed-offset abbreviations (minutes east of UTC) and generic zones (IANA). */
const ZONE_OFFSETS: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AKST: -540, AKDT: -480, HST: -600, NST: -210, NDT: -150, ADT: -180,
  BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180,
  PKT: 300, IST: 330, BDT: 360, GST: 240, KSA: 180,
  SGT: 480, HKT: 480, JST: 540, KST: 540, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780,
};
const ZONE_IANA: Record<string, string> = {
  ET: "America/Toronto", EASTERN: "America/Toronto",
  CT: "America/Chicago", CENTRAL: "America/Chicago",
  MT: "America/Denver", MOUNTAIN: "America/Denver",
  PT: "America/Los_Angeles", PACIFIC: "America/Los_Angeles",
};

export const TIME_TARGETS: Array<[string, string]> = [
  ["Toronto", "America/Toronto"],
  ["Vancouver", "America/Vancouver"],
  ["London", "Europe/London"],
  ["Makkah", "Asia/Riyadh"],
  ["Dubai", "Asia/Dubai"],
  ["Karachi", "Asia/Karachi"],
  ["Delhi", "Asia/Kolkata"],
  ["UTC", "UTC"],
];

function parseTime(t: string): ParsedQuantity | null {
  const m =
    /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s+([A-Za-z]{1,7}|(?:UTC|GMT)\s*[+-−]\s*\d{1,2}(?::?\d{2})?)$/i.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, "");
  // without am/pm or minutes, "5 PKT" is too ambiguous to be a time
  if (!ampm && !m[2]) return null;
  if (minutes > 59) return null;
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else if (hours > 23) return null;
  const zone = m[4]!.toUpperCase().replace(/\s+/g, "").replace("−", "-");
  if (!(zone in ZONE_OFFSETS) && !(zone in ZONE_IANA) && !/^(UTC|GMT)[+-]\d/.test(zone)) return null;
  return { kind: "time", value: 0, unit: zone, hours, minutes };
}

/** Minutes east of UTC for an IANA zone at a given instant. */
export function tzOffsetMinutes(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000);
}

function zoneOffset(zone: string, now: number): number {
  if (zone in ZONE_OFFSETS) return ZONE_OFFSETS[zone]!;
  if (zone in ZONE_IANA) return tzOffsetMinutes(ZONE_IANA[zone]!, now);
  const m = /^(?:UTC|GMT)([+-])(\d{1,2}):?(\d{2})?$/.exec(zone);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

function offsetLabel(min: number): string {
  const sign = min < 0 ? "−" : "+";
  const a = Math.abs(min);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ":" + String(a % 60).padStart(2, "0") : ""}`;
}

export function convertTime(q: ParsedQuantity, now = Date.now(), localZone?: string): ConversionResult {
  const off = zoneOffset(q.unit, now);
  // "today" as seen in the source zone
  const shifted = new Date(now + off * 60000);
  const instant =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), q.hours ?? 0, q.minutes ?? 0) -
    off * 60000;
  const f = (timeZone: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(
      new Date(instant)
    );
  const targets = [...TIME_TARGETS];
  if (localZone && !targets.some(([, z]) => z === localZone)) targets.unshift(["This PC", localZone]);
  const srcText = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(
    new Date(Date.UTC(2000, 0, 1, q.hours ?? 0, q.minutes ?? 0))
  );
  return {
    kind: "time",
    input: `${srcText} ${q.unit}`,
    heading: `${srcText} ${q.unit} (${offsetLabel(off)})`,
    rows: targets.map(([label, z]) => ({ label, value: f(z) })),
    note:
      q.unit in ZONE_IANA || /^(UTC|GMT|Z)/.test(q.unit)
        ? undefined
        : `${q.unit} read as a fixed offset (${offsetLabel(off)}); daylight-saving names like EDT/PDT are separate.`,
  };
}

/* ---------------- entry point ---------------- */

/** Detect a convertible quantity in a short selection. Returns null for ordinary words. */
export function parseQuantity(text: string): ParsedQuantity | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 40 || !/\d/.test(t)) return null;
  return parseTime(t) ?? parseCurrency(t) ?? parseUnit(t);
}
