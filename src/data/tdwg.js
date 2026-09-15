// Location → TDWG WGSRPD level-3 region codes, for the global "is this native
// here?" check (genus_native_region is keyed to these codes). US gardens resolve
// through their state (precise); other countries resolve to the country's set of
// TDWG regions. Codes verified against the ingested WCVP data.

// USPS state code -> TDWG level-3 code (contiguous US + AK/HI + DC).
export const US_STATE_TDWG = {
  AL: "ALA", AK: "ASK", AZ: "ARI", AR: "ARK", CA: "CAL", CO: "COL", CT: "CNT",
  DE: "DEL", DC: "WDC", FL: "FLA", GA: "GEO", HI: "HAW", ID: "IDA", IL: "ILL",
  IN: "INI", IA: "IOW", KS: "KAN", KY: "KTY", LA: "LOU", ME: "MAI", MD: "MRY",
  MA: "MAS", MI: "MIC", MN: "MIN", MS: "MSI", MO: "MSO", MT: "MNT", NE: "NEB",
  NV: "NEV", NH: "NWH", NJ: "NWJ", NM: "NWM", NY: "NWY", NC: "NCA", ND: "NDA",
  OH: "OHI", OK: "OKL", OR: "ORE", PA: "PEN", RI: "RHO", SC: "SCA", SD: "SDA",
  TN: "TEN", TX: "TEX", UT: "UTA", VT: "VER", VA: "VRG", WA: "WAS", WV: "WVA",
  WI: "WIS", WY: "WYO",
};

// Country (ISO-2) -> its TDWG level-3 regions. US uses state instead (regions: []).
// Big federated countries list all their subdivisions, so "native anywhere in the
// country" reads as native — coarser than the US state path, but honest at the
// country grain the picker offers.
export const COUNTRIES = [
  { code: "US", name: "United States", regions: [] },
  { code: "GB", name: "United Kingdom", regions: ["GRB"] },
  { code: "IE", name: "Ireland", regions: ["IRE"] },
  { code: "CA", name: "Canada", regions: ["ABT", "BRC", "MAN", "NBR", "NFL", "LAB", "NSC", "NWT", "NUN", "ONT", "PEI", "QUE", "SAS", "YUK"] },
  { code: "MX", name: "Mexico", regions: ["MXC", "MXE", "MXG", "MXN", "MXS", "MXT", "MXI"] },
  { code: "FR", name: "France", regions: ["FRA", "COR"] },
  { code: "DE", name: "Germany", regions: ["GER"] },
  { code: "ES", name: "Spain", regions: ["SPA", "BAL"] },
  { code: "IT", name: "Italy", regions: ["ITA", "SAR", "SIC"] },
  { code: "PT", name: "Portugal", regions: ["POR"] },
  { code: "NL", name: "Netherlands", regions: ["NET"] },
  { code: "BE", name: "Belgium", regions: ["BGM"] },
  { code: "CH", name: "Switzerland", regions: ["SWI"] },
  { code: "AT", name: "Austria", regions: ["AUT"] },
  { code: "SE", name: "Sweden", regions: ["SWE"] },
  { code: "NO", name: "Norway", regions: ["NOR"] },
  { code: "DK", name: "Denmark", regions: ["DEN"] },
  { code: "FI", name: "Finland", regions: ["FIN"] },
  { code: "PL", name: "Poland", regions: ["POL"] },
  { code: "CZ", name: "Czechia / Slovakia", regions: ["CZE"] },
  { code: "HU", name: "Hungary", regions: ["HUN"] },
  { code: "RO", name: "Romania", regions: ["ROM"] },
  { code: "GR", name: "Greece", regions: ["GRC", "KRI", "EAI"] },
  { code: "UA", name: "Ukraine", regions: ["UKR"] },
  { code: "IS", name: "Iceland", regions: ["ICE"] },
  { code: "TR", name: "Türkiye", regions: ["TUR", "TUE"] },
  { code: "RU", name: "Russia (European)", regions: ["RUC", "RUE", "RUN", "RUS", "RUW"] },
  { code: "JP", name: "Japan", regions: ["JAP", "NNS", "OGA"] },
  { code: "KR", name: "South Korea", regions: ["KOR"] },
  { code: "CN", name: "China", regions: ["CHC", "CHN", "CHS", "CHT", "CHM", "CHI", "CHH", "CHX"] },
  { code: "IN", name: "India", regions: ["IND", "ASS", "EHM", "WHM"] },
  { code: "AU", name: "Australia", regions: ["NSW", "QLD", "VIC", "TAS", "SAU", "WAU", "NTA"] },
  { code: "NZ", name: "New Zealand", regions: ["NZN", "NZS"] },
  { code: "BR", name: "Brazil", regions: ["BZC", "BZE", "BZL", "BZN", "BZS"] },
  { code: "ZA", name: "South Africa", regions: ["CPP", "NAT", "OFS", "TVL"] },
];

const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

// A garden's { country, state } -> the TDWG region codes to check native status in.
export const gardenRegions = ({ country, state } = {}) => {
  if (country && country !== "US") return COUNTRY_BY_CODE[country]?.regions ?? [];
  if (state && US_STATE_TDWG[state]) return [US_STATE_TDWG[state]];
  return [];
};

// A short human label for the garden's place, for warning text.
export const gardenPlaceLabel = ({ country, state } = {}) => {
  if (country && country !== "US") return COUNTRY_BY_CODE[country]?.name ?? country;
  return state || "";
};
