// CI sets BUILD_NUMBER (the workflow run number). It becomes the iOS build
// number and the Android versionCode; the user-visible version stays in app.json.
module.exports = ({ config }) => {
  const build = process.env.BUILD_NUMBER;
  if (!build) return config;
  if (!/^\d+$/.test(build)) throw new Error(`BUILD_NUMBER must be a positive integer, got "${build}"`);
  return {
    ...config,
    ios: { ...config.ios, buildNumber: build },
    android: { ...config.android, versionCode: Number(build) },
  };
};
