import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

// the server snapshot is used during server rendering, the client snapshot
// after hydration, without a state update inside an effect
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return useSyncExternalStore<S | C>(
    emptySubscribe,
    () => client,
    () => server,
  );
}
