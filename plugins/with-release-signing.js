// Signs Android release builds with the upload key when CI provides it via
// ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
// ANDROID_KEY_PASSWORD. Without them (local builds) the debug key is used.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

function replaceOnce(source, search, replacement, what) {
  const index = source.indexOf(search);
  if (index === -1 || source.indexOf(search, index + search.length) !== -1) {
    throw new Error(`with-release-signing: could not find a unique ${what} in app/build.gradle`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return mod;
    gradle = replaceOnce(gradle, "            keyPassword 'android'\n        }", `            keyPassword 'android'\n        }${RELEASE_CONFIG}`, 'debug signing config');
    gradle = replaceOnce(
      gradle,
      '            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug',
      "            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
      'release signingConfig',
    );
    mod.modResults.contents = gradle;
    return mod;
  });
};
