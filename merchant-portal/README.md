# Merchant Portal Public Beta Scaffold

The merchant portal is the B2B monetization surface for the public beta. It is separate from the consumer app so consumer trust is not diluted by advertising UI.

Initial capabilities:

- Merchant identity and role-based login
- Sponsored offer setup and budget controls
- Review status before offers go live
- Dashboard for exposure, selection, handoff, saved merchant, feedback, and amount-band aggregates
- Category demand and recommendation-share reports
- Aggregate-only exports for merchants and issuers

Security requirements:

- No raw QR payload export
- No individual user export
- Role-based access control
- Audit logs for every offer, budget, export, and admin action
- Sponsored placements must be labeled and must not override a clearly better user recommendation

The static files in this folder are a prototype shell. Production should use the managed backend schema in `backend/public-beta/schema.sql`.
