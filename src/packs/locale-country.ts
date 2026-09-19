import type { PackDefinition } from "./types.js";

export const localeCountryPack: PackDefinition = {
  id: "locale_country",
  version: "1.0.0",
  title: "Locale country",
  summary:
    "Classify a construction or catalogue item into Argentina, USA, India, Uruguay, or Saudi Arabia from language and keywords in name/description.",
  when_to_use:
    "When cataloguing materials, SKUs, or construction items that should be filed under one of those five countries. Bootstrap pack from real catalogue-localization use. Not a general geocoder and not for people or addresses.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
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
    },
  },
  example_state: {
    name: "Cemento Portland CPC40 bolsa 50kg",
    description: "Cemento de uso general para obras en hormigón. Entrega en Montevideo y Canelones.",
    hints: ["bolsa", "hormigón"],
  },
  questions: [
    {
      type: "choice",
      id: "country",
      instructions:
        "Which country is the construction or catalogue item in `name` (and `description`, `hints` if present) most likely filed under? Use language, spelling, units, place names, and product keywords. Do not guess from a generic English name with no local cue.",
      criteria: {
        argentina:
          "Argentina: Rioplatense or Argentine Spanish cues (vos, hormigón, chapa, San Martín, CABA, ARS, IRAM).",
        usa: "United States: US English, imperial units (psi, 2x4, gallon), ASTM/ANSI, or US place/brand cues.",
        india:
          "India: Indian English, INR/GST, IS codes, metric bags with Indian city/state or Hindi/other Indian-language terms.",
        uruguay:
          "Uruguay: Uruguayan Spanish cues (Montevideo, Canelones, UYU, DGI, or clearly UY construction trade terms).",
        saudi_arabia:
          "Saudi Arabia: Arabic script, SAR, SASO, or Saudi city/region and Gulf construction trade cues.",
        unclear:
          "No reliable country signal among the five, or cues for several countries with no winner.",
      },
    },
    {
      type: "noul",
      id: "explicit_geo_cue",
      instructions:
        "Does `name`, `description`, or `hints` contain an explicit geographic cue (country, city, region, currency, or national standard) for one of Argentina, USA, India, Uruguay, or Saudi Arabia?",
      criteria: {
        true: "A place, currency, or national standard for one of those countries is stated.",
        false: "Only language style or generic product words, or no geo cue at all.",
      },
    },
    {
      type: "score",
      id: "locale_signal",
      instructions:
        "How strong is the country-local signal in `name`, `description`, and `hints`?",
      criteria: [
        "No local signal; the text could belong anywhere.",
        "Weak language or unit hints only.",
        "Clear language plus trade terms, but no explicit place.",
        "Explicit country, city, currency, or national standard.",
      ],
    },
  ],
  suggested_workflow: [
    "Pass the catalogue name. Add description and any pre-extracted hints.",
    "run_pack locale_country.",
    "If country.choice is unclear, or country.confidence is low, or locale_signal.score is below 2, leave the item unfiled or send it to a human.",
    "If explicit_geo_cue.noul is high, the Choice is usually safe to accept even when the name is short.",
    "Write the country onto the SKU in your database. This pack does not update catalogues.",
  ],
  notes: [
    "Closed set: Argentina, USA, India, Uruguay, Saudi Arabia, plus unclear. Do not invent a sixth country through this MCP.",
    "Language alone is weak (Spanish covers Argentina and Uruguay). Prefer explicit_geo_cue and locale_signal before committing.",
  ],
};
