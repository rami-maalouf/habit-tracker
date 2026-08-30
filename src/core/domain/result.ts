export type DomainErrorCode =
  | 'validation'
  | 'not_found'
  | 'archived'
  | 'conflict'
  | 'permission_denied'
  | 'capacity'
  | 'unavailable'
  | 'database'
  | 'migration'
  | 'export'
  | 'sync'
  | 'platform';

export type DomainError = {
  code: DomainErrorCode;
  message: string;
  field?: string;
  retryable: boolean;
};

export type DomainResult<Value> = { ok: true; value: Value } | { ok: false; error: DomainError };

export function ok<Value>(value: Value): DomainResult<Value> {
  return { ok: true, value };
}

export function err<Value = never>(
  code: DomainErrorCode,
  message: string,
  options: { field?: string; retryable?: boolean } = {},
): DomainResult<Value> {
  return {
    ok: false,
    error: { code, message, field: options.field, retryable: options.retryable === true },
  };
}
