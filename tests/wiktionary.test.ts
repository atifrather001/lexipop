/* LexiPop - Wiktionary definition parsing */
import { describe, it, expect } from "vitest";
import { definitionsFrom, topLevelItems } from "../src/providers/wiktionary";

const html = `<div class="mw-heading mw-heading3"><h3 id="Proper_noun">Proper noun</h3></div>
<p><strong>Lebanon</strong></p>
<ol><li>A <a href="/wiki/country">country</a> in West Asia. Capital: Beirut.<dl><dd><span class="h-usage-example"><i class="e-example">He moved to <b>Lebanon</b>.</i></span></dd></dl><ul><li>quote</li></ul></li>
<li>Ellipsis of Mount Lebanon.<ol><li>sub-sense</li></ol></li></ol>
<div class="mw-heading mw-heading4"><h4 id="Derived_terms">Derived terms</h4></div><ul><li>Lebanese</li></ul>
<div class="mw-heading mw-heading3"><h3 id="Noun_2">Noun</h3></div><ol><li>(rare) cedar wood.</li></ol>`;

describe("Wiktionary definitions", () => {
  it("reads proper nouns and nouns, skipping nested lists", () => {
    const defs = definitionsFrom(html);
    expect(defs.map((d) => d.partOfSpeech)).toEqual(["proper noun", "proper noun", "noun"]);
    expect(defs[0]!.definition).toBe("A country in West Asia. Capital: Beirut.");
    expect(defs[0]!.example).toBe("He moved to Lebanon.");
    expect(defs[1]!.definition).toBe("Ellipsis of Mount Lebanon.");
  });
  it("returns only top-level list items", () => {
    expect(topLevelItems("<ol><li>a<ol><li>x</li></ol></li><li>b</li></ol>")).toEqual(["a<ol><li>x</li></ol>", "b"]);
  });
});
