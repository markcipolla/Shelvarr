const { withAppBuildGradle } = require('expo/config-plugins');

// Expo's template signs release builds with the throwaway debug keystore it
// generates. Android only installs an update over an existing app when both
// APKs carry the same signature, so the in-app updater needs releases signed
// with a stable key.
//
// The keystore is read from the environment at Gradle time (not prebuild time)
// so the same generated project works for a signed CI release and an unsigned
// local build. Without ANDROID_KEYSTORE_PATH the build falls back to the debug
// key exactly as before.
const RELEASE_SIGNING_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

const RELEASE_SIGNING_CONFIG_SELECTOR =
  "signingConfig(System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug)";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('ANDROID_KEYSTORE_PATH')) {
      contents = contents.replace(
        /signingConfigs\s*\{/,
        (match) => `${match}${RELEASE_SIGNING_CONFIG}`
      );
      // `debug { ... }` comes first inside buildTypes, so the first
      // `signingConfig signingConfigs.debug` after `release {` is the one to
      // swap.
      contents = contents.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1${RELEASE_SIGNING_CONFIG_SELECTOR}`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
