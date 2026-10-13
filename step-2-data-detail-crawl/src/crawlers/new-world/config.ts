import type { FoodstuffsPlatform, FoodstuffsStore } from "../foodstuffs/types.ts";

export const NEW_WORLD_STORES = [
  {
    name: "New World Thorndon",
    id: "3a5fd4b8-6ea0-4a6c-aeec-5af83e093322",
    region: "NI",
  },
  {
    name: "New World Durham Street",
    id: "c1aaac72-38c0-4cc0-ad05-f241047d88c5",
    region: "SI",
  },
  {
    name: "New World Centre City",
    id: "50a98f3b-ffbd-4229-84bc-bfd3c956119f",
    region: "SI",
  },
  {
    name: "New World Albany",
    id: "773ad0a0-024e-46c5-a94b-df1cf86d25cc",
    region: "NI",
  },
  {
    name: "New World Ormiston",
    id: "bc0ebd13-e131-4efd-a226-415c40ce8c4e",
    region: "NI",
  },
  {
    name: "New World Rolleston",
    id: "84c3115a-fe09-4bc3-b373-f43cc9e9627c",
    region: "SI",
  },
] as const satisfies readonly FoodstuffsStore[];

const FAST_IDS = [
  "3a5fd4b8-6ea0-4a6c-aeec-5af83e093322",
  "c1aaac72-38c0-4cc0-ad05-f241047d88c5",
] as const;

export const newWorldPlatform: FoodstuffsPlatform = {
  source: "new-world",
  origin: "https://www.newworld.co.nz",
  api: "https://api-prod.newworld.co.nz",
  headerKey: "nwHeaders",
  stores: NEW_WORLD_STORES,
  fastStoreIds: FAST_IDS,
};
