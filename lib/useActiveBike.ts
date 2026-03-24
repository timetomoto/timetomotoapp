import { useGarageStore, type Bike } from './store';

/** Returns the currently selected bike from the garage store */
export function useActiveBike(): Bike | null {
  const bikes = useGarageStore((s) => s.bikes);
  const selectedBikeId = useGarageStore((s) => s.selectedBikeId);
  return bikes.find((b) => b.id === selectedBikeId) ?? null;
}
