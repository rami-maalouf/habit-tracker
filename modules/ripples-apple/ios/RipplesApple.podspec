Pod::Spec.new do |s|
  s.name           = 'RipplesApple'
  s.version        = '1.0.0'
  s.summary        = 'Native Apple capabilities for Ripples'
  s.description    = 'The local Apple module for Ripples platform adapters.'
  s.author         = 'Rami Maalouf'
  s.homepage       = 'https://github.com/rami-maalouf/habit-tracker'
  s.platforms      = {
    :ios => '18.6'
  }
  s.source         = { git: 'https://github.com/rami-maalouf/habit-tracker.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite'
  s.frameworks = 'CloudKit', 'AppIntents', 'WidgetKit'

  # swift/objective-c compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
