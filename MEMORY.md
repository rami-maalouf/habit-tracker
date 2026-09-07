# Project Environment

Inspected for the pre-fork work on 2026-09-07 by the Argent environment inspector.

```json
{
  "project_type": "expo",
  "is_react_native": true,
  "is_native_ios": false,
  "is_native_android": false,
  "expo_sdk": 57,
  "bundler": "metro",
  "metro_port": 8081,
  "start_command": "bun run start",
  "ios_build_command": "bun run ios",
  "validation_command": "bun run validate",
  "doctor_command": "bunx expo-doctor",
  "native_directories_generated": true,
  "ios_workspace": "ios/habittracker.xcworkspace",
  "simulator_udid": "93EEF062-B4DC-4989-AF77-CF47EE2A9816",
  "simulator_name": "iPhone 17 Pro",
  "simulator_runtime": "iOS 27.0",
  "eas_profiles": ["development", "preview", "sim", "production"]
}
```

Metro was already running when this session started. Keep its lifecycle under the user's control.
Use Argent for simulator interaction; private evidence stays under `.artifacts/`.
The presence of generated `ios/` does not make this a manually maintained native project.
Product scope ships iOS UI and Android-safe core/adapters, without Android product UI.
