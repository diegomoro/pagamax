# Paga Menos Account Deletion

Last updated: 2026-06-06

Users can request account deletion from inside the app or from this public page.

## Delete In The App

1. Open Paga Menos.
2. Go to Profile.
3. Open Data and privacy.
4. Choose Delete account.
5. Confirm the deletion prompt.

## Delete From The Web

Send an email to support@pagamenos.app with:

- Subject: Paga Menos account deletion
- The email address used for the Paga Menos account
- Optional: any extra account identifier shown in the app

The production public beta should replace this repository page with a hosted deletion form before Google Play submission.

## Data Deleted

Deletion removes:

- User profile and account identifiers from active systems
- Saved aliases and saved merchants
- Payment method configuration and toggles
- Consent settings
- Diagnostics tied to the user id
- Telemetry identifiers tied to the user id
- Device bindings and refresh sessions

## Data Retained Temporarily

Paga Menos may retain limited security, fraud, audit, abuse-prevention, and legal records where required or reasonably necessary. Retained records should be minimized, access-controlled, and excluded from product analytics.

## Timing

In-app deletion should remove local data immediately and submit a backend deletion request. Backend deletion should complete as soon as operationally practical and within the timeframe promised in the published privacy policy and support workflow.
