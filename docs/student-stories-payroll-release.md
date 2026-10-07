# Student stories and historical currency correction

Production baseline: `fadb09952e461b8e20ba8b7cbfda93c59ac1a822`, deployment `dpl_776fMKNM1GkW6fDwD14kbnnmZyLf`.

## Impact matrix

| Data / flow | Writer and permission | Readers | Required invariant / result |
| --- | --- | --- | --- |
| Public student stories | Static website content | Public, parents, tutors | Six illustrative stories and photos; 3/2/1 columns; no database writes |
| Lesson currency and salary | Admin currency reconciliation | Admin student/teacher detail, tutor history/profile, reports | Salary = minutes × snapshot rate × snapshot level, with currency rounding; subject, status, minutes, booking references unchanged |
| Payroll currency and amount | Same Firestore transaction, admin only | Accounting payroll, tax summaries, exports, tutor history | Exactly one active linked unpaid payroll; amount equals lesson salary; paid/reopened-paid records blocked |
| Student package | Read only during reconciliation | Parent progress, quotas, scheduling, admin | Total/used/remaining/held diamonds and sessions unchanged |
| Audit log | Same transaction as reconciliation | Admin | Old/new amount and currency plus payroll ID recorded atomically |
| Backend / background jobs | No modified functions | Booking/class-hunt, parent access, classroom attendance | Existing compensation and special reconciliations blocked; no functions deployment |

Existing readers use the persisted lesson/payroll currency, so correcting both together fixes totals and export labels without a display-only workaround. No Firestore/Storage rules, indexes, Firebase config or schema changes.

## Historical repair safeguards

Package must exist and identify a valid currency. Its price must equal the historical lesson snapshot; otherwise fail for manual investigation. Read fresh lesson, student, catalog and payroll documents before any transaction write. Reject changed lesson snapshot, missing/duplicate active payroll, foreign teacher/student links, paid or reopened-paid records, class-hunt and booking reconciliations. Repeated correction preserves the same amount and currency; it never debits course funds. No bulk migration.

## Verification

- 65 automated regression cases passed: currency correction, canonical pricing, preserved paid payroll, attendance, booking groups, course ledger, quota and subject lifecycle.
- TypeScript and Vite production build passed.
- Public desktop: six cards, three columns, all six images loaded, no horizontal overflow.
- Public mobile 390 × 844: six cards, one column, no horizontal overflow; photo and Vietnamese copy visually checked.
- Admin/accounting/tutor/parent/backend: static audit; authenticated historical Kimberley repair pending Admin session. Do not claim her stored records were repaired without inspecting and verifying them.

## Assets

Six photos generated with the built-in imagegen tool. Prompt for every photo: one horizontal 3:2 documentary photograph for a Vietnamese education website student story card; an ordinary Vietnamese home, candid unposed moment, daylight, realistic skin/anatomy, fully clothed fictional child, natural phone-photo framing; no collage, text, watermark, retouching or cinematic lighting.

Scenes: Minh Anh speaking at a laptop; Gia Bảo showing a red-car picture; Khánh Linh studying with pink headphones; Đức Minh writing beside toy cars; Ngọc Hà singing along; Hoàng Nam reading with his mother. Saved under `public/student-stories/`. Public disclosure identifies names, photos and stories as illustrative.

## Deployment

Build from this isolated branch based on production, not the dirty primary checkout. Stage a production build without domain assignment, verify it, re-check live baseline then promote. Keep baseline deployment for rollback. Local production build uses existing project Firebase configuration; pulled Vercel variables were empty and must not be used to build a blank/invalid Firebase client. Environment files remain ignored and are not committed.
