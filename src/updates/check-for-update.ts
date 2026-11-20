import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';
import { isNewerVersion } from '@/domain/version';

// Android builds are distributed as APKs on GitHub Releases. "latest" never
// returns pre-releases (the per-merge test builds), only stable versions.
const LATEST_RELEASE_URL = 'https://api.github.com/repos/hrudek/timeclaim/releases/latest';
const TIMEOUT_MS = 10_000;

type Release = { tag_name?: unknown; html_url?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] };

/** Asks the user to download a newer APK if one is published. Silent on any failure. */
export async function checkForUpdate(): Promise<void> {
  if (Platform.OS !== 'android' || __DEV__) return;
  const current = Constants.expoConfig?.version;
  if (!current) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return;
    const release = (await response.json()) as Release;
    if (typeof release.tag_name !== 'string' || !isNewerVersion(release.tag_name, current)) return;
    const apk = release.assets?.find((asset) => typeof asset.name === 'string' && asset.name.endsWith('.apk'));
    const url = typeof apk?.browser_download_url === 'string' ? apk.browser_download_url
      : typeof release.html_url === 'string' ? release.html_url : null;
    if (!url) return;
    const version = release.tag_name.replace(/^v/, '');
    Alert.alert(
      'Update verfügbar',
      `Version ${version} ist verfügbar (installiert: ${current}). Lade die neue APK herunter und installiere sie über die bisherige App. Deine Daten bleiben erhalten.`,
      [
        { text: 'Später', style: 'cancel' },
        { text: 'Herunterladen', onPress: () => { void Linking.openURL(url); } },
      ],
    );
  } catch {
    // Offline, rate-limited or GitHub unavailable: try again on the next start.
  } finally {
    clearTimeout(timer);
  }
}
