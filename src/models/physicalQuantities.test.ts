import { describe, expect, it } from "vitest";

import { ComfortModel } from "./comfortModels";
import { PhysicalQuantityId, PhysicalQuantityScope, QuantityState, derivedQuantityIds, physicalQuantityMetaById, primaryInputOrder } from "./physicalQuantities";
describe("physicalQuantities metadata", () => {
  it("defines metadata for every catalog id", () => {
    for (const id of Object.values(PhysicalQuantityId)) {
      expect(physicalQuantityMetaById[id].id).toBe(id);
    }
  });

  it("keeps primary order aligned with primary-state metadata", () => {
    expect(primaryInputOrder.every((id) => (
      physicalQuantityMetaById[id].state === QuantityState.Primary
    ))).toBe(true);
  });

  it("marks derived slot quantities with derivedFrom sources", () => {
    for (const id of derivedQuantityIds) {
      const meta = physicalQuantityMetaById[id];
      expect(meta.state).toBe(QuantityState.Slot);
      expect(meta.derivedFrom?.length).toBeGreaterThan(0);
    }
  });

  it("scopes model quantities to their owner model", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.PhsBodyWeight]).toMatchObject({
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ComfortModel.Phs2023,
    });
    expect(physicalQuantityMetaById[PhysicalQuantityId.PhsHeight]).toMatchObject({
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ComfortModel.Phs2023,
    });
  });
});
