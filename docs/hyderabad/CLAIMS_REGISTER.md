# Hyderabad claims register

| Claim | Evidence | Wording for the demo |
| --- | --- | --- |
| Human-confirmed signed journal | Existing implementation and this session's ASGI and reference tests | The journal records synthetic money after explicit merchant confirmation. |
| Repayment commitments and deterministic due follow-ups | New Hyderabad API tested with migrated SQLite | Merchant-entered expected dates and signed journal entries drive due states and evidence. |
| Grounded assistant | Deterministic answers and adversarial mock tests | The demo answers supported English questions using the recorded ledger and commitment evidence. |
| Live model inference | Optional adapter tested with a fake HTTP transport | The model adapter is gated and has no verified live result. |
| Customer contact | Draft preview and no-send tests | A merchant may review and copy an unsent draft. |
| Manual closure | ASGI handling, history and unchanged balance checks | Marking handled is an administrative closure. |
| Current browser evidence | Production build and a written Playwright journey | Browser verification and screenshots are pending. |
| Paytm and hosted release | Independent prototype, local synthetic scope | This is a local hackathon prototype. |
| Telugu/Hindi speech, collections uplift or user adoption | No current live locale evidence or merchant study | These require separate validation. |
| Code provenance | Existing release at `34dda13`, schema at `ef4966c`, Hyderabad additions on top | Hyderabad extends the existing Vishwas Khata financial foundation. |

The submitted Hyderabad PDF remains an archived design-era pitch. Use the wording above to distinguish the implementation and current verification when presenting it.
