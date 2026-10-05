import "server-only";
import { addDays, diffDays } from "@/lib/utils/date";
import { bookValuePaise, computeSettlement, noticePolicy } from "@/lib/mocks/handlers/lifecycle-rules";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import type {
  AssetCategory,
  AssetCondition,
  AssetStatus,
  ClearanceDepartment,
  ExitInterview,
  LetterKind,
  ResignationReason,
  ResignationState,
  SettlementState,
} from "@/types/lifecycle";

/* Synthetic resignations, full and final settlements, assets, letter templates, policy acknowledgements. Relative to the business date. */

export interface LifecycleEvent {
  id: string;
  at: string;
  actor: string;
  event: string;
  note: string | null;
}
export interface MockResignation {
  id: string;
  reference: string;
  employeeId: string;
  reason: ResignationReason;
  note: string;
  submittedAt: string;
  noticeDays: number;
  noticeBasis: string;
  policyLastWorkingDay: string;
  requestedLastWorkingDay: string;
  earlyReleaseReason: string;
  agreedLastWorkingDay: string | null;
  managerRecommendation: string | null;
  state: ResignationState;
  history: LifecycleEvent[];
  version: number;
}
export interface MockClearance {
  status: "pending" | "cleared";
  note: string | null;
  clearedBy: string | null;
  clearedAt: string | null;
}
export interface MockAsset {
  id: string;
  tag: string;
  category: AssetCategory;
  make: string;
  model: string;
  serial: string;
  purchasedOn: string;
  costPaise: number;
  condition: AssetCondition;
  status: AssetStatus;
  assigneeId: string | null;
  assignedAt: string | null;
  acknowledgedAt: string | null;
  notes: string;
  history: (LifecycleEvent & { employeeId: string | null; kind: "added" | "assigned" | "acknowledged" | "returned" | "status" | "edited" })[];
  version: number;
}
export interface MockAssetRequest {
  id: string;
  reference: string;
  employeeId: string;
  category: AssetCategory;
  reason: string;
  state: "pending" | "fulfilled" | "rejected";
  requestedAt: string;
  decidedAt: string | null;
  assetId: string | null;
  note: string | null;
}
export interface MockSettlementLine {
  id: string;
  code: string;
  kind: "earning" | "deduction";
  label: string;
  detail: string;
  paise: number;
  manual: boolean;
  reason: string | null;
}
export interface MockSettlement {
  id: string;
  reference: string;
  employeeId: string;
  lastWorkingDay: string;
  noticeDays: number;
  noticeShortfallDays: number;
  noticeWaived: boolean;
  waiverReason: string | null;
  lines: MockSettlementLine[];
  state: SettlementState;
  preparedById: string;
  preparedAt: string;
  submittedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  paidAt: string | null;
  paidOn: string | null;
  utr: string | null;
  audit: LifecycleEvent[];
  updatedAt: string;
  version: number;
  /** Seeded open settlements take their auto lines from live inputs on first read. */
  calculateOnLoad?: boolean;
}
export interface MockLetterTemplate {
  id: string;
  name: string;
  kind: LetterKind;
  subject: string;
  body: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  version: number;
}
export interface MockIssuedLetter {
  id: string;
  reference: string;
  employeeId: string;
  kind: LetterKind;
  title: string;
  subject: string;
  body: string;
  issuedAt: string;
  issuedBy: string;
  templateId: string | null;
  templateName: string | null;
}
export interface MockPolicy {
  id: string;
  title: string;
  version: string;
  summary: string;
  body: string;
  audience: string;
  publishedAt: string;
  publishedBy: string;
  dueOn: string;
  /** employeeId → acknowledgement instant. */
  acks: Record<string, string>;
  reminders: { at: string; by: string; count: number }[];
}

