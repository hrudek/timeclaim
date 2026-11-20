#!/usr/bin/env python3
"""Sync the TestFlight metadata in store/testflight/testflight.json to App Store Connect.

The repository is the single source of truth: every field in the file is
written to App Store Connect when it differs, beta app localizations that are
not in the file are deleted. Values can be literal, or
  {"file": "path"}                  text file (path relative to the repository root)
  {"env": "NAME"}                   environment variable (for values that must stay out of Git)
  {"html": "path", "baseUrl": "…"}  plain text from the <main> element of an HTML page

  metadata.py --validate   check the file offline (no credentials needed)
  metadata.py --dry-run    show what would change, change nothing
  metadata.py              apply the changes

Prints field names only, never values. Needs ASC_KEY_ID, ASC_ISSUER_ID and
ASC_KEY_PATH for everything except --validate.
"""
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'store' / 'testflight' / 'testflight.json'
LIMITS = {'description': 4000, 'notes': 4000, 'agreementText': 32000}
EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
LOCALIZATION_FIELDS = {'description', 'feedbackEmail', 'marketingUrl', 'privacyPolicyUrl'}
REVIEW_FIELDS = {'contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail',
                 'demoAccountRequired', 'demoAccountName', 'demoAccountPassword', 'notes'}
GROUP_FIELDS = {'name', 'feedbackEnabled', 'publicLinkLimitEnabled', 'publicLinkLimit'}
APP_FIELDS = {'contentRightsDeclaration'}
SECRET_FIELDS = {'contactPhone', 'demoAccountPassword'}


class _MainText(HTMLParser):
    """Collects the text of <main>: headings and paragraphs as blocks, links as "text (url)"."""

    BLOCKS = {'h1', 'h2', 'h3', 'p', 'li'}

    def __init__(self, base_url):
        super().__init__()
        self.base_url, self.depth, self.blocks, self.current, self.href = base_url, 0, [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'main':
            self.depth += 1
        elif self.depth and tag in self.BLOCKS:
            self.current = []
        elif self.depth and tag == 'a':
            self.href = dict(attrs).get('href')

    def handle_endtag(self, tag):
        if tag == 'main':
            self.depth -= 1
        elif self.depth and tag in self.BLOCKS and self.current is not None:
            text = re.sub(r'\s+', ' ', ''.join(self.current)).strip()
            if text:
                self.blocks.append(text.upper() if tag == 'h1' else text)
            self.current = None
        elif self.depth and tag == 'a' and self.href and self.current is not None:
            url = urljoin(self.base_url, self.href)
            if url.startswith('http'):
                self.current.append(f' ({url})')
            self.href = None

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)


def _resolve(value, field, errors, offline):
    if not isinstance(value, dict):
        return value
    if 'file' in value:
        path = ROOT / value['file']
        if not path.is_file():
            errors.append(f'{field}: file {value["file"]} not found')
            return None
        return path.read_text(encoding='utf-8').strip()
    if 'env' in value:
        text = os.environ.get(value['env'], '').strip()
        if not text and not offline:
            errors.append(f'{field}: environment variable {value["env"]} is not set')
        return text or None
    if 'html' in value:
        path = ROOT / value['html']
        if not path.is_file():
            errors.append(f'{field}: file {value["html"]} not found')
            return None
        parser = _MainText(value.get('baseUrl', ''))
        parser.feed(path.read_text(encoding='utf-8'))
        if not parser.blocks:
            errors.append(f'{field}: no <main> text in {value["html"]}')
        return '\n\n'.join(parser.blocks)
    errors.append(f'{field}: unknown value source {sorted(value)}')
    return None


def _check(section, values, allowed, errors):
    for key in sorted(set(values) - allowed):
        errors.append(f'{section}.{key}: not supported (allowed: {", ".join(sorted(allowed))})')
    for key, value in values.items():
        if value is None:
            continue
        if key in LIMITS and len(value) > LIMITS[key]:
            errors.append(f'{section}.{key}: {len(value)} characters, at most {LIMITS[key]}')
        if key.endswith('Email') and not EMAIL.match(value):
            errors.append(f'{section}.{key}: not an e-mail address')
        if key.endswith('Url') and not value.startswith('https://'):
            errors.append(f'{section}.{key}: must start with https://')


def load(offline=False):
    """Read and validate the metadata file; exits with all problems at once."""
    raw = json.loads(CONFIG.read_text(encoding='utf-8'))
    errors = []

    def section(name, allowed):
        values = {k: _resolve(v, f'{name}.{k}', errors, offline) for k, v in raw.get(name, {}).items()}
        _check(name, values, allowed, errors)
        return values

    config = {
        'app': section('app', APP_FIELDS),
        'betaAppReviewDetail': section('betaAppReviewDetail', REVIEW_FIELDS),
        'betaLicenseAgreement': section('betaLicenseAgreement', {'agreementText'}),
        'group': section('group', GROUP_FIELDS),
        'localizations': {},
    }
    for locale, values in raw.get('localizations', {}).items():
        resolved = {k: _resolve(v, f'localizations.{locale}.{k}', errors, offline) for k, v in values.items()}
        _check(f'localizations.{locale}', resolved, LOCALIZATION_FIELDS, errors)
        config['localizations'][locale] = resolved
    if not config['localizations']:
        errors.append('localizations: at least one locale is required')
    if not config['group'].get('name'):
        errors.append('group.name: required')
    if errors:
        sys.exit(f'{CONFIG.relative_to(ROOT)} is invalid:\n- ' + '\n- '.join(errors))
    return config


