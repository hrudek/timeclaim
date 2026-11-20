# Android release

TimeClaim uses EAS Build. The Android application ID is `dev.rudek.timeclaim`.

## Migration from `de.timeclaim.app`

Early APKs used the package `de.timeclaim.app`. Android treats the new package as a separate app, so it installs next to the old one instead of updating it. To move data:

1. In the old app, export a backup (share the JSON file or copy it to the clipboard).
2. Install the new APK, open it and paste the backup text, then choose **Aus Text wiederherstellen**. Restoring replaces the data in the new app, so do it before entering anything there.
3. Check the data, then uninstall the old app (uninstalling deletes its data).

## Build profiles

| Profile | Artifact | Purpose |
| --- | --- | --- |
| `development` | APK with Expo development client | Development devices |
| `preview` | Standalone APK | Sideloaded private beta |
| `production` | AAB | Google Play |

Run the local checks before requesting a remote build:

```sh
npm ci
npm run doctor
npm run lint
npm run typecheck
npm run export:android
```

The build commands are intentionally separate because they use the remote EAS service and require an Expo account and Android signing credentials:

```sh
npm run build:android:development
npm run build:android:preview
npm run build:android:production
```

EAS manages the Android `versionCode` remotely and increments it for every production build. Before a public release, update the user-visible semantic `version` in both `app.json` and `package.json` (and refresh `package-lock.json` with `npm install --package-lock-only`). Keep those two versions equal. Commit the version change before building; EAS rejects builds from an uncommitted worktree.

## First-time setup and Play release

1. Sign in with `eas login`, then run `eas init` to link the project. Commit only the generated EAS project ID; never commit tokens, keystores, service-account JSON, or other credentials.
2. Let EAS create/manage an Android keystore on the first authenticated build, or supply the team's existing upload key. Store recovery material outside this repository.
3. Install and test the `preview` APK on representative supported devices, including backup/restore and date/time entry.
4. Build the production AAB. Upload it manually to Play Console, or configure EAS Submit credentials outside Git and submit with `eas submit --platform android --profile production`. The submit profile targets Play's **internal** track; promote the tested release in Play Console.
5. Complete Play Console requirements: store listing and screenshots, privacy-policy URL, data-safety declaration, content rating, app access, target audience, contact details, and internal-test testers.
6. Verify Play App Signing/upload-key ownership and archive the release notes and tested commit.

## Branding

The configured launcher icon, adaptive icon, monochrome icon, favicon, and splash use the mint TC monogram on navy. Editable SVG sources live in `assets/branding/`. See [Branding](branding.md) for regeneration, asset mapping, safe zones and web icons. Run `npm run branding:check`, then review a fresh native build on a physical device before a public store release; icon and splash changes cannot be shipped only as an OTA update.
