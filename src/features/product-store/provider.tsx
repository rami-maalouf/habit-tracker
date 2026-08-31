import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { CommandId } from '@/core/domain/ids';
import { reconcileReminderSchedules } from '@/core/domain/reminder-commands';
import type { DomainError, DomainResult } from '@/core/domain/result';
import type { ProductCore } from '@/platform/database/product-core';
import { getProductCore } from '@/platform/database/product-core';
import {
  addNotificationTapListener,
  getInitialNotificationBoardId,
  reminderScheduler,
} from '@/platform/notifications';
import { spacing } from '@/theme';

type ProductContextValue = {
  core: ProductCore;
  version: number;
  invalidate: () => void;
  nextCommandId: () => CommandId;
};

const ProductContext = createContext<ProductContextValue | null>(null);

type ProviderState =
  | { status: 'loading' }
  | { status: 'ready'; core: ProductCore }
  | { status: 'error'; error: DomainError };

type ProductProviderProps = {
  children: ReactNode;
  // tests inject a core over the in-memory engine; the app resolves the
  // shared sqlite core
  coreOverride?: ProductCore;
};

export function ProductProvider({ children, coreOverride }: ProductProviderProps) {
  const [state, setState] = useState<ProviderState>(
    coreOverride ? { status: 'ready', core: coreOverride } : { status: 'loading' },
  );
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (coreOverride) {
      return;
    }
    let cancelled = false;
    getProductCore().then(
      (result) => {
        if (cancelled) {
          return;
        }
        if (result.ok) {
          setState({ status: 'ready', core: result.value });
        } else {
          setState({ status: 'error', error: result.error });
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: {
              code: 'database',
              message: cause instanceof Error ? cause.message : String(cause),
              retryable: true,
            },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [coreOverride, attempt]);

  const invalidate = useCallback(() => setVersion((current) => current + 1), []);

  // the reminder reconciler reruns on cold start and every return to the
  // foreground, covering permission flips, time changes, and restores
  const reconcile = useCallback(() => {
    if (state.status !== 'ready') {
      return;
    }
    const core = state.core;
    void reconcileReminderSchedules(
      { ...core, scheduler: reminderScheduler },
      { commandId: core.ids.uuid() as CommandId },
    ).then((result) => {
      if (result.ok && result.value.updated > 0) {
        invalidate();
      }
    });
  }, [invalidate, state]);

  useEffect(() => {
    reconcile();
  }, [reconcile]);

  // out-of-process writers (widgets, automations, sync) mutate the same
  // database; returning to the foreground refreshes every mounted query.
  // the in-process database-change hook lands with the widget stage.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') {
        invalidate();
        reconcile();
      }
    });
    return () => subscription?.remove?.();
  }, [invalidate, reconcile]);

  // a tapped reminder deep-links to its board's add check-in sheet, both
  // while running and when the tap cold-started the app
  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }
    const open = (boardId: string) => {
      router.push(`/boards/${boardId}/check-ins/new`);
    };
    let cancelled = false;
    void getInitialNotificationBoardId().then((boardId) => {
      if (boardId && !cancelled) {
        open(boardId);
      }
    });
    const remove = addNotificationTapListener(open);
    return () => {
      cancelled = true;
      remove();
    };
  }, [state.status]);

  const value = useMemo<ProductContextValue | null>(() => {
    if (state.status !== 'ready') {
      return null;
    }
    return {
      core: state.core,
      version,
      invalidate,
      nextCommandId: () => state.core.ids.uuid() as CommandId,
    };
  }, [state, version, invalidate]);

  if (state.status === 'loading') {
    return <View testID="product-loading" />;
  }

  if (state.status === 'error') {
    // a failed migration or open never creates a replacement database
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}
        testID="product-recovery"
      >
        <AppText variant="title2" accessibilityRole="header">
          Your data could not be opened
        </AppText>
        <AppText>{state.error.message}</AppText>
        <AppText
          accessibilityRole="button"
          onPress={() => {
            setState({ status: 'loading' });
            setAttempt((current) => current + 1);
          }}
          style={{ minHeight: 44 }}
        >
          Try again
        </AppText>
      </View>
    );
  }

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct(): ProductContextValue {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProduct requires a ProductProvider');
  }
  return context;
}

export type QueryState<Value> =
  | { status: 'loading' }
  | { status: 'error'; error: DomainError }
  | { status: 'ready'; value: Value };

// re-runs the query whenever a command invalidates the store
export function useProductQuery<Value>(
  run: (core: ProductCore) => Promise<DomainResult<Value>>,
  dependencies: readonly unknown[],
): QueryState<Value> & { refresh: () => void } {
  const { core, version, invalidate } = useProduct();
  const [state, setState] = useState<QueryState<Value>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    run(core).then(
      (result) => {
        if (cancelled) {
          return;
        }
        setState(result.ok ? { status: 'ready', value: result.value } : { status: 'error', error: result.error });
      },
      (cause: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: {
              code: 'database',
              message: cause instanceof Error ? cause.message : String(cause),
              retryable: true,
            },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run is inline; identity tracked via dependencies
  }, [core, version, ...dependencies]);

  return { ...state, refresh: invalidate };
}
