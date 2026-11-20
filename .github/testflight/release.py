#!/usr/bin/env python3
"""Release a tested TestFlight build to the external testers.

Finds build BUILD_NUMBER of version VERSION, sets its "What to Test" text from
the file WHATS_NEW_FILE (optional), adds it to the external group "Tester"
(created if missing), submits it for TestFlight App Review and enables the
group's public link. Safe to re-run. Prints nothing secret.
"""
import os
from pathlib import Path
import sys
import time

from asc import ApiError, api, app_id

GROUP = 'Tester'
BUILD_NUMBER = os.environ['BUILD_NUMBER']
VERSION = os.environ['VERSION']
REVIEW_STATES = {'WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_APPROVED', 'IN_BETA_TESTING'}


def summary(line):
    print(line)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as handle:
            handle.write(line + '\n')


def check_test_information(app, locale):
    missing = []
    localizations = api('GET', f'/v1/apps/{app}/betaAppLocalizations')['data']
    attrs = next((l['attributes'] for l in localizations if l['attributes']['locale'] == locale), {})
    missing += [f'Beta-App-Beschreibung ({locale})'] if not attrs.get('description') else []
    missing += [f'Feedback-E-Mail ({locale})'] if not attrs.get('feedbackEmail') else []
    review = api('GET', f'/v1/apps/{app}/betaAppReviewDetail')['data']['attributes']
    for key, label in [('contactFirstName', 'Vorname'), ('contactLastName', 'Nachname'),
                       ('contactPhone', 'Telefon'), ('contactEmail', 'E-Mail')]:
        if not review.get(key):
            missing.append(f'Kontakt für die Beta-Prüfung: {label}')
    if missing:
        sys.exit('TestFlight > Testinformationen in App Store Connect unvollständig:\n- ' + '\n- '.join(missing))


def find_build(app):
    query = (f'/v1/builds?filter[app]={app}&filter[version]={BUILD_NUMBER}'
             f'&filter[preReleaseVersion.version]={VERSION}&fields[builds]=version,processingState,expired')
    for _ in range(60):
        builds = api('GET', query)['data']
        if not builds:
            sys.exit(f'Build {BUILD_NUMBER} of version {VERSION} not found in App Store Connect.')
        attrs = builds[0]['attributes']
        if attrs['expired']:
            sys.exit(f'Build {BUILD_NUMBER} has expired (TestFlight builds last 90 days).')
        if attrs['processingState'] == 'VALID':
            return builds[0]['id']
        if attrs['processingState'] in ('FAILED', 'INVALID'):
            sys.exit(f'Build {BUILD_NUMBER} processing state is {attrs["processingState"]}.')
        print(f'Build {BUILD_NUMBER} is {attrs["processingState"]}, waiting...')
        time.sleep(30)
    sys.exit(f'Build {BUILD_NUMBER} did not finish processing in time.')


def set_whats_new(build, locale):
    path = os.environ.get('WHATS_NEW_FILE')
    text = Path(path).read_text().strip()[:4000] if path and Path(path).exists() else ''
    if not text:
        return
    existing = api('GET', f'/v1/builds/{build}/betaBuildLocalizations')['data']
    match = next((l for l in existing if l['attributes']['locale'] == locale), None)
    if match:
        api('PATCH', f'/v1/betaBuildLocalizations/{match["id"]}', {'data': {
            'type': 'betaBuildLocalizations', 'id': match['id'], 'attributes': {'whatsNew': text}}})
    else:
        api('POST', '/v1/betaBuildLocalizations', {'data': {
            'type': 'betaBuildLocalizations', 'attributes': {'locale': locale, 'whatsNew': text},
            'relationships': {'build': {'data': {'type': 'builds', 'id': build}}}}})


def external_group(app):
    groups = api('GET', f'/v1/apps/{app}/betaGroups?limit=200')['data']
    group = next((g for g in groups if g['attributes']['name'] == GROUP
                  and not g['attributes']['isInternalGroup']), None)
    if group:
        return group
    print(f'Creating external TestFlight group "{GROUP}"')
    return api('POST', '/v1/betaGroups', {'data': {
        'type': 'betaGroups', 'attributes': {'name': GROUP},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})['data']


def submit_for_review(build):
    state = api('GET', f'/v1/builds/{build}/buildBetaDetail')['data']['attributes'].get('externalBuildState')
    if state in REVIEW_STATES:
        return state
    api('POST', '/v1/betaAppReviewSubmissions', {'data': {
        'type': 'betaAppReviewSubmissions',
        'relationships': {'build': {'data': {'type': 'builds', 'id': build}}}}})
    return api('GET', f'/v1/builds/{build}/buildBetaDetail')['data']['attributes'].get('externalBuildState')


def enable_public_link(group):
    attrs = group['attributes']
    if not attrs.get('publicLinkEnabled'):
        try:
            group = api('PATCH', f'/v1/betaGroups/{group["id"]}', {'data': {
                'type': 'betaGroups', 'id': group['id'],
                'attributes': {'publicLinkEnabled': True, 'publicLinkLimitEnabled': False}}}, fail=False)['data']
        except ApiError as error:
            summary(f'Public link not enabled yet (HTTP {error.status}); enable it in App Store Connect '
                    'once the build has passed review, or re-run this job.')
            return
    if group['attributes'].get('publicLink'):
        summary(f'Public TestFlight link: {group["attributes"]["publicLink"]}')


def main():
    app = app_id()
    locale = api('GET', f'/v1/apps/{app}?fields[apps]=primaryLocale')['data']['attributes']['primaryLocale']
    check_test_information(app, locale)
    build = find_build(app)
    set_whats_new(build, locale)
    group = external_group(app)
    api('POST', f'/v1/betaGroups/{group["id"]}/relationships/builds',
        {'data': [{'type': 'builds', 'id': build}]})
    state = submit_for_review(build)
    summary(f'iOS: TimeClaim {VERSION} ({BUILD_NUMBER}) added to TestFlight group "{GROUP}", state {state}.')
    enable_public_link(group)


if __name__ == '__main__':
    main()
