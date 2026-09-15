// Plant vocabulary + journey taxonomy. Seed data for the prototype; in production
// the plant tables are filled by scripts/ingest-plants.mjs and read via Supabase.

export const ECOREGIONS = [
  "Eastern Temperate Forests",
  "Great Plains",
  "Northwestern Forested Mountains",
  "Marine West Coast Forest",
  "Mediterranean California",
  "North American Deserts",
];

// Keystone status per ecoregion is taken directly from the NWF "Keystone Plants
// by Ecoregion" guides (Tallamy Lepidoptera-host + Fowler specialist-bee data).
// These ks arrays must stay in sync with supabase/migrations/0015_keystone_seed.sql
// — the DB view (post_card.plants[].keystone) and this client list are the same
// data, so the ★ hint says the same thing whether it's computed here or read back.
const ETF = "Eastern Temperate Forests", GP = "Great Plains", NWFM = "Northwestern Forested Mountains",
  MWCF = "Marine West Coast Forest", MEDCA = "Mediterranean California", NAD = "North American Deserts";
const ALL6 = [ETF, GP, NWFM, MWCF, MEDCA, NAD];

export const GENERA = [
  { g: "Quercus", common: "Oaks", type: "tree", ks: ALL6 },
  { g: "Prunus", common: "Cherries & plums", type: "tree", ks: ALL6 },
  { g: "Salix", common: "Willows", type: "tree", ks: ALL6 },
  { g: "Betula", common: "Birches", type: "tree", ks: ALL6 },
  { g: "Populus", common: "Cottonwoods & aspens", type: "tree", ks: [ETF, GP, NWFM, MWCF, NAD] },
  { g: "Acer", common: "Maples", type: "tree", ks: ALL6 },
  { g: "Vaccinium", common: "Blueberries", type: "shrub", ks: [ETF, GP, NWFM, MWCF, NAD] },
  { g: "Solidago", common: "Goldenrods", type: "perennial", ks: ALL6 },
  { g: "Symphyotrichum", common: "Asters", type: "perennial", ks: [ETF, GP, NWFM, MWCF] },
  { g: "Helianthus", common: "Sunflowers", type: "perennial", ks: ALL6 },
  { g: "Rudbeckia", common: "Coneflowers", type: "perennial", ks: [ETF, GP, MWCF] },
  { g: "Ceanothus", common: "Wild lilacs", type: "shrub", ks: [MEDCA, NAD] },
  // Native and taggable, but not on NWF's keystone (top-host) lists.
  { g: "Eupatorium", common: "Bonesets", type: "perennial", ks: [] },
  { g: "Lupinus", common: "Lupines", type: "perennial", ks: [] },
  { g: "Arctostaphylos", common: "Manzanitas", type: "shrub", ks: [] },
  { g: "Asclepias", common: "Milkweeds", type: "perennial", ks: [] },
  { g: "Echinacea", common: "Purple coneflowers", type: "perennial", ks: [] },
  { g: "Monarda", common: "Bee balms", type: "perennial", ks: [] },
  { g: "Liatris", common: "Blazing stars", type: "perennial", ks: [] },
  { g: "Schizachyrium", common: "Little bluestem", type: "grass", ks: [] },
];

export const PALETTES = {
  Quercus: ["#5b4a2f", "#8a7a4d", "#3f4a2a"],
  Solidago: ["#c79a1e", "#e6c14a", "#4b5b2a"],
  Symphyotrichum: ["#6e5fa8", "#a48fd1", "#3b4a2e"],
  Asclepias: ["#c9765f", "#e59f8a", "#5c6b3a"],
  Helianthus: ["#d19a2a", "#f0c95a", "#5a4b28"],
  Vaccinium: ["#2f3f66", "#6f5f96", "#3c5232"],
  Prunus: ["#b86e7f", "#e6b7c2", "#4a5a35"],
  Lupinus: ["#4d5aa0", "#8c95d1", "#5f6f3c"],
  Ceanothus: ["#5b6bb5", "#9aa5dc", "#6a7a48"],
  Liatris: ["#8e5aa3", "#c393d3", "#5b6b3c"],
};

