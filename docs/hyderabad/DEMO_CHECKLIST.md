# Demo checklist

- [ ] Run setup on the demo laptop and launch `./scripts/demo_hyd.ps1`.
- [ ] Open [readiness](http://127.0.0.1:8000/v1/health/ready) and confirm schema revision 008.
- [ ] Open the app, confirm the synthetic date and check that the Merchant Assistant labels its mode deterministic.
- [ ] Walk through the ₹500 credit, ₹200 repayment, ₹300 commitment and unsent draft.
- [ ] Record ₹100 repayment and verify that the fresh preview uses ₹200.
- [ ] Record ₹500 additional credit and verify that the ₹700 balance requires commitment review.
- [ ] Run the compiled Edge suite on this laptop. Save browser evidence with the Git commit and date.
- [ ] If the screen is narrow, verify the 390px layout and keyboard access in the actual browser.
- [ ] Review the [claims register](CLAIMS_REGISTER.md) before presenting.
