/**
 * babel-preset-expo is the preset Metro already applies to this project by
 * default, so declaring it here does not change how the app bundles — it just
 * makes the same config available to tooling that reads babel.config.js, which
 * is what jest-expo needs in order to transform JSX and React Native modules.
 *
 * The test-only arrow-function transform works around a real incompatibility:
 * React Native 0.81 declares host components as arrow functions
 * (Libraries/Text/Text.js:38 is `const TextImpl = ({...}) => ...`), while RN's
 * own jest mock reads `RealComponent.prototype.constructor`
 * (react-native/jest/mockComponent.js:42) with no null guard. Arrow functions
 * have no prototype, so rendering any RN host component throws
 * "Cannot read properties of undefined (reading 'constructor')".
 *
 * RN's own babel preset happens to hide this by transpiling arrows away;
 * babel-preset-expo targets Hermes, which supports them natively, so it does
 * not. Restoring the transform under NODE_ENV=test only affects Jest — the
 * Metro bundle keeps its native arrow functions.
 */
module.exports = function babelConfig(api) {
  const isTest = api.env('test');
  // Cache per NODE_ENV rather than unconditionally, since the config differs
  // between test and bundle builds.
  api.cache.using(() => process.env.NODE_ENV);

  return {
    presets: ['babel-preset-expo'],
    plugins: isTest ? ['@babel/plugin-transform-arrow-functions'] : [],
  };
};
