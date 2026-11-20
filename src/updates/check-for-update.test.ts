import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';

import { checkForUpdate } from './check-for-update';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
}));
// Expo installs global fetch lazily from this module; mocking it avoids loading the native fetch.
jest.mock('expo/src/winter/fetch', () => ({ fetch: mockFetch }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.0' } } }));

type AlertButton = { text: string; onPress?: () => void };

const alert = jest.mocked(Alert.alert);
const openURL = jest.mocked(Linking.openURL);
const mockFetch = jest.fn<typeof fetch>();
const globals = globalThis as unknown as { __DEV__: boolean };
const originalDev = globals.__DEV__;

function respond(body: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, json: async () => body } as Response);
}

const apkUrl = 'https://github.com/hrudek/timeclaim/releases/download/v1.3.0/timeclaim-1.3.0.apk';
const release = {
  tag_name: 'v1.3.0',
  html_url: 'https://github.com/hrudek/timeclaim/releases/tag/v1.3.0',
  assets: [
    { name: 'checksums.txt', browser_download_url: 'https://example.invalid/checksums.txt' },
    { name: 'timeclaim-1.3.0.apk', browser_download_url: apkUrl },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  globals.__DEV__ = false;
  Platform.OS = 'android';
  Constants.expoConfig!.version = '1.2.0';
});

afterEach(() => {
  globals.__DEV__ = originalDev;
});

describe('checkForUpdate', () => {
  test('offers the APK of a newer release and opens it on confirm', async () => {
    respond(release);
    await checkForUpdate();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/hrudek/timeclaim/releases/latest',
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
    );
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('Update verfügbar');
    expect(message).toContain('Version 1.3.0 ist verfügbar (installiert: 1.2.0)');
    buttons.find((button) => button.text === 'Herunterladen')!.onPress!();
    expect(openURL).toHaveBeenCalledWith(apkUrl);
  });

  test('falls back to the release page when no APK is attached', async () => {
    respond({ ...release, assets: [] });
    await checkForUpdate();

    const buttons = alert.mock.calls[0][2] as AlertButton[];
    buttons.find((button) => button.text === 'Herunterladen')!.onPress!();
    expect(openURL).toHaveBeenCalledWith(release.html_url);
  });

  test.each([
    ['the same version', { ...release, tag_name: 'v1.2.0' }],
    ['an older version', { ...release, tag_name: '1.1.9' }],
    ['a malformed tag', { ...release, tag_name: 'latest' }],
    ['a missing tag', { ...release, tag_name: undefined }],
    ['no download URL', { tag_name: 'v1.3.0', assets: [] }],
  ])('stays silent for %s', async (_, body) => {
    respond(body);
    await checkForUpdate();
    expect(alert).not.toHaveBeenCalled();
  });

  test('stays silent on HTTP errors and network failures', async () => {
    respond({}, false);
    await checkForUpdate();
    mockFetch.mockRejectedValue(new Error('offline'));
    await expect(checkForUpdate()).resolves.toBeUndefined();
    expect(alert).not.toHaveBeenCalled();
  });

  test('does not query GitHub on iOS, in development or without an app version', async () => {
    Platform.OS = 'ios';
    await checkForUpdate();
    Platform.OS = 'android';
    globals.__DEV__ = true;
    await checkForUpdate();
    globals.__DEV__ = false;
    Constants.expoConfig!.version = '';
    await checkForUpdate();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
