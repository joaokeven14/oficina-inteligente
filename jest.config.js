module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: ['node_modules/(?!.*(@react-native|react-native))'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/work/'],
  modulePathIgnorePatterns: ['<rootDir>/work/'],
};
