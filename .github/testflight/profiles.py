#!/usr/bin/env python3
"""Fetch (or create) the App Store profile for TimeClaim.

Runs in CI with the App Store Connect API key from the environment. Reuses an
ACTIVE "TimeClaim CI" profile for the bundle ID, else creates one for the
distribution certificate. Installs it for Xcode, writes the profile name to
$RUNNER_TEMP/profile-name.txt and the export options to
$RUNNER_TEMP/ExportOptions.plist. Prints nothing secret.
"""
import base64
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

BUNDLE = 'dev.rudek.timeclaim'
PREFIX = 'TimeClaim CI'
KEY_ID = os.environ['ASC_KEY_ID']
ISSUER = os.environ['ASC_ISSUER_ID']
KEY_PATH = os.environ['ASC_KEY_PATH']
CERTIFICATE_ID = os.environ['APPLE_CERTIFICATE_ID']
TEAM_ID = os.environ['APPLE_TEAM_ID']


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=')


def token():
    now = int(time.time())
    header = b64(json.dumps({'alg': 'ES256', 'kid': KEY_ID, 'typ': 'JWT'}).encode())
    payload = b64(json.dumps({'iss': ISSUER, 'iat': now - 10, 'exp': now + 600,
                              'aud': 'appstoreconnect-v1'}).encode())
    message = header + b'.' + payload
    der = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', KEY_PATH], input=message,
                         capture_output=True, check=True).stdout
    # DER sequence of two integers (r, s); JWT wants them as 32 bytes each.
    rlen = der[3]
    r = int.from_bytes(der[4:4 + rlen], 'big')
    s = int.from_bytes(der[6 + rlen:6 + rlen + der[5 + rlen]], 'big')
    return (message + b'.' + b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))).decode()


def api(method, path, body=None):
    request = urllib.request.Request(
        'https://api.appstoreconnect.apple.com' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        sys.exit(f'App Store Connect API {method} {path.split("?")[0]}: HTTP {error.code} {error.read().decode()}')


def profile_for(bundle):
    ids = [b for b in api('GET', f'/v1/bundleIds?filter[identifier]={bundle}')['data']
           if b['attributes']['identifier'] == bundle]
    if len(ids) != 1:
        sys.exit(f'Bundle ID not registered: {bundle}')
    profiles = api('GET', f'/v1/bundleIds/{ids[0]["id"]}/profiles?limit=200')['data']
    active = [p for p in profiles if p['attributes']['name'].startswith(f'{PREFIX} {bundle}')
              and p['attributes']['profileType'] == 'IOS_APP_STORE'
              and p['attributes']['profileState'] == 'ACTIVE']
    if active:
        return active[0]
    name = f'{PREFIX} {bundle} {time.strftime("%Y%m%d%H%M%S", time.gmtime())}'
    print(f'Creating profile {name}')
    return api('POST', '/v1/profiles', {'data': {
        'type': 'profiles',
        'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
        'relationships': {
            'bundleId': {'data': {'type': 'bundleIds', 'id': ids[0]['id']}},
            'certificates': {'data': [{'type': 'certificates', 'id': CERTIFICATE_ID}]}}}})['data']


def main():
    home = Path.home()
    folders = [home / 'Library/MobileDevice/Provisioning Profiles',
               home / 'Library/Developer/Xcode/UserData/Provisioning Profiles']
    for folder in folders:
        folder.mkdir(parents=True, exist_ok=True)
    profile = profile_for(BUNDLE)
    content = base64.b64decode(profile['attributes']['profileContent'])
    downloaded = Path(os.environ['RUNNER_TEMP']) / 'profile.mobileprovision'
    downloaded.write_bytes(content)
    decoded = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(downloaded)]))
    downloaded.unlink()
    for folder in folders:
        (folder / f'{decoded["UUID"]}.mobileprovision').write_bytes(content)
    print(f'{BUNDLE}: {decoded["Name"]} (expires {decoded["ExpirationDate"]:%Y-%m-%d})')
    Path(os.environ['RUNNER_TEMP'], 'profile-name.txt').write_text(decoded['Name'])
    options = {'method': 'app-store-connect', 'teamID': TEAM_ID, 'signingStyle': 'manual',
               'signingCertificate': 'Apple Distribution',
               'provisioningProfiles': {BUNDLE: decoded['Name']},
               'uploadSymbols': True, 'manageAppVersionAndBuildNumber': False}
    Path(os.environ['RUNNER_TEMP'], 'ExportOptions.plist').write_bytes(plistlib.dumps(options))


if __name__ == '__main__':
    main()
