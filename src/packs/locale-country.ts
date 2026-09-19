import { UNAVAILABLE_OPTION, readStringCatalog, stringCatalogChoiceCriteria } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

/** Pack-owned refuse option — not a country the caller can file under. */
export const UNCLEAR_OPTION = "unclear";

const UNCLEAR_DESCRIPTION =
  "No reliable country signal among the closed `countries` catalog, or cues for several catalog entries with no winner.";

const TEMPLATE_COUNTRY_CRITERIA = {
  [UNCLEAR_OPTION]: UNCLEAR_DESCRIPTION,
  [UNAVAILABLE_OPTION]:
    "Placeholder in describe_pack. At run_pack this key is replaced by one option per closed `countries[]` id (or kept if the catalog is empty).",
};

function countryQuestion(state: Record<string, unknown>): PackQuestion {
  const countries = readStringCatalog(state.countries);
  return {
    type: "choice",
    id: "country",
    instructions:
      "Which closed-catalog country in `countries` is the item in `name` (and `description`, `hints` if present) most likely filed under? Use language, spelling, units, place names, and product keywords. Do not guess from a generic name with no local cue. Do not invent a country outside `countries`.",
    criteria: stringCatalogChoiceCriteria(countries, UNCLEAR_DESCRIPTION, "countries", UNCLEAR_OPTION),
  };
}

function staticQuestions(): PackQuestion[] {
  return [
    {
      type: "choice",
      id: "country",
      instructions:
        "Which `countries[]` id should this item be filed under? run_pack builds options from the closed catalog (plus `unclear`).",
      criteria: { ...TEMPLATE_COUNTRY_CRITERIA },
    },
    {
      type: "noul",
      id: "explicit_geo_cue",
      instructions:
        "Does `name`, `description`, or `hints` contain an explicit geographic cue (country, city, region, currency, or national standard) for one of the closed `countries` catalog entries?",
      criteria: {
        true: "A place, currency, or national standard matching a catalog country is stated.",
        false: "Only language style or generic product words, or no geo cue at all.",
      },
    },
    {
      type: "score",
      id: "locale_signal",
      instructions:
        "How strong is the country-local signal in `name`, `description`, and `hints` relative to the closed `countries` catalog?",
      criteria: [
        "No local signal; the text could belong anywhere.",
        "Weak language or unit hints only.",
        "Clear language plus trade terms, but no explicit place.",
        "Explicit country, city, currency, or national standard.",
      ],
    },
  ];
}

export const localeCountryPack: PackDefinition = {
  id: "locale_country",
  version: "2.0.0",
  title: "Locale country",
  summary:
    "Classify an item into one country from the caller's closed `countries[]` catalog (plus `unclear`) using language and keywords in name/description/hints.",
  when_to_use:
    "When you already have a closed list of country ids and need to file a catalogue item, SKU, or similar record under exactly one of them. Not a general geocoder and not for people or addresses. This pack does not ship a built-in country list.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "countries"],
    properties: {
      name: {
        type: "string",
        description: "Item or SKU name as shown in the catalogue.",
        minLength: 1,
      },
      description: {
        type: "string",
        description: "Optional longer description, specs, or notes.",
      },
      hints: {
        type: "array",
        description: "Optional extra keywords already extracted by the caller (units, brand, city).",
        items: { type: "string" },
      },
      countries: {
        type: "array",
        description:
          "Closed catalog of country ids the caller will accept (slugs or ISO-style codes). Jev only picks among these plus `unclear`. This MCP does not invent ids.",
        minItems: 1,
        items: { type: "string", minLength: 1 },
      },
    },
  },
  example_state: {
    name: "A4 printer paper 80 g/m² 500 sheets",
    description: "Metric office paper with DIN A4 size marking.",
    hints: ["DIN", "A4", "g/m²"],
    countries: ["us", "de", "jp"],
  },
  questions: staticQuestions(),
  questionsForState: (state) =>
    staticQuestions().map((question) => (question.id === "country" ? countryQuestion(state) : question)),
  suggested_workflow: [
    "Pass the item name plus your closed countries[] catalog. Add description and any pre-extracted hints.",
    "run_pack locale_country. Choice options are exactly those catalog ids plus unclear.",
    "If country.choice is unclear, or country.confidence is low, or locale_signal.score is below 2, leave the item unfiled or send it to a human.",
    "If explicit_geo_cue.noul is high, the Choice is usually safer to accept even when the name is short.",
    "Write the country onto the record in your own store. This pack does not update catalogues.",
  ],
  notes: [
    "Breaking in 2.0.0: country options are no longer a fixed five-country list. Callers must pass countries[] (closed catalog). The MCP does not invent ids.",
    "Closed set: the caller’s countries[] plus unclear. Do not treat a sixth id as valid unless it was in the catalog.",
    "Language alone is weak when several catalog entries share a language. Prefer explicit_geo_cue and locale_signal before committing.",
    "unclear and unavailable are pack-owned. Do not put those strings in countries[].",
  ],
};