class Sync:
    def __init__(self, api, app, dry_run):
        self.api, self.app, self.dry_run, self.changes = api, app, dry_run, []

    def _write(self, label, method, path, body):
        self.changes.append(label)
        print(('Would update ' if self.dry_run else 'Updating ') + label)
        return None if self.dry_run else self.api(method, path, body)

    def _patch(self, label, kind, current, wanted):
        diff = {k: v for k, v in wanted.items() if v is not None and current['attributes'].get(k) != v}
        if diff:
            shown = ', '.join(k + (' (secret)' if k in SECRET_FIELDS else '') for k in sorted(diff))
            self._write(f'{label}: {shown}', 'PATCH', f'/v1/{kind}/{current["id"]}',
                        {'data': {'type': kind, 'id': current['id'], 'attributes': diff}})

    def app_attributes(self, wanted):
        current = self.api('GET', f'/v1/apps/{self.app}?fields[apps]={",".join(sorted(APP_FIELDS))}')['data']
        self._patch('app', 'apps', current, wanted)

    def localizations(self, wanted, primary):
        if primary not in wanted:
            sys.exit(f'The primary language of the app is {primary}, but {CONFIG.relative_to(ROOT)} '
                     f'has no localization for it.')
        existing = {l['attributes']['locale']: l
                    for l in self.api('GET', f'/v1/apps/{self.app}/betaAppLocalizations?limit=200')['data']}
        for locale, values in wanted.items():
            if locale in existing:
                self._patch(f'beta app localization {locale}', 'betaAppLocalizations', existing[locale], values)
            else:
                attributes = {k: v for k, v in values.items() if v is not None}
                self._write(f'beta app localization {locale}: create', 'POST', '/v1/betaAppLocalizations', {'data': {
                    'type': 'betaAppLocalizations', 'attributes': {'locale': locale, **attributes},
                    'relationships': {'app': {'data': {'type': 'apps', 'id': self.app}}}}})
        for locale in sorted(set(existing) - set(wanted)):
            self._write(f'beta app localization {locale}: delete', 'DELETE',
                        f'/v1/betaAppLocalizations/{existing[locale]["id"]}', None)

    def review_detail(self, wanted):
        current = self.api('GET', f'/v1/apps/{self.app}/betaAppReviewDetail')['data']
        self._patch('beta app review detail', 'betaAppReviewDetails', current, wanted)

    def license_agreement(self, wanted):
        current = self.api('GET', f'/v1/apps/{self.app}/betaLicenseAgreement')['data']
        self._patch('beta license agreement', 'betaLicenseAgreements', current, wanted)

    def group(self, wanted):
        """Return the external group named in the file, created or updated to match it."""
        groups = self.api('GET', f'/v1/apps/{self.app}/betaGroups?limit=200')['data']
        group = next((g for g in groups if g['attributes']['name'] == wanted['name']
                      and not g['attributes']['isInternalGroup']), None)
        attributes = {k: v for k, v in wanted.items() if v is not None}
        if group is None:
            created = self._write(f'external TestFlight group "{wanted["name"]}": create', 'POST', '/v1/betaGroups', {
                'data': {'type': 'betaGroups', 'attributes': attributes,
                         'relationships': {'app': {'data': {'type': 'apps', 'id': self.app}}}}})
            return created['data'] if created else None
        self._patch(f'external TestFlight group "{wanted["name"]}"', 'betaGroups', group, attributes)
        return group if self.dry_run else self.api('GET', f'/v1/betaGroups/{group["id"]}')['data']


def sync(api, app, dry_run=False):
    """Apply the metadata file; returns (primary locale, external group)."""
    config = load()
    primary = api('GET', f'/v1/apps/{app}?fields[apps]=primaryLocale')['data']['attributes']['primaryLocale']
    runner = Sync(api, app, dry_run)
    runner.app_attributes(config['app'])
    runner.localizations(config['localizations'], primary)
    runner.review_detail(config['betaAppReviewDetail'])
    runner.license_agreement(config['betaLicenseAgreement'])
    group = runner.group(config['group'])
    if not runner.changes:
        print('TestFlight metadata is up to date.')
    return primary, group


def main():
    args = set(sys.argv[1:])
    if args - {'--validate', '--dry-run'}:
        sys.exit(__doc__)
    if '--validate' in args:
        config = load(offline=True)
        print(f'{CONFIG.relative_to(ROOT)} is valid ({", ".join(config["localizations"])}).')
        return
    from asc import api, app_id
    sync(api, app_id(), dry_run='--dry-run' in args)


if __name__ == '__main__':
    main()
