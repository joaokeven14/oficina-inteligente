module.exports = {
  dependencies: {
    // Native image picker provides Android/iOS and web adapters; React Native Windows
    // has no native adapter. Windows users can upload through the installable PWA.
    'react-native-image-picker': { platforms: { windows: null } },
  },
};
