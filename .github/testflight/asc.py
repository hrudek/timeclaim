"""Minimal App Store Connect API client for CI. Prints nothing secret.

Reads ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (path to the .p8 key).
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

BUNDLE = 'dev.rudek.timeclaim'


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=')


def _token():
    now = int(time.time())
    header = _b64(json.dumps({'alg': 'ES256', 'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'}).encode())
    payload = _b64(json.dumps({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now - 10, 'exp': now + 600,
                               'aud': 'appstoreconnect-v1'}).encode())
    message = header + b'.' + payload
    der = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', os.environ['ASC_KEY_PATH']],
                         input=message, capture_output=True, check=True).stdout
    # DER sequence of two integers (r, s); JWT wants them as 32 bytes each.
    rlen = der[3]
    r = int.from_bytes(der[4:4 + rlen], 'big')
    s = int.from_bytes(der[6 + rlen:6 + rlen + der[5 + rlen]], 'big')
    return (message + b'.' + _b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))).decode()


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f'HTTP {status} {body}')
        self.status = status


def api(method, path, body=None, fail=True):
    request = urllib.request.Request(
        'https://api.appstoreconnect.apple.com' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + _token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode()
        if fail:
            sys.exit(f'App Store Connect API {method} {path.split("?")[0]}: HTTP {error.code} {detail}')
        raise ApiError(error.code, detail) from None


def app_id():
    apps = api('GET', f'/v1/apps?filter[bundleId]={BUNDLE}&fields[apps]=bundleId')['data']
    apps = [a for a in apps if a['attributes']['bundleId'] == BUNDLE]
    if len(apps) != 1:
        sys.exit(f'No App Store Connect app record for {BUNDLE}: create it under My Apps first.')
    return apps[0]['id']
