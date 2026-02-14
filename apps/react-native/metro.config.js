const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Bun installs packages as symlinks into a shared store. Metro needs this enabled
// to follow those links during module resolution.
config.resolver.unstable_enableSymlinks = true;

// Force singletons for native modules that cannot be loaded twice.
// Without this, Bun's store-level node_modules can cause Metro to bundle a second
// copy of react-native-svg (e.g. via react-native-svg-circle-country-flags),
// which crashes at runtime with:
//   "Tried to register two views with the same name RNSVGCircle"
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native-svg': path.resolve(projectRoot, 'node_modules/react-native-svg'),
};

// Ensure Metro can resolve hoisted/shared dependencies from the workspace root.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
