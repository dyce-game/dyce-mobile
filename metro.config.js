// Metro config for the Expo app.
//
// @dyce/shared and @dyce/games live in the sibling repo (../dyce-backend/packages) and are linked in by
// path (ADR-011), so Metro must watch that folder, and must resolve every package from THIS project's
// node_modules (their `zod` and `libphonenumber-js` imports would otherwise look in the backend's).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const backendPackages = path.resolve(projectRoot, '..', 'dyce-backend', 'packages');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), backendPackages];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