export interface LifecycleState {
  lcResignations: MockResignation[];
  lcClearances: Map<string, Record<ClearanceDepartment, MockClearance>>;
  lcExitInterviews: Map<string, ExitInterview>;
  lcAssets: MockAsset[];
  lcAssetRequests: MockAssetRequest[];
  lcSettlements: MockSettlement[];
  lcLetterTemplates: MockLetterTemplate[];
  lcIssuedLetters: MockIssuedLetter[];
  lcPolicies: MockPolicy[];
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;

export const LETTER_TEMPLATES: Omit<MockLetterTemplate, "updatedAt" | "updatedBy" | "version">[] = [
  {
    id: "tpl_offer",
    name: "Offer letter",
    kind: "offer",
    active: true,
    subject: "Offer of employment — {{designation}}",
    body: `Date: {{today}}
Ref: {{reference}}

Dear {{employee.firstName}},

We are delighted to offer you the position of {{designation}} in our {{department}} team at {{company}}, based at {{location}}.

Your annual cost to company will be {{ctc}}, with a monthly gross of {{monthlyGross}}. The detailed salary structure is attached as Annexure A.

Your expected date of joining is {{joinedOn}}. You will report to {{manager}}. This offer is subject to satisfactory verification of your documents and references.

Please sign and return a copy of this letter to confirm your acceptance.

We look forward to welcoming you.

Warm regards,
{{signatory}}
{{signatoryTitle}}
{{legalEntity}}`,
  },
  {
    id: "tpl_appointment",
    name: "Appointment letter",
    kind: "appointment",
    active: true,
    subject: "Letter of appointment",
    body: `Date: {{today}}
Ref: {{reference}}

Dear {{employee.name}},

Further to your acceptance of our offer, we are pleased to appoint you as {{designation}} ({{department}}) with effect from {{joinedOn}}. Your employee code is {{employee.code}}.

1. Place of work: {{location}}. You may be transferred to any office of {{company}} as business needs require.
2. Compensation: annual CTC of {{ctc}}, payable monthly as per the salary structure.
3. Probation: you will be on probation until {{probationEndsOn}}, after which your employment will be confirmed in writing.
4. Notice period: 30 days during probation and 60 days after confirmation, or salary in lieu thereof.
5. You will abide by the company's code of conduct, information security and other policies as amended from time to time.

Please sign the duplicate copy as a token of your acceptance.

For {{legalEntity}}

{{signatory}}
{{signatoryTitle}}`,
  },
  {
    id: "tpl_confirmation",
    name: "Confirmation letter",
    kind: "confirmation",
    active: true,
    subject: "Confirmation of employment",
    body: `Date: {{today}}
Ref: {{reference}}

Dear {{employee.name}} ({{employee.code}}),

We are pleased to inform you that, on successful completion of your probation, your services as {{designation}} are confirmed with effect from {{probationEndsOn}}.

All other terms and conditions of your appointment remain unchanged. Your notice period is now 60 days.

We appreciate your contribution and wish you continued success with {{company}}.

Regards,
{{signatory}}
{{signatoryTitle}}`,
  },
  {
    id: "tpl_increment",
    name: "Increment letter",
    kind: "increment",
    active: true,
    subject: "Revision of compensation",
    body: `Date: {{today}}
Ref: {{reference}}

Dear {{employee.firstName}},

In recognition of your performance and contribution as {{designation}}, we are pleased to revise your annual cost to company to {{ctc}} (monthly gross {{monthlyGross}}).

The revised compensation is effective from the current payroll month. Your revised salary structure is available in the Salary section of GTF HR.

Please treat this information as strictly confidential.

Congratulations, and thank you for your continued commitment.

{{signatory}}
{{signatoryTitle}}
{{company}}`,
  },
  {
    id: "tpl_experience",
    name: "Experience letter",
    kind: "experience",
    active: true,
    subject: "Experience certificate",
    body: `Date: {{today}}
Ref: {{reference}}

TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} (Employee code {{employee.code}}) was employed with {{legalEntity}} from {{joinedOn}} to {{lastWorkingDay}}, a total service of {{service}}.

At the time of leaving, {{employee.firstName}} held the position of {{designation}} in the {{department}} department.

During this tenure we found {{employee.firstName}} sincere, hardworking and professional. We wish {{employee.firstName}} every success in future endeavours.

For {{legalEntity}}

{{signatory}}
{{signatoryTitle}}`,
  },
  {
    id: "tpl_relieving",
    name: "Relieving letter",
    kind: "relieving",
    active: true,
    subject: "Relieving letter",
    body: `Date: {{today}}
Ref: {{reference}}

Dear {{employee.name}},

This is with reference to your resignation. We confirm that you have been relieved from the services of {{legalEntity}} at the close of business hours on {{lastWorkingDay}}.

Your full and final settlement has been processed as per company policy, and you have completed all clearance formalities, including the return of company assets.

We thank you for your contributions during your association with {{company}} as {{designation}} and wish you the very best.

For {{legalEntity}}

{{signatory}}
{{signatoryTitle}}`,
  },
  {
    id: "tpl_address",
    name: "Address proof letter",
    kind: "address_proof",
    active: true,
    subject: "Address confirmation",
    body: `Date: {{today}}
Ref: {{reference}}

To,
{{addressedTo}}

This is to certify that {{employee.name}} (Employee code {{employee.code}}) is employed with {{legalEntity}} as {{designation}} since {{joinedOn}}.

As per our records, the residential address of {{employee.firstName}} is:
{{address}}

This letter is issued at the request of the employee for the purpose of {{purpose}} and carries no financial liability on the company.

For {{legalEntity}}

{{signatory}}
{{signatoryTitle}}`,
  },
];

export function createLifecycleState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): LifecycleState {
  const person = (n: number) => employees.find((item) => item.id === e(n));
  const name = (n: number) => person(n)?.name ?? "HR Operations";
  let seq = 0;
  const ev = (at: string, actor: string, event: string, note: string | null = null): LifecycleEvent => ({ id: `lce_${(seq += 1)}`, at, actor, event, note });
  const yy = today.slice(2, 4);

  /* Resignations ----------------------------------------------------------- */
  const confirmed = noticePolicy("full_time", false);
  const nehaSubmitted = addDays(today, -38);
  const nehaLwd = addDays(today, 18);
  const ritikaLwd = addDays(today, -45);
  const lcResignations: MockResignation[] = [
    {
      id: "rs_1", reference: `RSG-${yy}0041`, employeeId: e(18), reason: "relocation", note: "Relocating to Bengaluru to be closer to family. Thank you for the last four years.",
      submittedAt: ago(38, "11:20"), noticeDays: confirmed.days, noticeBasis: confirmed.basis, policyLastWorkingDay: addDays(nehaSubmitted, confirmed.days),
      requestedLastWorkingDay: nehaLwd, earlyReleaseReason: "New employer needs me to join by the third week of October.", agreedLastWorkingDay: nehaLwd,
      managerRecommendation: "Support early release — handover to Karan is planned.", state: "accepted", version: 3,
      history: [
        ev(ago(38, "11:20"), name(18), "Resignation submitted", "Early release requested"),
        ev(ago(36, "15:05"), name(13), "Manager accepted", "Support early release — handover to Karan is planned."),
        ev(ago(12, "10:15"), name(5), "HR accepted", `Agreed last working day ${nehaLwd}; 4 days of notice pay recovery unless waived.`),
      ],
    },
    {
      id: "rs_2", reference: `RSG-${yy}0057`, employeeId: e(40), reason: "better_opportunity", note: "I have accepted a data platform role closer to home in Pune. Grateful for the last three years.",
      submittedAt: ago(3, "10:40"), noticeDays: confirmed.days, noticeBasis: confirmed.basis, policyLastWorkingDay: addDays(today, 57), requestedLastWorkingDay: addDays(today, 57),
      earlyReleaseReason: "", agreedLastWorkingDay: null, managerRecommendation: "Tried retention; Omkar has decided. Serve full notice.", state: "pending_hr", version: 2,
      history: [ev(ago(3, "10:40"), name(40), "Resignation submitted"), ev(ago(1, "17:10"), name(13), "Manager accepted", "Tried retention; Omkar has decided. Serve full notice.")],
    },
    {
      id: "rs_3", reference: `RSG-${yy}0059`, employeeId: e(35), reason: "higher_studies", note: "I have been admitted to a full-time MBA programme starting in November.",
      submittedAt: ago(1, "09:50"), noticeDays: confirmed.days, noticeBasis: confirmed.basis, policyLastWorkingDay: addDays(today, 59), requestedLastWorkingDay: addDays(today, 29),
      earlyReleaseReason: "Programme orientation begins before my notice would end.", agreedLastWorkingDay: null, managerRecommendation: null, state: "pending_manager", version: 1,
      history: [ev(ago(1, "09:50"), name(35), "Resignation submitted", "Early release requested")],
    },
    {
      id: "rs_4", reference: `RSG-${yy}0012`, employeeId: e(27), reason: "compensation", note: "Considering an external offer.",
      submittedAt: ago(96), noticeDays: confirmed.days, noticeBasis: confirmed.basis, policyLastWorkingDay: addDays(today, -36), requestedLastWorkingDay: addDays(today, -36),
      earlyReleaseReason: "", agreedLastWorkingDay: null, managerRecommendation: null, state: "withdrawn", version: 3,
      history: [ev(ago(96), name(27), "Resignation submitted"), ev(ago(94), name(25), "Put on hold", "Retention discussion scheduled with Strategy Director."), ev(ago(90), name(27), "Withdrawn", "Staying on after the revised role discussion.")],
    },
    {
      id: "rs_5", reference: `RSG-${yy}0019`, employeeId: e(43), reason: "career_change", note: "Moving into product management at a start-up.",
      submittedAt: ago(106), noticeDays: confirmed.days, noticeBasis: confirmed.basis, policyLastWorkingDay: addDays(today, -46), requestedLastWorkingDay: ritikaLwd,
      earlyReleaseReason: "", agreedLastWorkingDay: ritikaLwd, managerRecommendation: "Accept.", state: "accepted", version: 3,
      history: [ev(ago(106), name(43), "Resignation submitted"), ev(ago(105), name(30), "Manager accepted", "Accept."), ev(ago(104), name(5), "HR accepted", `Agreed last working day ${ritikaLwd}`)],
    },
  ];

  /* Clearances & exit interviews ------------------------------------------ */
  const pending = (): MockClearance => ({ status: "pending", note: null, clearedBy: null, clearedAt: null });
  const cleared = (by: string, at: string, note: string): MockClearance => ({ status: "cleared", note, clearedBy: by, clearedAt: at });
  const lcClearances = new Map<string, Record<ClearanceDepartment, MockClearance>>([
    [e(18), { manager: pending(), it: pending(), admin: pending(), finance: pending() }],
    [e(43), {
      manager: cleared(name(30), ago(47), "Accounts handed over to Nisha Thakur."),
      it: cleared(name(42), ago(45, "18:30"), "Laptop returned; SSO, email and VPN revoked."),
      admin: cleared(name(37), ago(45, "17:00"), "ID card surrendered."),
      finance: cleared(name(3), ago(40), "F&F approved; no dues."),
    }],
  ]);
  const lcExitInterviews = new Map<string, ExitInterview>([
    [e(18), { primaryReason: "relocation", ratings: { role: 4, manager: 5, growth: 3, compensation: 3, culture: 4, workLife: 4 }, wouldRejoin: "yes", wouldRecommend: true, comments: "Great team and manager. Would like clearer growth paths for senior engineers and a Bengaluru presence.", conductedBy: name(5), conductedAt: ago(5, "15:00") }],
    [e(43), { primaryReason: "career_change", ratings: { role: 3, manager: 4, growth: 2, compensation: 3, culture: 4, workLife: 3 }, wouldRejoin: "maybe", wouldRecommend: true, comments: "Limited path from account management into product roles.", conductedBy: name(5), conductedAt: ago(47, "16:00") }],
  ]);

  /* Assets ----------------------------------------------------------------- */
  type Spec = [tag: string, category: AssetCategory, make: string, model: string, costRupees: number, boughtDaysAgo: number, holder: number | null, status: AssetStatus, condition: AssetCondition, assignedDaysAgo: number, acknowledged: boolean, notes?: string];
  const specs: Spec[] = [
    ["LAP-0101", "laptop", "Apple", "MacBook Pro 14 (M3, 18 GB)", 199_900, 560, 7, "assigned", "good", 555, true],
    ["LAP-0102", "laptop", "Apple", "MacBook Pro 14 (M3, 18 GB)", 199_900, 560, 6, "assigned", "good", 555, true],
    ["LAP-0103", "laptop", "Apple", "MacBook Air 13 (M2, 16 GB)", 114_900, 740, 9, "assigned", "good", 735, true],
    ["LAP-0104", "laptop", "Apple", "MacBook Pro 14 (M3, 18 GB)", 199_900, 540, 10, "assigned", "good", 535, true],
    ["LAP-0105", "laptop", "Apple", "MacBook Air 13 (M2, 16 GB)", 114_900, 620, 12, "assigned", "fair", 600, true],
    ["LAP-0106", "laptop", "Dell", "Latitude 5440", 84_500, 480, 14, "assigned", "good", 470, true],
    ["LAP-0107", "laptop", "Lenovo", "ThinkPad E14 Gen 5", 72_000, 400, 15, "assigned", "good", 395, true],
    ["LAP-0108", "laptop", "Lenovo", "ThinkPad E14 Gen 5", 72_000, 400, 16, "assigned", "good", 395, true],
    ["LAP-0109", "laptop", "Dell", "Latitude 5440", 84_500, 480, 17, "assigned", "good", 470, true],
    ["LAP-0110", "laptop", "Apple", "MacBook Air 13 (M2, 16 GB)", 114_900, 720, 18, "assigned", "good", 715, true],
    ["LAP-0111", "laptop", "HP", "EliteBook 840 G10", 96_000, 380, 19, "assigned", "good", 375, true],
    ["LAP-0112", "laptop", "Dell", "Latitude 5440", 84_500, 480, 5, "assigned", "good", 470, true],
    ["LAP-0113", "laptop", "Lenovo", "ThinkPad E14 Gen 5", 72_000, 400, 4, "assigned", "good", 395, true],
    ["LAP-0114", "laptop", "HP", "EliteBook 840 G10", 96_000, 380, 3, "assigned", "good", 375, true],
    ["LAP-0115", "laptop", "Apple", "MacBook Pro 14 (M3, 18 GB)", 199_900, 560, 13, "assigned", "good", 555, true],
    ["LAP-0121", "laptop", "Dell", "Precision 3581", 142_000, 900, 40, "assigned", "good", 890, true, "Data workloads build."],
    ["LAP-0116", "laptop", "Lenovo", "ThinkPad E14 Gen 5", 72_000, 820, null, "in_stock", "good", 0, false, "Returned by Ritika Sood; reimaged."],
    ["LAP-0117", "laptop", "Dell", "Latitude 5440", 84_500, 20, null, "in_stock", "new", 0, false],
    ["LAP-0118", "laptop", "HP", "EliteBook 840 G10", 96_000, 380, null, "in_repair", "damaged", 0, false, "Keyboard replacement with HP service centre."],
    ["LAP-0119", "laptop", "Dell", "Latitude 5420", 78_000, 1_900, null, "retired", "damaged", 0, false, "Battery swollen; e-waste certificate on file."],
    ["MON-0201", "monitor", "Dell", "P2723QE 27\" 4K", 48_500, 200, 7, "assigned", "new", 3, false],
    ["MON-0202", "monitor", "LG", "27UL500 27\" 4K", 26_000, 420, 14, "assigned", "good", 410, true],
    ["MON-0203", "monitor", "Dell", "P2723QE 27\" 4K", 48_500, 300, 17, "assigned", "good", 290, true],
    ["MON-0204", "monitor", "LG", "27UL500 27\" 4K", 26_000, 420, null, "in_stock", "good", 0, false],
    ["MON-0205", "monitor", "Dell", "P2422H 24\"", 17_500, 900, null, "in_repair", "damaged", 0, false, "Dead pixels; under warranty claim."],
    ["PHN-0301", "phone", "Apple", "iPhone 15 (128 GB)", 79_900, 330, 30, "assigned", "good", 325, true],
    ["PHN-0302", "phone", "Samsung", "Galaxy S23 FE", 59_999, 450, 13, "assigned", "good", 445, true],
    ["PHN-0303", "phone", "Google", "Pixel 8a", 52_999, 150, 42, "assigned", "good", 145, true, "On-call support phone."],
    ["PHN-0304", "phone", "Google", "Pixel 8a", 52_999, 150, null, "in_stock", "new", 0, false],
    ["PHN-0305", "phone", "Samsung", "Galaxy M32", 16_999, 1_500, null, "retired", "damaged", 0, false, "Cracked display; retired."],
    ["IDC-0401", "id_card", "HID", "iCLASS SE access card", 500, 1_660, 7, "assigned", "good", 1_655, true],
    ["IDC-0402", "id_card", "HID", "iCLASS SE access card", 500, 1_470, 18, "assigned", "good", 1_465, true],
    ["IDC-0403", "id_card", "HID", "iCLASS SE access card", 500, 2_310, 5, "assigned", "good", 2_300, true],
    ["IDC-0404", "id_card", "HID", "iCLASS SE access card", 500, 1_320, 36, "assigned", "good", 1_315, true],
    ["IDC-0405", "id_card", "HID", "iCLASS SE access card", 500, 870, 37, "assigned", "good", 865, true],
    ["IDC-0406", "id_card", "HID", "iCLASS SE access card", 500, 20, 34, "assigned", "new", 14, false],
    ["IDC-0407", "id_card", "HID", "iCLASS SE access card", 500, 20, null, "in_stock", "new", 0, false],
    ["IDC-0408", "id_card", "HID", "iCLASS SE access card", 500, 20, null, "in_stock", "new", 0, false],
    ["SIM-0501", "sim", "Airtel", "Corporate postpaid SIM", 0, 700, 18, "assigned", "good", 690, true, "Number ported on exit if requested."],
    ["SIM-0502", "sim", "Airtel", "Corporate postpaid SIM", 0, 330, 30, "assigned", "good", 325, true],
    ["SIM-0503", "sim", "Jio", "Corporate postpaid SIM", 0, 60, null, "in_stock", "new", 0, false],
    ["OTH-0601", "other", "Wacom", "Intuos Pro Medium", 32_000, 600, 12, "assigned", "good", 590, true],
    ["OTH-0602", "other", "Sony", "ZV-E10 camera kit", 62_000, 280, null, "in_stock", "good", 0, false, "Shared shoot kit — book via Admin."],
    ["OTH-0603", "other", "Jabra", "Evolve2 65 headset", 21_000, 90, null, "in_stock", "new", 0, false],
  ];
  const serial = (tag: string) => `${tag.slice(0, 1)}${tag.replace(/\D/g, "")}X${String(7_391 + Number(tag.replace(/\D/g, "")) * 37).slice(-5)}`;
  const lcAssets: MockAsset[] = specs.map(([tag, category, make, model, cost, bought, holder, status, condition, assignedDaysAgo, acknowledged, notes = ""], index) => {
    const id = `as_${String(index + 1).padStart(3, "0")}`;
    const purchasedOn = addDays(today, -bought);
    const history: MockAsset["history"] = [{ id: `lce_a${index}_0`, at: ago(bought), actor: "Admin team", event: "Added to inventory", note: `Purchased ${purchasedOn}`, employeeId: null, kind: "added" }];
    if (tag === "LAP-0116")
      history.push(
        { id: `lce_a${index}_1`, at: ago(1_290), actor: "Admin team", event: `Assigned to ${name(43)}`, note: null, employeeId: e(43), kind: "assigned" },
        { id: `lce_a${index}_2`, at: ago(46, "17:40"), actor: name(42), event: `Returned by ${name(43)}`, note: "Good condition; reimaged.", employeeId: e(43), kind: "returned" },
      );
    if (holder) {
      history.push({ id: `lce_a${index}_3`, at: ago(assignedDaysAgo), actor: name(42), event: `Assigned to ${name(holder)}`, note: null, employeeId: e(holder), kind: "assigned" });
      if (acknowledged) history.push({ id: `lce_a${index}_4`, at: ago(Math.max(assignedDaysAgo - 1, 0), "11:00"), actor: name(holder), event: "Receipt acknowledged", note: null, employeeId: e(holder), kind: "acknowledged" });
    }
    if (status === "in_repair" || status === "retired")
      history.push({ id: `lce_a${index}_5`, at: ago(9), actor: "Admin team", event: status === "retired" ? "Retired" : "Sent for repair", note: notes || null, employeeId: null, kind: "status" });
    return {
      id, tag, category, make, model, serial: serial(tag), purchasedOn, costPaise: cost * 100, condition, status,
      assigneeId: holder ? e(holder) : null, assignedAt: holder ? ago(assignedDaysAgo) : null,
      acknowledgedAt: holder && acknowledged ? ago(Math.max(assignedDaysAgo - 1, 0), "11:00") : null,
      notes, history, version: 1,
    };
  });
  const lcAssetRequests: MockAssetRequest[] = [
    { id: "ar_1", reference: `AR-${yy}0071`, employeeId: e(34), category: "laptop", reason: "Joining laptop for client onboarding and CRM work.", state: "pending", requestedAt: ago(2, "12:00"), decidedAt: null, assetId: null, note: null },
    { id: "ar_2", reference: `AR-${yy}0073`, employeeId: e(12), category: "monitor", reason: "Second screen for brand layouts and colour proofing.", state: "pending", requestedAt: ago(1, "16:30"), decidedAt: null, assetId: null, note: null },
    { id: "ar_3", reference: `AR-${yy}0066`, employeeId: e(7), category: "monitor", reason: "External monitor for prototyping sessions at Noida HQ.", state: "fulfilled", requestedAt: ago(6), decidedAt: ago(3), assetId: lcAssets.find((asset) => asset.tag === "MON-0201")?.id ?? null, note: "Assigned MON-0201." },
  ];

  /* Settlements ------------------------------------------------------------ */
  const neha = person(18);
  const ritika = person(43);
  const assetRecovery = (holder: string, asOf: string) =>
    lcAssets.filter((asset) => asset.assigneeId === holder && asset.status === "assigned").map((asset) => ({ tag: asset.tag, label: `${asset.make} ${asset.model}`, paise: bookValuePaise(asset.category, asset.costPaise, asset.purchasedOn, asOf) }));
  const toLines = (prefix: string, lines: ReturnType<typeof computeSettlement>): MockSettlementLine[] => lines.map((line, index) => ({ id: `${prefix}_l${index}`, ...line, manual: false, reason: null }));
  const lcSettlements: MockSettlement[] = [];
  if (neha) {
    const bonus: MockSettlementLine = { id: "st_1_m1", code: "BONUS", kind: "earning", label: "Spot award — Q2 platform release", detail: "Manual adjustment", paise: 1_500_000, manual: true, reason: "Approved by Engineering Manager for the Q2 release (mail dated last month)." };
    const auto = computeSettlement({ employee: neha, lastWorkingDay: nehaLwd, elHalves: 36, noticeShortfallDays: 4, noticeWaived: false, reimbursements: [], loans: [], assets: assetRecovery(neha.id, nehaLwd), manual: [{ kind: bonus.kind, paise: bonus.paise }] });
    lcSettlements.push({
      id: "st_1", reference: `FNF-${yy}0018`, employeeId: neha.id, lastWorkingDay: nehaLwd, noticeDays: 60, noticeShortfallDays: 4, noticeWaived: false, waiverReason: null,
      lines: [...toLines("st_1", auto), bonus], state: "submitted", preparedById: e(4), preparedAt: ago(2, "15:30"), submittedAt: ago(2, "17:05"),
      approvedById: null, approvedAt: null, rejectionNote: null, paidAt: null, paidOn: null, utr: null, updatedAt: ago(2, "17:05"), version: 3, calculateOnLoad: true,
      audit: [ev(ago(2, "15:30"), name(4), "Prepared from last working day", `Last working day ${nehaLwd}`), ev(ago(2, "16:10"), name(4), "Manual line added", "Spot award — Q2 platform release"), ev(ago(2, "17:05"), name(4), "Submitted for approval")],
    });
  }
  if (ritika) {
    const auto = computeSettlement({ employee: ritika, lastWorkingDay: ritikaLwd, elHalves: 18, noticeShortfallDays: 0, noticeWaived: false, reimbursements: [{ reference: `EX-${yy}2987`, title: "Client visit travel — Gurugram", paise: 364_000 }], loans: [], assets: [], manual: [] });
    lcSettlements.push({
      id: "st_2", reference: `FNF-${yy}0011`, employeeId: ritika.id, lastWorkingDay: ritikaLwd, noticeDays: 60, noticeShortfallDays: 0, noticeWaived: false, waiverReason: null,
      lines: toLines("st_2", auto), state: "paid", preparedById: e(4), preparedAt: ago(43), submittedAt: ago(43, "16:00"), approvedById: e(3), approvedAt: ago(41, "11:30"),
      rejectionNote: null, paidAt: ago(38, "14:10"), paidOn: addDays(today, -38), utr: "HDFCN52026091388", updatedAt: ago(38, "14:10"), version: 5,
      audit: [ev(ago(43), name(4), "Prepared from last working day"), ev(ago(43, "16:00"), name(4), "Submitted for approval"), ev(ago(41, "11:30"), name(3), "Approved"), ev(ago(38, "14:10"), name(3), "Marked paid", "UTR HDFCN52026091388")],
    });
  }

  /* Letters ---------------------------------------------------------------- */
  const lcLetterTemplates: MockLetterTemplate[] = LETTER_TEMPLATES.map((template, index) => ({ ...template, updatedAt: ago(200 - index * 20), updatedBy: name(5), version: 1 + (index % 2) }));
  const lcIssuedLetters: MockIssuedLetter[] = [];
  if (ritika) {
    const stamp = addDays(ritikaLwd, 1);
    const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    lcIssuedLetters.push(
      { id: "il_1", reference: `LTR-${yy}0290`, employeeId: ritika.id, kind: "relieving", title: "Relieving letter", subject: "Relieving letter", templateId: "tpl_relieving", templateName: "Relieving letter", issuedAt: ago(44, "12:00"), issuedBy: name(5),
        body: `Date: ${fmt(stamp)}\nRef: LTR-${yy}0290\n\nDear ${ritika.name},\n\nThis is with reference to your resignation. We confirm that you have been relieved from the services of GTF Technologies (sample entity) at the close of business hours on ${fmt(ritikaLwd)}.\n\nYour full and final settlement has been processed as per company policy, and you have completed all clearance formalities, including the return of company assets.\n\nWe thank you for your contributions during your association with GTF Technologies as ${ritika.designation} and wish you the very best.\n\nFor GTF Technologies (sample entity)\n\nMeera Kapoor\nHR Business Partner` },
      { id: "il_2", reference: `LTR-${yy}0291`, employeeId: ritika.id, kind: "experience", title: "Experience letter", subject: "Experience certificate", templateId: "tpl_experience", templateName: "Experience letter", issuedAt: ago(44, "12:05"), issuedBy: name(5),
        body: `Date: ${fmt(stamp)}\nRef: LTR-${yy}0291\n\nTO WHOMSOEVER IT MAY CONCERN\n\nThis is to certify that ${ritika.name} (Employee code ${ritika.code}) was employed with GTF Technologies (sample entity) from ${fmt(ritika.joinedOn)} to ${fmt(ritikaLwd)}.\n\nAt the time of leaving, Ritika held the position of ${ritika.designation} in the ${ritika.department} department.\n\nDuring this tenure we found Ritika sincere, hardworking and professional. We wish Ritika every success in future endeavours.\n\nFor GTF Technologies (sample entity)\n\nMeera Kapoor\nHR Business Partner` },
    );
  }

  /* Policies --------------------------------------------------------------- */
  const pendingInfosec = new Set([7, 8, 11, 12, 19, 23, 28, 29, 34, 39].map(e));
  const active = employees.filter((item) => item.status !== "exited");
  const infosecAcks: Record<string, string> = {};
  active.forEach((item, index) => {
    if (!pendingInfosec.has(item.id)) infosecAcks[item.id] = ago(index % 6, `${String(9 + (index % 8)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`);
  });
  const poshAcks: Record<string, string> = {};
  active.forEach((item, index) => {
    poshAcks[item.id] = item.joinedOn > addDays(today, -120) ? ago(Math.max(0, diffDays(item.joinedOn, today) - 1), "10:00") : ago(118 - (index % 10), "11:30");
  });
  const lcPolicies: MockPolicy[] = [
    {
      id: "pol_1", title: "Information security & acceptable use policy", version: "v2.0", audience: "Everyone", publishedAt: ago(6, "10:00"), publishedBy: name(5), dueOn: addDays(today, 8),
      summary: "Updated rules for passwords and MFA, client data on personal devices, AI tools, and reporting security incidents within 24 hours.",
      body: `1. Purpose\nThis policy protects GTF and client information and the systems that process it.\n\n2. Accounts and passwords\nUse the company SSO with multi-factor authentication. Never share credentials. Passwords must be at least 12 characters.\n\n3. Client data\nClient files stay in approved workspaces (Google Drive, Figma, Jira). Do not store client data on personal devices or personal cloud accounts.\n\n4. Generative AI tools\nDo not paste client confidential information into public AI tools. Use only tools approved by IT.\n\n5. Devices\nKeep company laptops encrypted, updated and locked when unattended. Report loss or theft to IT within 2 hours.\n\n6. Incidents\nReport suspected phishing, malware or data leaks to security@gtf-hr.example within 24 hours.\n\n7. Consequences\nViolations may lead to disciplinary action as per the code of conduct.`,
      acks: infosecAcks, reminders: [{ at: ago(2, "10:00"), by: name(5), count: 14 }],
    },
    {
      id: "pol_2", title: "Prevention of sexual harassment (POSH) policy", version: "v2026.1", audience: "Everyone", publishedAt: ago(125, "10:00"), publishedBy: name(5), dueOn: addDays(today, -110),
      summary: "Internal Committee members, how to raise a complaint, timelines and protection against retaliation.",
      body: `GTF Technologies is committed to a workplace free of sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.\n\nInternal Committee: presiding officer, two employee members and one external member. Complaints may be raised in writing within three months of the incident.\n\nThe committee completes its inquiry within 90 days. Confidentiality is maintained throughout, and retaliation of any kind is prohibited.`,
      acks: poshAcks, reminders: [],
    },
  ];

  return { lcResignations, lcClearances, lcExitInterviews, lcAssets, lcAssetRequests, lcSettlements, lcLetterTemplates, lcIssuedLetters, lcPolicies };
}
