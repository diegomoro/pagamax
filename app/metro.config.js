const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { resolve: metroResolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);
const workspaceNodeModules = path.resolve(__dirname, '..', 'node_modules');

config.resolver.assetExts.push('txt', 'md');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.join(workspaceNodeModules, 'react'),
  'react-dom': path.join(workspaceNodeModules, 'react-dom'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return metroResolve(
      { ...context, nodeModulesPaths: [workspaceNodeModules] },
      moduleName,
      platform,
    );
  }

  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    return metroResolve(
      { ...context, nodeModulesPaths: [workspaceNodeModules] },
      moduleName,
      platform,
    );
  }

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
