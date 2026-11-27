# Attendance-Based Payroll & GPS Attendance Scenarios

Concise real-world reference covering every implemented scenario for fixed monthly salaries, hourly pay bands, GPS job visits, and HR/admin review. All examples assume company timezone `Asia/Tbilisi` and GEL currency.

## 1. Fixed Monthly Salary

### 1.1 Normal scheduled month vs. missing attendance
- **Setup:** Giorgi earns `2,200 GEL/month`, scheduled Mon-Fri (`22` working days in the month), confirmed full-month employment.
- **Worked all scheduled days (or covered by approved vacation/sick leave/day off):** Clean and payout-ready (`2,200.00 GEL`).
- **Missed a past scheduled day with no punch and no approved leave:** The system creates a `missing_scheduled_day` review item with `0.00 GEL` deduction (never auto-deducts). Salary payout is blocked until HR/Admin adds attendance or marks the item resolved with a reason in `/manage/payroll/review`.
- **Open or auto-closed (18h) session on a scheduled day:** Flagged as `incomplete_attendance` and held for HR/Admin review.

### 1.2 Rest-day clock-in switch (independent of bonus switch)
- **Default for all employees:** `Rest-day clock-in = ON`, `Auto rest-day bonus = OFF`. Controlled by HR, Admin, and Owner on `/manage/employees/$employeeId` or `/manage/payroll/$userId` (never self-editable).
- **Switch ON:** Employee can clock in on a rest day after confirming the day-off dialog.
- **Switch OFF:** Self clock-in on a rest day is blocked on the server with a Georgian message. Already-open sessions from a previous day can still clock out, and HR/Admin can still assist or correct attendance.

### 1.3 Automatic rest-day bonus (effective-dated, Option 1A)
- **Switch OFF:** Working on a rest day records attendance only (`0.00 GEL` automatic bonus).
- **Switch ON (effective `2026-11-20`):** Rest days before `2026-11-20` generate no bonus. On Saturday `2026-11-21` (worked `10:00 - 18:00`, or split into `10:00 - 14:00` + `15:00 - 19:00`):
  - One bonus per rest date: `(2,200 / 22) * 1.30 = 130.00 GEL`.
  - Automatic note: `დასვენების დღეს მუშაობის ბონუსი (2026-11-21)`.
  - Flows into the `adjustments` (bonus/premium) payout stage alongside manual adjustments without overwriting them.
- **Short rest-day shift (< 4 hours, e.g., `10:00 - 12:00`):** Still calculates full `130.00 GEL` (Option 1A) AND flags `short_rest_day_session`. Payout of the `adjustments` stage is blocked until HR/Admin approves `130.00 GEL`, overrides to another amount (for example `95.00 GEL`), or voids it with a required reason.
- **Partial month, mid-month rate change, or unknown schedule history:** Flagged `divisor_needs_review` for HR/Admin confirmation before payout.

---

## 2. Hourly Salary (Time Bands & Rest Days)

Non-stacking priority per time slice: `GPS job (1.30x + 20m)` -> `Rest day (1.30x)` -> `Night 00:00-10:00 (1.30x)` -> `Evening 21:00-00:00 (1.10x)` -> `Daytime 10:00-21:00 (1.00x)`. Exact elapsed seconds are priced in integer tetri with half-up rounding.

### 2.1 Scheduled daytime + up to 2 extra hours
- **Setup:** Dato earns `20 GEL/hour`, scheduled `10:00 - 19:00` (9h).
- **Works `10:00 - 21:00` (11h):** Within `9h + 2h = 11h` daytime allowance -> `11 * 20 * 1.00 = 220.00 GEL`, payout-ready.

### 2.2 Excess daytime hours (> scheduled + 2h)
- **Setup:** Dato scheduled `10:00 - 18:00` (8h -> allowance is `10h`), works `10:00 - 21:00` (11h).
- **Result:** All 11h calculate at `1.00x` (`220.00 GEL`), AND the 11th hour triggers `excess_daytime_hours` so HR/Admin reviews (approve as `220.00 GEL` or override) before payout.

### 2.3 Evening, night, overnight, and month rollover
- **Works `20:00` (Nov 18) to `01:00` (Nov 19), both scheduled days:**
  - `20:00 - 21:00` (1h daytime): `20.00 GEL`
  - `21:00 - 00:00` (3h evening `+10%`): `3 * 20 * 1.10 = 66.00 GEL`
  - `00:00 - 01:00` (1h night `+30%`): `1 * 20 * 1.30 = 26.00 GEL`
  - **Total = `112.00 GEL`** (apportioned cleanly by local calendar date; shifts crossing `Nov 30 -> Dec 1` split across November and December automatically).

### 2.4 Rest-day hourly work (no stacking)
- **Works Saturday (rest day) `00:00 - 02:00` (2h):** Single `+30%` multiplier applies (`2 * 20 * 1.30 = 52.00 GEL`), never stacked with night `+30%`.

### 2.5 Split-schedule installments
- On a two-payment schedule, first installment (`1/2`) uses days `1 - 15` calculated hourly pay, and final salary (`2/2`) uses full-month cumulative calculated hourly pay minus the recorded first installment.

