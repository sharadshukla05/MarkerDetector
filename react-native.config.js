/**
 * react-native.config.js
 *
 * Explicit autolinking configuration.
 * Most packages are auto-discovered; this file pins any that need
 * manual path overrides or additional native build flags.
 */
module.exports = {
  project: {
    android: {
      // Ensure Gradle knows about the app module
      sourceDir: './android',
    },
  },
  dependencies: {
    // VisionCamera: explicitly configure to enable frame processors
    'react-native-vision-camera': {
      platforms: {
        android: {},
      },
    },
    // Worklets is a peer dependency of VisionCamera — confirm it's linked
    'react-native-worklets-core': {
      platforms: {
        android: null, // null = use default autolinking
      },
    },
  },
};
