// Metro con acceso al código compartido del repositorio (motor financiero y
// simuladores de la web): la app calcula con EXACTAMENTE el mismo motor.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, 'lib')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

// Alias `@/lib/...` que usa el código compartido → carpeta lib/ del repositorio.
const SHARED = ['@/lib/finance', '@/lib/formato', '@/lib/cliente/simulate', '@/lib/cliente/format', '@/lib/movil/contract'];
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SHARED.some((prefix) => moduleName === prefix || moduleName.startsWith(prefix + '/'))) {
    return context.resolveRequest(context, path.join(repoRoot, moduleName.slice(2)), platform);
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
