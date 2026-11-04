# PLCC Bucks — Phase 2 audit

Recovered October 17, 2026. The proposed SQL was in Downloads (`awc_bucks_phase_2.sql`) and is now `supabase/migrations/awc_bucks_phase_2.sql`. The original test attachment and the nine-question write-up were not on disk. This note is that audit, rebuilt from the SQL and the review you already gave. The checks live in `scripts/awc-bucks-phase-2-sql-smoke.mjs`.

Phase 1 stays earn-and-view. Phase 2 adds the prize store, the church-cost budget, corrections that can be paid back, weekly challenges, and recommendations. It does not touch `store_orders` or `finance_budgets`.

## What the database enforces

- No negative wallet. A correction takes only Bucks that are not already on hold. The rest is owed and paid back from later awards, oldest correction first, using the whole new award (100%).
- No overspending. Approving past the month's budget needs a Super Admin and a note, and that override is written to `audit_logs`.
- No double prizes. The same tap key makes one request. Pickup spends the Bucks once. Two children asking for the last item: one request is kept.
- Volunteers cannot be granted `can_award`, even if every other switch is on. A recommendation pays only when a different person who can award approves it.
- Only a linked parent can request: an active guardian, or a verified adult in the child's household. Approvers can also request at the prize table. Unverified links, other parents, and the kiosk are refused.

## Permission matrix

| Who | Award | Approve prizes | Hand over a prize | Recommend | Request a prize |
| --- | --- | --- | --- | --- | --- |
| Super Admin | by role | by role | by role | only if granted | as an approver |
| Ministry Leader | by role | only if `can_approve` | if they can approve, or if `can_fulfill` | only if granted | as an approver, once they can approve |
| Teacher, Sunday School, Secretary, Asst. Secretary | award by role, or Secretary roles only if `can_award` | no | only if `can_fulfill` | only if granted | no |
| Volunteer | never | no | only if `can_fulfill` | only if granted | no |
| Linked parent / verified household adult | no | no | no | no | yes, for their child |
| Kiosk, guest, member, unverified link | no | no | no | no | no |

All 11 Ministry Leaders start with `can_approve` false. Nothing in the database marks who serves Children's Ministry, so a Super Admin turns approval on for the people who should have it.

## Defaults already in the SQL

These are the defaults the file uses. There is no separate percent setting and no pilot-month table.

1. Payback is 100% of each new award, oldest correction first.
2. The pilot window you named (November–January) is not stored. A month has a budget only after a Super Admin sets that month.
3. Prize Bucks prices are seeded (Sticker Pack 50, Coloring Book 150, Plush 250, Art Kit 400, Board Game 600). Church cost starts empty.
4. A prize cannot be approved until its church cost is entered.
5. Ministry Leaders do not approve until granted.
6. Volunteers cannot receive award rights.
7. Going over the budget needs a Super Admin and a note.
8. One open request per child per prize.
9. A reversal applies only what is still available. Leaders see the amount still to recover.

## Screens, in this order

1. Wallet — available Bucks, amount on hold, amount still to recover.
2. Prize list and parent request on Kids View.
3. Approve or reject, on the Kids Bucks page, for people who can approve.
4. Hand the prize over (pickup) for people who can fulfill.
5. Recommend, and a different leader decides.
6. Super Admin: church cost, stock, monthly budget, and the four permission switches.

## Not done on the live database

This file is in the repo. It has not been run on Supabase from this recovery. Apply it in the Supabase SQL editor after Phase 1, on the same project the app uses.
