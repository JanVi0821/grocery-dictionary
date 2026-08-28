import type { FoodstuffsPlatform, FoodstuffsStore } from "../foodstuffs/types.ts";

export const PAKNSAVE_STORES = [
  {
    name: "PAK'nSAVE Mt Albert",
    id: "b2e98a14-c8ca-401e-99ed-edf74570c6f6",
    region: "NI",
  },
  {
    name: "PAK'nSAVE Dunedin",
    id: "90082979-fb9f-4305-9c72-83274fc438cc",
    region: "SI",
  },
  {
    name: "PAK'nSAVE Petone",
    id: "98ec3885-ac93-4fcb-807b-59c9055c52c4",
    region: "NI",
  },
  {
    name: "PAK'nSAVE Hornby",
    id: "be4c4780-218e-425a-a90f-63e21773572b",
    region: "SI",
  },
  {
    name: "PAK'nSAVE Albany",
    id: "65defcf2-bc15-490e-a84f-1f13b769cd22",
    region: "NI",
  },
] as const satisfies readonly FoodstuffsStore[];

const FAST_IDS = [
  "b2e98a14-c8ca-401e-99ed-edf74570c6f6",
  "90082979-fb9f-4305-9c72-83274fc438cc",
] as const;

export const paknsavePlatform: FoodstuffsPlatform = {
  source: "paknsave",
  origin: "https://www.paknsave.co.nz",
  api: "https://api-prod.paknsave.co.nz",
  headerKey: "paknsaveHeaders",
  stores: PAKNSAVE_STORES,
  fastStoreIds: FAST_IDS,
};
