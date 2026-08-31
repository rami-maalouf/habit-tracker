export type Migration = {
  version: number;
  name: string;
  statements: readonly string[];
};

// append-only after release; never rewrite a released migration
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-product-schema',
    statements: [
      `CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        symbol TEXT NOT NULL,
        accent_hex TEXT NOT NULL,
        uses_tinted_background INTEGER NOT NULL,
        tracks_amount INTEGER NOT NULL,
        amount_unit TEXT,
        quick_amount REAL NOT NULL,
        tracks_time INTEGER NOT NULL,
        start_of_day_minute INTEGER NOT NULL,
        metrics_enabled INTEGER NOT NULL,
        order_key TEXT NOT NULL,
        archived_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        mutation_stamp TEXT NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE INDEX idx_boards_active ON boards (deleted_at, archived_at, order_key)`,
      `CREATE TABLE check_ins (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards (id),
        logical_date TEXT NOT NULL,
        occurred_at_utc INTEGER,
        time_zone_id TEXT,
        offset_minutes INTEGER,
        amount REAL,
        note TEXT,
        source TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        mutation_stamp TEXT NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE INDEX idx_check_ins_board_date ON check_ins (board_id, logical_date, deleted_at)`,
      `CREATE TABLE reminders (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards (id),
        weekdays_mask INTEGER NOT NULL,
        minute_of_day INTEGER NOT NULL,
        message TEXT,
        enabled INTEGER NOT NULL,
        schedule_state TEXT NOT NULL,
        last_schedule_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        mutation_stamp TEXT NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE TABLE board_activity_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id TEXT NOT NULL REFERENCES boards (id),
        start_date TEXT NOT NULL,
        end_date TEXT,
        mutation_stamp TEXT NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE INDEX idx_periods_board ON board_activity_periods (board_id, deleted_at)`,
      `CREATE TABLE reminder_schedule (
        reminder_id TEXT NOT NULL REFERENCES reminders (id),
        weekday INTEGER NOT NULL,
        native_identifier TEXT NOT NULL,
        PRIMARY KEY (reminder_id, weekday)
      )`,
      `CREATE TABLE widget_board_rows (
        board_id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        symbol TEXT NOT NULL,
        accent_hex TEXT NOT NULL,
        strip TEXT NOT NULL,
        strip_end_date TEXT NOT NULL
      )`,
      `CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_revision INTEGER NOT NULL,
        selected_icon TEXT NOT NULL DEFAULT 'default',
        icloud_sync_enabled INTEGER NOT NULL DEFAULT 0,
        metrics_education_dismissed TEXT NOT NULL DEFAULT '[]',
        device_id TEXT NOT NULL,
        hlc_wall_time INTEGER NOT NULL DEFAULT 0,
        hlc_counter INTEGER NOT NULL DEFAULT 0,
        last_sync_at INTEGER
      )`,
      `CREATE TABLE mutation_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        mutation_stamp TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        change_token TEXT,
        zone_created INTEGER NOT NULL DEFAULT 0,
        retry_state TEXT,
        last_success_at INTEGER
      )`,
      `CREATE TABLE command_receipts (
        command_id TEXT PRIMARY KEY,
        outcome TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'settings_mutation_stamp',
    statements: [
      // the settings record syncs as one provider-neutral row, so it needs
      // its own mutation stamp for the same last-writer-wins comparison
      `ALTER TABLE app_settings ADD COLUMN settings_mutation_stamp TEXT`,
    ],
  },
];

export const latestSchemaVersion = migrations[migrations.length - 1].version;
