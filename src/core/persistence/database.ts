export type SqlValue = string | number | null;
export type SqlParams = SqlValue[];

// shaped after expo-sqlite's async api so the on-device adapter stays thin;
// the jest adapter implements the same shape over node:sqlite
export interface SqlExecutor {
  runAsync(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  getAllAsync<Row>(sql: string, params?: SqlParams): Promise<Row[]>;
  getFirstAsync<Row>(sql: string, params?: SqlParams): Promise<Row | null>;
}

export interface SqlDatabase extends SqlExecutor {
  // reviewed static migrations and pragma statements only
  execAsync(sql: string): Promise<void>;
  withExclusiveTransactionAsync<Value>(
    work: (tx: SqlExecutor) => Promise<Value>,
  ): Promise<Value>;
  // deferred read transaction: multi-statement queries read one snapshot
  withTransactionAsync<Value>(work: (tx: SqlExecutor) => Promise<Value>): Promise<Value>;
  closeAsync(): Promise<void>;
}
