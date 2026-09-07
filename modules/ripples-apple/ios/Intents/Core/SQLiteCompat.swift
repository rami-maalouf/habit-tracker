#if os(iOS)
import ExpoSQLite
#elseif os(macOS)
import SQLite3

// swiftpm tests use apple's system sqlite. the app target imports exposqlite
// directly and resolves these names to expo's vendored, prefixed symbols.
let exsqlite3_open_v2 = sqlite3_open_v2
let exsqlite3_close = sqlite3_close
let exsqlite3_busy_timeout = sqlite3_busy_timeout
let exsqlite3_exec = sqlite3_exec
let exsqlite3_prepare_v2 = sqlite3_prepare_v2
let exsqlite3_finalize = sqlite3_finalize
let exsqlite3_bind_text = sqlite3_bind_text
let exsqlite3_bind_null = sqlite3_bind_null
let exsqlite3_bind_int64 = sqlite3_bind_int64
let exsqlite3_bind_double = sqlite3_bind_double
let exsqlite3_step = sqlite3_step
let exsqlite3_changes = sqlite3_changes
let exsqlite3_column_count = sqlite3_column_count
let exsqlite3_column_name = sqlite3_column_name
let exsqlite3_column_type = sqlite3_column_type
let exsqlite3_column_int64 = sqlite3_column_int64
let exsqlite3_column_double = sqlite3_column_double
let exsqlite3_column_text = sqlite3_column_text
let exsqlite3_column_bytes = sqlite3_column_bytes
#endif
