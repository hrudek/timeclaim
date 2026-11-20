# TimeClaim

Arbeitszeiten und Zuschläge erfassen und auswerten. Alle Daten bleiben lokal auf deinem Gerät, ohne Konto und ohne Server.

## Installieren

### iPhone

1. Installiere [TestFlight](https://apps.apple.com/app/testflight/id899247664) aus dem App Store.
2. Öffne den TestFlight-Einladungslink für TimeClaim, den du erhalten hast, und tippe auf **Akzeptieren** und **Installieren**.

Updates kommen automatisch über TestFlight.

### Android

1. Lade die Datei `TimeClaim-<Version>.apk` aus dem [neuesten Release](https://github.com/hrudek/timeclaim/releases/latest) herunter.
2. Öffne sie. Erlaube bei Nachfrage die Installation aus dieser Quelle (Browser oder Dateien-App).

Bei einer neuen Version meldet sich die App beim Start. Lade dann die neue APK herunter und installiere sie über die bisherige App; deine Daten bleiben erhalten.

## Deine Daten sichern

Die Daten liegen nur auf deinem Gerät. Wenn du die App löschst oder das Gerät verlierst, sind sie weg. Exportiere deshalb regelmäßig eine Sicherung (Zahnrad oben rechts → **Daten exportieren**) und bewahre sie an einem sicheren Ort auf. Über **Aus Text wiederherstellen** spielst du sie wieder ein, auch auf einem neuen Gerät.

## Feedback

Fehler und Wünsche an timeclaim@rudek.dev oder auf dem iPhone direkt über TestFlight (Screenshot machen → Teilen → Beta-Feedback).

[Datenschutzerklärung](docs/privacy.md)

## Entwicklung

Expo (React Native). `npm ci`, dann `npm start`. Checks: `npm run lint`, `npm run typecheck`, `npm test`. Builds und Releases laufen über GitHub Actions, siehe [docs/release.md](docs/release.md).
