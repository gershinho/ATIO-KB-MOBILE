const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .db to asset extensions so the SQLite database gets bundled
config.resolver.assetExts.push('db');

module.exports = config;
