const windowsPreset = require('@rnx-kit/jest-preset')('windows', {});
const separator = '[/\\\\]';
const allowedPackage = '(?:(?:jest-)?react-native(?:-[^/\\\\]+)?|@react-native(?:-community)?|@?react-native-windows|@office-iss[/\\\\]react-native-win32)' + separator;
const pnpmPackage = '(?:\\.pnpm' + separator + '[^/\\\\]+' + separator + 'node_modules' + separator + ')?';

module.exports = {
  ...windowsPreset,
  // React Native packages are nested under .pnpm/node_modules in this workspace.
  // Allow Jest to transform those copies, including react-native-windows/jest/setup.js.
  transformIgnorePatterns: ['node_modules' + separator + '(?!' + pnpmPackage + allowedPackage + ')'],
  testPathIgnorePatterns: [...(windowsPreset.testPathIgnorePatterns ?? []), '/node_modules/', '<rootDir>/work/'],
  modulePathIgnorePatterns: [...(windowsPreset.modulePathIgnorePatterns ?? []), '<rootDir>/work/'],
};
