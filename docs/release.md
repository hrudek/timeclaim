# Release

TimeClaim is built only by GitHub Actions (no EAS Build, no local Mac). The app ID is `dev.rudek.timeclaim` on both platforms.

## Flow

| Step | Trigger | iOS | Android |
| --- | --- | --- | --- |
| Test build | Push to `main` (workflow **Build**) | TestFlight, internal testers only | GitHub pre-release `build-<n>` with the APK |
| Release | Tag `vX.Y.Z` on a tested commit (workflow **Release**) | The same build goes to the external TestFlight group "Tester" and is submitted for TestFlight review | The same APK becomes the GitHub release `vX.Y.Z` |

`<n>` is the Build workflow run number. It is the iOS build number and the Android `versionCode` (set through `app.config.js` from `BUILD_NUMBER`). The user-visible version comes from `app.json`.

Nothing reaches users without a tag. The Release workflow rebuilds nothing; it promotes the build you tested.

### Releasing a version

1. Bump `version` in `app.json` and `package.json` (keep them equal, refresh `package-lock.json` with `npm install --package-lock-only`) and merge to `main`.
2. Test the resulting TestFlight build and the APK from the pre-release.
3. Tag that commit (the pre-release notes contain the command):

   ```sh
   git tag -a v1.2.0 <commit> -m "What changed, in German, for testers"
   git push origin v1.2.0
   ```

   The tag message becomes the TestFlight "What to Test" text and the GitHub release notes. Without a message, the commit subjects since the last release are used.

The Release workflow refuses tags that are not `vX.Y.Z`, do not match `app.json`, are not on `main`, are not newer than the last release, or have no test build. Re-running a failed Release run is safe.

## Users

- **iOS:** install TestFlight and join through the public link of the group "Tester" (shown in the Release run summary and in App Store Connect). TestFlight updates automatically. Builds expire after 90 days; the first build of a new version needs TestFlight App Review.
- **Android:** download the APK from the latest GitHub release and install it. On start, the app checks the latest GitHub release (`src/updates/check-for-update.ts`) and offers the download when a newer version exists. Installing over the existing app keeps the data. Pre-releases are never offered.

## Signing and secrets

Never commit keys, certificates, keystores or profiles.

**Environment `testflight`** (branch `main`, tags `v*`)

| Kind | Name |
| --- | --- |
| Variable | `APPLE_TEAM_ID`, `APPLE_CERTIFICATE_ID` |
| Secret | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64` |
| Secret | `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD` |

`.github/testflight/profiles.py` reuses or creates the "TimeClaim CI" App Store profile through the App Store Connect API; `release.py` handles the external TestFlight release.

**Environment `android`** (branch `main`)

| Kind | Name |
| --- | --- |
| Variable | `ANDROID_KEY_ALIAS`, `ANDROID_CERT_SHA256` |
| Secret | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` |

The upload key is a PKCS#12 keystore (store and key password are the same). `plugins/with-release-signing.js` wires it into the generated Gradle project; the workflow fails if the APK is not signed with the certificate `ANDROID_CERT_SHA256`. **If the key is lost, installed apps can no longer be updated**; keep the backup outside this repository.

## Local checks

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

## Branding

The launcher icon, adaptive icon, monochrome icon, favicon and splash use the mint TC monogram on navy. Editable SVG sources live in `assets/branding/`. See [Branding](branding.md). Run `npm run branding:check`, then review a fresh native build on a device; icon and splash changes need a new build.
