const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    // Allow importing .wasm files used by OpenCV bindings
    assetExts: [...defaultConfig.resolver.assetExts, 'wasm'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
