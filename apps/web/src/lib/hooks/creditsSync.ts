// Multiple components (the header's AuthNav and the dashboard's
// FeatureWorkspace) each keep their own independent copy of `me` fetched
// separately, so a credit spend/refund applied to one doesn't show up in the
// other. This is a minimal in-tab broadcast so both stay in sync without a
// bigger refactor into shared context.
type CreditsDeltaListener = (delta: number) => void;

const listeners = new Set<CreditsDeltaListener>();

export function broadcastCreditsDelta(delta: number): void {
  listeners.forEach((listener) => listener(delta));
}

export function subscribeCreditsDelta(
  listener: CreditsDeltaListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
