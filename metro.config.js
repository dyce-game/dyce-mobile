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

// @colyseus/httpie (used by the Colyseus client) picks its Node build (`require('https')`) for native, because Metro's
// default export conditions on iOS and Android do not include "browser". Native has `fetch`, so use that build. The web
// build already resolves its browser (XHR) build and is left alone. First found by the first EAS native build.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@colyseus/httpie' && platform !== 'web') {
    return context.resolveRequest(context, '@colyseus/httpie/fetch', platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
