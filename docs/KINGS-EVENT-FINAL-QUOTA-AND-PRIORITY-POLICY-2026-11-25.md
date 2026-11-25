# Kings Event Systems #12–18 — Final Capacity and Priority Contract
**Date:** 25 November 2026 | **Draft PR #143 only** | **Not deployed**

## Binding CEO decisions
| Dimension | Final planning rule |
|---|---|
| Daily total | **Maximum 3 Convoys**, **every UTC date**, all categories **Kings + Partner + External combined** |
| Partner Convoys per UTC calendar month | **Maximum 20** |
| External Convoys per UTC calendar month | **Maximum 20** |
| Kings Convoys per UTC calendar month | **Unlimited**, but still subject to 3/day total |
| Weekly limit | **None** |
| Separate Partner/External per-day limit | **None**, beyond the common 3/day limit |
| Friday/Saturday/Sunday special quota | **None** |
| For competing NEW UNCONFIRMED requests | **1. Kings; 2. Partner; 3. External**; stable order within each category |
| Convoy departure separation | Warn below 120 min; planning guideline 120–180 min |

**Priorities are advisory review order only:** they do not let a later Kings request automatically cancel, move, override or free a confirmed Partner/External Convoy, a reserved parking slot or signed historical hold. Staff must review actual confirmed decisions and coverage manually.

**All dates are UTC.** Different German MEZ/MESZ days do not alter which UTC day/month quota applies. The month quota resets at 00:00 UTC on the 1st. No rolling weekly windows or synthetic week limits are allowed.

## Applied to Draft PR #143
- \`event-capacity-policy.js\`: canonical version \`KINGS-EVENT-QUOTAS-2026-11-FINAL\`, exact global 3/day total, independent 20+20/month, Kings no monthly max, no weekly cap, stable redacted Kings→Partner→External review order.
- \`event-capacity-core.js\`: Kings consumes the daily 3; separate monthly threshold warnings (over 20 is flagged, at 20 means a proposed further request needs review). No categoric day cap or invented bookings.
- \`event-capacity-live-calendar-summary.js\`: Convoy ZIP-to-private Calendar flags total-day conflicts, monthly Partner/External overages and mixed-category human-priority conflicts; signed legacy is separate.
- \`event-capacity-dashboard.js\`, \`event-capacity-day-view.js\`: private read-only day/month numbers and warnings use the new limits, not Mon–Thu/Fri–Sun.
- \`event-capacity-staff-calendar-review.js\`: current Staff year/day view reflects final policy and still **does not add historical holds to current source totals** or claim free availability.
- \`event-capacity-booking-safety-review.js\`: for ANY category including Kings, reported daily count >=3 requires review before another request; Partner/External reported monthly count >=20 similarly blocks a clear source-only pass. All booking decisions remain **unsafe to activate** until original Event identity, verified approval, complete history and parking/slot evidence are supplied. No writes performed.
- \`event-capacity-github-known-usage.js\` and \`event-capacity-github-only.js\`: same daily/monthly limits and priority policy in privacy-protected source reads/messages.

**Historical evidence compatibility:** Signed historical reservation-hold reports were produced under an older **2/day and 20/month** audit format. Their existing semantics remain frozen in the isolated legacy validator. They are NOT automatically reinterpreted as the new 3/day policy, do not prove full history, and never release old or rescheduled dates.

## Non-activation and release checks
The large PR #143 remains **Draft / not merged**. Production \`main\`, actual Convoy Checker, Discord, Staff permissions, booking and historical release systems are untouched by this patch. A private current source report, however fresh, is insufficient proof that a date or parking slot is available. **No automatic booking, Staff approval, moving, canceling or slot release is authorized.**

Run the full exact-HEAD GitHub CI and inspect any remaining old-rule tests before consideration of a selective merge. The small independent source-only Pilot PR #145 is a separate release decision. Use GitHub Free only; no new host/database service required.