### 2.6 Mid-month Fixed <-> Hourly transitions
- **Formula for fixed portion:** `(monthlySalary / scheduledWorkingDaysInMonth) * fixedPartScheduledWorkingDays` (exact integer tetri with half-up rounding), added to the exact hourly + GPS earnings from the hourly portion of the month.
- **Example (December 2026, `23` weekdays, `2,300 GEL/month` fixed, `20 GEL/hour`):**
  - **Fixed -> Hourly on Dec 9:** Dec 1-8 has `6` scheduled working days -> `(2,300 / 23) * 6 = 600.00 GEL` fixed + hourly earnings from Dec 9-31. First-half (`1/2`) pays the fixed working days inside Dec 1-15 (`600.00 GEL`) plus hourly earnings in Dec 9-15; final (`2/2`) pays the exact remainder.
  - **Hourly -> Fixed on Dec 9:** Dec 1-8 hourly earnings + Dec 9-31 (`17` scheduled working days) -> `(2,300 / 23) * 17 = 1,700.00 GEL`. First-half (`1/2`) pays hourly earnings in Dec 1-8 plus the `5` fixed working days inside Dec 9-15 (`500.00 GEL`); final (`2/2`) pays the remaining `1,200.00 GEL`.
- **Safety:** Payout-ready automatically when schedule history is complete and attendance is clean (while showing the exact split breakdown in Monthly Payroll and `/manage/payroll/review` and allowing manual override). If schedule history has gaps or attendance has a review flag (for example a missing scheduled day during the fixed part), payout blocks for confirmation or HR/Admin review.

---

## 3. GPS Job Presence, Auto Attendance & Hourly Pay

Active mapped jobs (`pending`, `en_route`, `on_site`) with coordinates, an enabled tracker, and assigned crew are evaluated every minute by the server-side `gps:geofence-presence` task outside the TCP receiver's acknowledgment path.

### 3.1 Observation mode vs. Automatic mode
- **Observation mode (default, `autoAttendanceEnabled = false` on `/manage/gps`):** Confirms entries/exits and records visits/crew outcomes as `observed` without creating attendance sessions or payroll earnings.
- **Automatic mode (`autoAttendanceEnabled = true`):** Confirms entries/exits, automatically clocks eligible crew in/out with `gps_visit_id` provenance, and feeds hourly crew visits into payroll.

### 3.2 Anti-drift dwell & tracker sleep mode
- **Drive-by (< 3 min inside):** Ignored; returns to `outside`.
- **Brief GPS jitter (< 5 min outside while inside):** Ignored; stays `inside`.
- **Tracker enters sleep mode while parked at the job:** Silence never triggers an exit. Even if the tracker sent only 1 valid inside fix at `11:00`, slept for 2 hours, and woke up outside at `13:00` (confirmed outside at `13:05`), the system detects the full `11:00 - 13:00` (`2h 00m`) visit.

### 3.3 Mixed crew calculation & `+20 minutes` once per job per day
- **Job A (`2h 00m` confirmed visit), crew = Dato (`20 GEL/h`), Luka (`15 GEL/h`), Nino (fixed monthly):**
  - Dato: `(2h + 20m) * 20 * 1.30 = 60.67 GEL` (ready).
  - Luka: `(2h + 20m) * 15 * 1.30 = 45.50 GEL` (ready).
  - Nino: attendance session recorded, `0.00 GEL` hourly GPS payout.
- **Crew returns to the same Job A later the same day for `1h 00m`:** No duplicate `+20m` allowance -> `1h * 20 * 1.30 = 26.00 GEL`. Visiting a *different* Job B the same day grants `+20m` for Job B.
- **No double counting:** GPS-linked attendance sessions are excluded from ordinary hourly bands so those seconds are priced exactly once.

### 3.4 Conflict with open/overlapping manual punch
- If Luka already had an open manual punch from `10:00` when the crew entered Job A (`11:00 - 13:00`):
  - The system does **not** close or overwrite Luka's manual session.
  - It records `conflict_open_session` AND preserves his exact `2h 00m` detected on-site duration for Job A.
  - A `gps_conflict` review item blocks his salary stage in `/manage/payroll/review` until HR/Admin resolves, overrides, or voids it.

### 3.5 Overlapping active jobs on one tracker
- If one tracker simultaneously enters two active jobs with overlapping geofences, the overlapping visit is marked `uncertain` and routed to HR/Admin review instead of double-clocking the crew.

---

## 4. Review by Exception, Overrides & Audit Trail

- **Clean items:** Immediately `ready` for payout in Monthly Payroll, while still inspectable and overridable by HR/Admin before payment publication.
- **Flagged items:** Block only the affected payout stage (`adjustments` for rest-day bonuses; `salary` / `first` for missing scheduled days, hourly flags, or GPS conflicts) until HR/Admin acts in `/manage/payroll/review`.
- **Stale override protection:** If HR overrides an item and someone later corrects the underlying attendance session (including admins correcting GPS punches via `attendance.gps.correct`) or changes the salary term, the SHA-256 `sourceHash` mismatch automatically flags `stale_override` for re-review.
- **Security & immutability:** No user can edit their own rest-day switches or review their own payroll items. Already-published `payroll_payment` stages stay immutable; every decision requires a Georgian reason and keeps append-only versioned history.