/*
  JOURNEY TAXONOMY. Two axes, both derived from what people actually post and
  what extension/watershed programs teach:
    PROJECT = what kind of garden it is (r/NativePlantGardening flair, BWSR/Blue Thumb
              program categories, county extension case studies)
    STAGE   = where in the project the photo was taken (the "sleep, creep, leap"
              vernacular for perennial establishment, plus the prep methods people
              document: tarping/solarization, sheet mulch, sod cutting, winter sowing)
  Stored on the post so someone at "site prep" can filter to other people's site prep,
  or jump to "year 3" to see where it's going.
*/
export const PROJECTS = [
  { id: "lawn", name: "Lawn conversion", blurb: "Turf out, natives in" },
  { id: "rain", name: "Rain garden", blurb: "Downspout, berm, basin" },
  { id: "boulevard", name: "Boulevard / hellstrip", blurb: "Between sidewalk and street" },
  { id: "prairie", name: "Prairie or meadow", blurb: "Seeded, not planted" },
  { id: "beelawn", name: "Bee lawn", blurb: "Low natives seeded into turf" },
  { id: "shade", name: "Shade / woodland", blurb: "Under the trees" },
  { id: "pocket", name: "Pocket & containers", blurb: "Balcony, patio, one bed" },
  { id: "slope", name: "Slope or shoreline", blurb: "Erosion and buffers" },
  { id: "foundation", name: "Foundation bed redo", blurb: "Replacing the yews" },
  { id: "hoa", name: "Front yard (HOA)", blurb: "Keeping it tidy enough" },
];

export const STAGES = [
  { id: "before", name: "Before", blurb: "The lawn as it was" },
  { id: "prep", name: "Site prep", blurb: "Tarping, sheet mulch, sod cut" },
  { id: "planting", name: "Planting day", blurb: "Plugs, seed, winter sowing" },
  { id: "y1", name: "Year 1 · sleep", blurb: "Roots, not much to see" },
  { id: "y2", name: "Year 2 · creep", blurb: "Filling in" },
  { id: "y3", name: "Year 3 · leap", blurb: "It finally looks like something" },
  { id: "established", name: "Established", blurb: "4+ years, self-sowing" },
  { id: "visitor", name: "First visitor", blurb: "First monarch cat, first bird nest" },
  { id: "winter", name: "Winter interest", blurb: "Seedheads and stems left up" },
  { id: "edit", name: "Rework", blurb: "Editing what got too enthusiastic" },
];
export const proj = (id) => PROJECTS.find((x) => x.id === id);
export const stage = (id) => STAGES.find((x) => x.id === id);

export const SEED_POSTS = [
  { id: 1, user: "prairie_edge", region: "Great Plains", project: "prairie", stage: "y3", plants: ["Solidago", "Symphyotrichum", "Schizachyrium"], caption: "Third September for this strip. Finally reads as a prairie and not a weed patch.", likes: 212, ago: "2h" },
  { id: 2, user: "oak_savanna_st_paul", region: "Eastern Temperate Forests", project: "lawn", stage: "established", plants: ["Quercus", "Asclepias"], caption: "Bur oak I planted as a whip in 2019. Now shading the milkweed.", likes: 481, ago: "5h" },
  { id: 6, user: "cul_de_sac_kate", region: "Eastern Temperate Forests", project: "lawn", stage: "prep", plants: ["Solidago", "Echinacea"], caption: "Week 5 under black plastic. Plugs arrive Saturday. Neighbors are asking questions.", likes: 63, ago: "7h" },
  { id: 3, user: "backyard_boreal", region: "Northwestern Forested Mountains", project: "shade", stage: "y2", plants: ["Lupinus", "Vaccinium"], caption: "Lupine going to seed, huckleberries coming in.", likes: 97, ago: "9h" },
  { id: 7, user: "downspout_dan", region: "Eastern Temperate Forests", project: "rain", stage: "planting", plants: ["Liatris", "Monarda", "Symphyotrichum"], caption: "Basin dug, berm packed, 80 plugs in. It held the whole storm last night.", likes: 140, ago: "14h" },
  { id: 4, user: "sonoma_slope", region: "Mediterranean California", project: "slope", stage: "y3", plants: ["Ceanothus", "Helianthus"], caption: "Replaced the lawn with ceanothus and a sunflower hedge. No irrigation since June.", likes: 344, ago: "1d" },
  { id: 8, user: "hellstrip_hank", region: "Great Plains", project: "boulevard", stage: "visitor", plants: ["Asclepias", "Rudbeckia"], caption: "First monarch caterpillar on the boulevard milkweed. Planted 14 months ago.", likes: 509, ago: "1d" },
  { id: 5, user: "north_woods_wi", region: "Eastern Temperate Forests", project: "foundation", stage: "y1", plants: ["Prunus", "Liatris"], caption: "Pulled the yews. Black cherry and liatris look like nothing yet. Sleep year.", likes: 158, ago: "2d" },
];

export const genus = (g) => GENERA.find((x) => x.g === g);
export const isKeystone = (g, region) => (genus(g)?.ks || []).includes(region);

