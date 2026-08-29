# Prototype limitations and next steps

## Limitations

- LMSR math uses IEEE floats then millipoint rounding, not a decimal library.
- Trades are sequenced with optimistic wallet updates, not a pooled SQL transaction (PGLite is single-connection; Neon should use a true transaction client before production).
- CRM is simulated. The adapter is a TypeScript module, not a live Salesforce/HubSpot connector.
- Email/password demo users are seeded for walkthroughs. Production should use SSO and SCIM.
- No file attachments on disputes/resolutions.
- No websocket live tape — refresh after a trade.
- Jurisdiction-specific legal review is not encoded as policy-as-code.

## Production roadmap

1. Neon + Better Auth SSO already match the deploy target; add SCIM and an org allow-list.
2. Wrap trades in a single database transaction.
3. Plug `CrmAdapter` into Salesforce/HubSpot with field-level mapping and a human confirmation step before auto-resolve.
4. Add decimal/fixed-point LMSR and property tests.
5. Retention jobs for audit, comments, and PII.
6. Employment-law review, DPA, and an explicit “not a gambling product / not an HR score” addendum per jurisdiction.
7. Observability: structured audit export, anomaly detection on wash trading, and market-manipulation alerts.
