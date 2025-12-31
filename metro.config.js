const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// Use resolveRequest to force pdf-lib to use its CommonJS entry point
// This overrides the 'react-native' field in pdf-lib's package.json which points to the problematic ES build
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pdf-lib') {
    if (platform === 'web') {
      return {
        filePath: require.resolve('pdf-lib/dist/pdf-lib.min.js'),
        type: 'sourceFile',
      };
    }
    return {
      filePath: require.resolve('pdf-lib/dist/pdf-lib.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;