# Hyderabad Repair 2 release readiness

**DEMO_READY_WITH_LIMITATIONS.** The synthetic application, real localhost financial sequence and offline fallback passed. On the previous candidate the maintainer ran Edge and obtained 26 passes, two failures and one fixture skip. The two traced test defects have been repaired. Interactive Edge acceptance of the repaired candidate and authenticated GitHub publication remain pending.

| Gate | Status |
| --- | --- |
| Financial integrity, Hyderabad API and static HTTP | PASS |
| Frontend unit suite, build and offline fallback | PASS |
| Repaired Edge journey, 390 px, keyboard and console | BLOCKED in the managed session by browser startup |
| GitHub publication | BLOCKED pending local Git authentication |
| Live inference, regional speech, merchant deployment | NOT_RUN or conditional |

[Demo runbook](VENUE_RUNBOOK.md) · [Browser witness](LAPTOP_BROWSER_WITNESS.md) · [Publication checklist](PUBLISH_CHECKLIST.md)
