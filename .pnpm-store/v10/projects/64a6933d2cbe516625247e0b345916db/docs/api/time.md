# Attendance, leave and time workflows

All paths below are relative to /api/v1. Every request requires a bearer token. Mutations use one PostgreSQL transaction for row changes, approval/ledger effects, audit and optional Idempotency-Key replay. If-Match carries the displayed record version.

81 endpoints:

| Method | Path                                              | Capability                    |
| ------ | ------------------------------------------------- | ----------------------------- |
| GET    | /employees/:id/leave-eligibility                  | employee.update               |
| PATCH  | /employees/:id/leave-eligibility                  | employee.update               |
| GET    | /attendance/today                                 | attendance.read.self          |
| GET    | /attendance/days                                  | attendance.read.self          |
| GET    | /attendance/team/today                            | attendance.read.team          |
| POST   | /attendance/events                                | attendance.capture.self       |
| POST   | /attendance/location-check                        | attendance.capture.self       |
| POST   | /attendance/regularizations                       | attendance.regularize.request |
| POST   | /attendance/permissions                           | attendance.regularize.request |
| GET    | /attendance/roster/me                             | attendance.read.self          |
| GET    | /attendance/roster/planner                        | roster.manage                 |
| PATCH  | /attendance/roster/:department/:weekStart         | roster.manage                 |
| POST   | /attendance/roster/:department/:weekStart/pattern | roster.manage                 |
| PATCH  | /config/weekly-offs/:department                   | policy.publish                |
| POST   | /attendance/roster/swaps                          | attendance.read.self          |
| POST   | /attendance/roster/swaps/:id/decision             | roster.manage                 |
| POST   | /attendance/roster/swaps/:id/cancel               | attendance.read.self          |
| GET    | /leave/overview                                   | leave.request.self            |
| POST   | /leave/requests                                   | leave.request.self            |
| POST   | /leave/requests/:id/cancel                        | leave.cancel.self             |
| GET    | /leave/calendar                                   | leave.request.self            |
| GET    | /calendar/holidays                                | null                          |
| GET    | /leave/ledger                                     | leave.request.self            |
| GET    | /leave/ledger/:id                                 | employee.update               |
| GET    | /leave/admin/people                               | employee.update               |
| POST   | /leave/admin/adjustments                          | employee.update               |
| GET    | /leave/comp-off                                   | leave.request.self            |
| POST   | /leave/comp-off/claims                            | leave.request.self            |
| POST   | /leave/comp-off/claims/:id/decision               | approval.decide               |
| POST   | /leave/comp-off/claims/:id/cancel                 | leave.cancel.self             |
| POST   | /leave/encashments                                | leave.request.self            |
| POST   | /leave/encashments/:id/decision                   | employee.update               |
| POST   | /leave/encashments/:id/cancel                     | leave.cancel.self             |
| GET    | /leave/admin/year-end                             | employee.update               |
| POST   | /leave/admin/year-end/:year/commit                | employee.update               |
| GET    | /me/home/who-is-out                               | null                          |
| GET    | /expenses                                         | expense.submit.self           |
| POST   | /expenses                                         | expense.submit.self           |
| GET    | /me/requests                                      | null                          |
| GET    | /me/delegations                                   | delegation.manage             |
| POST   | /me/delegations                                   | delegation.manage             |
| POST   | /me/delegations/:id/revoke                        | delegation.manage             |
| GET    | /approvals                                        | approval.decide               |
| POST   | /approvals/:id/decisions                          | approval.decide               |
| GET    | /me/work-queue                                    | null                          |
| GET    | /timesheets/weeks/me                              | timesheet.submit.self         |
| POST   | /timesheets/weeks/me/:weekStart                   | timesheet.submit.self         |
| POST   | /timesheets/weeks/me/:weekStart/copy-previous     | timesheet.submit.self         |
| GET    | /timesheets/team                                  | timesheet.approve             |
| POST   | /timesheets/weeks/:id/decision                    | timesheet.approve             |
| POST   | /timesheets/reminders                             | timesheet.approve             |
| GET    | /projects                                         | project.manage                |
| POST   | /projects                                         | project.manage                |
| PATCH  | /projects/:id                                     | project.manage                |
| GET    | /imports/attendance                               | import.commit                 |
| POST   | /imports/attendance/upload                        | import.commit                 |
| POST   | /imports/attendance                               | import.commit                 |
| GET    | /imports/attendance/:id                           | import.commit                 |
| POST   | /imports/attendance/:id/commit                    | import.commit                 |
| POST   | /imports/attendance/:id/discard                   | import.commit                 |
| GET    | /config/holidays                                  | policy.publish                |
| POST   | /config/holidays                                  | policy.publish                |
| PATCH  | /config/holidays/:id                              | policy.publish                |
| POST   | /config/holidays/:id/delete                       | policy.publish                |
| GET    | /config/leave-types/version                       | null                          |
| GET    | /config/leave-types                               | policy.publish                |
| POST   | /config/leave-types                               | policy.publish                |
| PATCH  | /config/leave-types/:id                           | policy.publish                |
| GET    | /config/attendance                                | policy.publish                |
| POST   | /config/shifts                                    | policy.publish                |
| PATCH  | /config/shifts/:id                                | policy.publish                |
| POST   | /config/shifts/:id/delete                         | policy.publish                |
| POST   | /config/shifts/:id/default                        | policy.publish                |
| PATCH  | /config/departments/:department/shift             | policy.publish                |
| PATCH  | /config/attendance/overtime                       | policy.publish                |
| PATCH  | /config/attendance/late-early                     | policy.publish                |
| GET    | /config/sites/address-search                      | policy.publish                |
| POST   | /config/sites                                     | policy.publish                |
| PATCH  | /config/sites/:id                                 | policy.publish                |
| POST   | /config/sites/:id/delete                          | policy.publish                |
| POST   | /timesheets/exports/approved                      | project.manage                |

Attendance uploads accept CSV/XLSX files as {fileName, contentBase64}, up to 5 MB and 20,000 normalized records. The server retains source bytes, stages row findings, rejects commit when errors exist, and inserts accepted records in chunks. Preview rows are capped at 1,000 while totals and committed records cover the complete file.

Payroll/report adapters: employeeAttendanceMonth(client, context, employeeId, month) accepts a Prisma client or transaction. leaveBalance(repository, employeeId, leaveTypeId, asOf) returns exact decimal strings. Approved encashment workflow payloads carry amount, perDay and payrollMonth.

Restricted leave policies use HR-verified eligibility. GET /employees/:id/leave-eligibility returns {employeeId, gender, version}; PATCH requires {gender: "female" | "male" | "other" | "unspecified", note, version} and writes an audited, versioned private record. These operational APIs let HR configure eligibility without direct database edits. New leave requests retain chargeDates so payroll uses the dates charged under the policy when requested.

Integration coverage: tests/integration/time.test.ts checks frontend contracts, authorization, row scope, idempotency, stale versions, check-in/out, regularization inputs, leave approval/cancellation postings, expenses, permissions, roster swaps, comp-off, encashment, imports, timesheets, delegation and year-end.
