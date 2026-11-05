"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const path = "lib/assistanceRequestTextValidation.ts";
const input = fs.readFileSync(path, "utf8");
const output = ts.transpileModule(input, {
  fileName: path,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(output.diagnostics?.length || 0, 0, "Word validator must compile");
const mod = { exports: {} };
new Function("module", "exports", output.outputText)(mod, mod.exports);
const {
  assistanceWordCount,
  assistanceTextError,
  ASSISTANCE_TITLE_MIN_WORDS,
  ASSISTANCE_TITLE_MAX_WORDS,
  ASSISTANCE_DESCRIPTION_MIN_WORDS,
  ASSISTANCE_DESCRIPTION_MAX_WORDS,
} = mod.exports;
assert.equal(ASSISTANCE_TITLE_MIN_WORDS, 4);
assert.equal(ASSISTANCE_TITLE_MAX_WORDS, 20);
assert.equal(ASSISTANCE_DESCRIPTION_MIN_WORDS, 20);
assert.equal(ASSISTANCE_DESCRIPTION_MAX_WORDS, 300);
assert.equal(assistanceWordCount(""), 0);
assert.equal(assistanceWordCount("  Food  and   Veterinary Assistance  "), 4);
assert.equal(assistanceWordCount("Pangangalaga sa mga asong nailigtas."), 5);
assert.equal(assistanceWordCount("asdasdasdasdasdasdasdasd"), 1,
  "Long random text without spaces is one word, not a valid description");
assert.equal(assistanceWordCount("... !!!"), 0, "Punctuation is not a word");

const validTitle = "Food and Medical Assistance for Rescued Dogs";
const validDescription = [
  "We are requesting assistance for the dogs currently under our care.",
  "Food and veterinary support are needed for their daily safety and treatment.",
  "The funds will pay for necessary supplies and checkups.",
].join(" ");
assert.equal(assistanceTextError(validTitle, "title"), "", "Normal title must be allowed");
assert.equal(assistanceTextError(validDescription, "description"), "", "Normal description must be allowed");
assert.match(assistanceTextError("asdasdasdasdasdasdasdasd", "title"), /at least 4 words/);
assert.match(assistanceTextError("asdasdasdasdasdasdasdasd", "description"), /at least 20 words/);
assert.match(assistanceTextError("one two three", "title"), /at least 4 words/);
assert.match(assistanceTextError("same same same same", "title"), /different words/);
assert.match(assistanceTextError(Array(20).fill("dog").join(" "), "description"), /repeated text/);
assert.match(assistanceTextError(Array.from({length:21}, (_,i)=>"dog"+i).join(" "), "title"), /20 words or fewer/);
assert.match(assistanceTextError(Array.from({length:301}, (_,i)=>"help"+i).join(" "), "description"), /300 words or fewer/);
assert.match(assistanceTextError("111 222 333 444", "title"), /not only numbers/);
assert.equal(assistanceTextError("Rescue and Treatment for Stray Dogs", "title"), "");
assert.equal(assistanceTextError(validDescription + "  ", "description"), "");

const ui=fs.readFileSync("app/(tabs)/resident.tsx","utf8");
for(const required of [
  "assistanceWordCount(title)",
  "assistanceWordCount(description)",
  'assistanceTextError(title, "title")',
  'assistanceTextError(description, "description")',
  "setDetailsValidationAttempted(true)",
  "showTitleWordError",
  "showDescriptionWordError",
  "assistanceTextFieldInvalid",
  "assistanceWordErrorRow",
  "onBlur={() => setTitleTouched(true)}",
  "onBlur={() => setDescriptionTouched(true)}",
  "if (titleWordError)",
  "if (descriptionWordError)",
  "const goNext = () =>",
  "const submitRequest = async () =>",
  "maxLength={160}",
  "maxLength={2000}",
]) assert(ui.includes(required), "Missing Resident form integration: " + required);
assert(!ui.includes("title.trim().length < 5"), "Outdated character-only title gate should be gone");
assert(!ui.includes("description.trim().length < 20"), "Outdated character-only description gate should be gone");
console.log("PASS Resident Assistance 4-20 title words, 20-300 description words, nonsense/repeated text, inline feedback, Next and Submit guards.");
