require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'HeavenLitRust'
  s.version = package['version']
  s.summary = 'Rust bridge module for Lit Rust SDK PoC'
  s.description = 'Expo module that forwards calls into a Rust core using Lit Rust SDK.'
  s.license = 'MIT'
  s.author = 'Heaven'
  s.homepage = 'https://dotheaven.org'
  s.platforms = {
    :ios => '15.1'
  }
  s.swift_version = '5.9'
  s.static_framework = true
  s.source = { path: '.' }

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{swift,h,m}'
  s.preserve_paths = 'rust-core/**/*', 'scripts/**/*', 'ios/lib/**/*'
  s.vendored_libraries = 'ios/lib/libheaven_lit_rust.a'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '$(inherited) -L${PODS_TARGET_SRCROOT}/ios/lib -lheaven_lit_rust'
  }

  s.script_phase = {
    :name => 'Build HeavenLitRust (Rust)',
    :execution_position => :before_compile,
    :shell_path => '/bin/bash',
    :script => <<-SCRIPT
set -euo pipefail
"${PODS_TARGET_SRCROOT}/scripts/build-ios.sh" "${PODS_TARGET_SRCROOT}"
SCRIPT
  }
end
