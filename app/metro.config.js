const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('txt', 'md');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return metroResolve(context, moduleName, platform);
  } catch (error) {
    if (
      context.originModulePath.includes('packages\\pagamax-core\\src') &&
      moduleName.endsWith('.js')
    ) {
      return metroResolve(context, moduleName.replace(/\.js$/, ''), platform);
    }
    throw error;
  }
};

module.exports = config;
