# iOS release (TestFlight)

Bundle ID `dev.rudek.timeclaim` (convention `dev.rudek.<app>`; Android still uses `de.timeclaim.app`), built on a GitHub-hosted macOS runner (no EAS, no Mac needed).

The workflow `.github/workflows/testflight.yml` runs on every push to `main` and on manual dispatch (environment `testflight`, restricted to `main`). It runs `expo prebuild`, signs the archive manually with the Apple Distribution certificate, and uploads it to App Store Connect. The build number is the workflow run number; the user-visible version comes from `app.json`.

`.github/testflight/profiles.py` reuses or creates the "TimeClaim CI" App Store profile through the App Store Connect API.

## Environment `testflight`

| Kind | Name |
| --- | --- |
| Variable | `APPLE_TEAM_ID`, `APPLE_CERTIFICATE_ID` |
| Secret | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64` |
| Secret | `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD` |

Never commit keys, certificates or profiles.

## One-time Apple setup

1. The bundle ID `dev.rudek.timeclaim` is registered (no extra capabilities needed).
2. Create the app record in App Store Connect (My Apps > + > New App, bundle ID `dev.rudek.timeclaim`). The API cannot do this.
3. Add internal testers (Users and Access, then TestFlight > Internal Testing).

## Releasing

Merge to `main` (or run the workflow manually). After Apple finishes processing, the build appears in TestFlight. Bump `version` in `app.json` and `package.json` for a new marketing version.
