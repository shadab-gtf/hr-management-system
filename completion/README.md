# Frontend completion tracker

Updated: 2026-09-30. This folder records implemented work, executed evidence, and outstanding work separately. FE phases describe the mock-data web frontend; they do not close the full-system P0–P6 phases.

| Phase | Scope | Status |
| --- | --- | --- |
| [FE1](FE1.md) | Next.js foundation, Google Sans, themes, primitives, typed mocks, Query/Sonner/Motion/Boneyard | Implemented; final verification and release limits recorded in FE1 |
| [FE2–FE6](FE2.md) | Roles and navigation, dashboards, people, time and leave, salary and payroll, documents, helpdesk, requests, approvals, HR admin, Engage | Implemented on the mock backend; verification and gates in FE2 |
| [FE3](FE3.md) | HR administration (holidays, events, leave policy, shifts & overtime, organization, probation, lifecycle, checklists, service queue), face-device attendance import, salary import (maker/checker), monthly payroll & attendance reports, notification preferences | Implemented on the mock backend; verification and gates in FE3 |
| [FE4](FE4.md) | greytHR-parity modules: statutory payroll (PF/ESI/PT/LWF/TDS, returns, challans, Form 16, structures, bank advice), leave ledger/comp-off/encashment/year-end, shift roster, resignation and F&F, assets, letter templates, policy acknowledgements, performance, recruitment and careers, polls/surveys/praise, timesheets, report builder, SMS/WhatsApp channels, Hindi shell, approvals work queue, header theme toggle | Implemented on the mock backend; verification and gaps in FE4 |
| [API integration](API-INTEGRATION.md) | Current server API → backend module coverage in Supabase mode | 137/299 API operations have a database handler; production database verification pending |
| FE7 | Cross-module qualification, PWA (installable shell, permissions), performance and live-API integration | PWA shell implemented (see FE2); live API, real-device and performance qualification pending |

Each phase records: scope, files/features delivered, checks actually executed, defects fixed, remaining work, external decisions and the next phase boundary. A mock interaction is not backend enforcement. No live payroll, employee records or production deployment is included.
