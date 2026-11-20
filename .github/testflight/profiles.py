#!/usr/bin/env python3
"""Fetch (or create) the App Store profile for TimeClaim.

Runs in CI with the App Store Connect API key from the environment. Reuses an
ACTIVE "TimeClaim CI" profile for the bundle ID, else creates one for the
distribution certificate. Installs it for Xcode, writes the profile name to
$RUNNER_TEMP/profile-name.txt and the export options to
$RUNNER_TEMP/ExportOptions.plist. Prints nothing secret.
"""
import base64
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time

from asc import BUNDLE, api

PREFIX = 'TimeClaim CI'
CERTIFICATE_ID = os.environ['APPLE_CERTIFICATE_ID']
TEAM_ID = os.environ['APPLE_TEAM_ID']


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
