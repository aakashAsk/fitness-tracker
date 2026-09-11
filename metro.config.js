const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase's JS SDK (v9+) ships a package.json "exports" map that Metro's
// default package-exports resolution doesn't handle correctly, breaking
// imports like `firebase/app` / `firebase/firestore` with "unable to
// resolve module" errors. Disabling it here is the documented workaround.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
