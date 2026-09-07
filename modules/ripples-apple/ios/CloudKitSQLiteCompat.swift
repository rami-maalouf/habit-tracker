#if os(macOS)
import SQLite3

// swiftpm's cloudkit test target uses apple's system sqlite. the ios
// cocoapods target imports exposqlite and resolves the same names directly.
let exsqlite3_open_v2 = sqlite3_open_v2
let exsqlite3_close = sqlite3_close
let exsqlite3_busy_timeout = sqlite3_busy_timeout
let exsqlite3_exec = sqlite3_exec
let exsqlite3_prepare_v2 = sqlite3_prepare_v2
let exsqlite3_finalize = sqlite3_finalize
let exsqlite3_bind_text = sqlite3_bind_text
let exsqlite3_step = sqlite3_step
let exsqlite3_column_type = sqlite3_column_type
let exsqlite3_column_text = sqlite3_column_text
let exsqlite3_column_bytes = sqlite3_column_bytes
#endif
