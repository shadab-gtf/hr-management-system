import "server-only";
import { cache } from "react";
import { foundationFixture } from "@/lib/mocks/foundation";
import { foundationSchema, type FoundationData } from "@/types/foundation";

export const getFoundation = cache(async (): Promise<FoundationData> => {
  // Keep the future transport behind this facade; validate the DTO at the boundary.
  return foundationSchema.parse(structuredClone(foundationFixture));
});
