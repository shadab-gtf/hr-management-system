import "server-only";
import { addMonths, lastDayOfMonth, zonedInstant } from "@/lib/utils/date";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { seeded, seededInt } from "@/lib/mocks/seed/random";

/*
 * Synthetic statutory payroll: legal entities, PT/LWF slabs, statutory ids,
 * challans, salary structures and payroll inputs. Relative to the business
 * date. Registration numbers are FORMAT-VALID FAKES, not real registrations.
 */

export type StateCode = "UP" | "HR" | "MH" | "KA" | "WB" | "DL";

export const statStates: Record<StateCode, string> = {
  UP: "Uttar Pradesh",
  HR: "Haryana",
  MH: "Maharashtra",
  KA: "Karnataka",
  WB: "West Bengal",
  DL: "Delhi",
};
export const stateCodes = Object.keys(statStates) as StateCode[];

export interface MockEntity {
  id: string;
  name: string;
  address: string;
  pan: string;
  tan: string;
  epfCode: string;
  esicCode: string;
  /** Salary debit account used on bank advice (synthetic). */
  debitAccount: string;
  debitBank: string;
  ptRegistrations: Partial<Record<StateCode, string>>;
  lwfRegistrations: Partial<Record<StateCode, string>>;
}

export interface MockStatProfile {
  employeeId: string;
  uan: string | null;
  pfMemberSerial: string;
  esiIp: string | null;
  pan: string | null;
  pfOptOut: boolean;
  vpfPercent: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  bankStatus: "verified" | "pending" | "failed";
  bankChangedAt: string | null;
  /** Remote employees: PT/LWF state of their registered address. */
  registeredState: StateCode | null;
}

export interface PtSlab {
  fromPaise: number;
  /** Inclusive upper bound; null = no upper bound. */
  toPaise: number | null;
  monthlyPaise: number;
  februaryPaise: number;
}

export type DueRule = { kind: "next_month_day"; day: number } | { kind: "same_month_end" } | { kind: "none" };

export interface LwfRule {
  /** Months (1–12) in which LWF is deducted; empty = every month. */
  months: number[];
  employeeFixedPaise: number | null;
  employeeRateBp: number | null;
  employeeCapPaise: number | null;
  employerFixedPaise: number | null;
  employerMultiplier: number | null;
  due: DueRule;
}

export interface MockStatSettings {
  pfWageBasis: "ceiling" | "actual";
  pfCeilingPaise: number;
  esiCeilingPaise: number;
  ptSlabs: Record<StateCode, PtSlab[]>;
  ptDue: Record<StateCode, DueRule>;
  lwf: Partial<Record<StateCode, LwfRule>>;
  version: number;
}

export type ChallanType = "epf" | "esi" | "pt" | "lwf" | "tds";

export interface MockChallan {
  id: string;
  reference: string;
  type: ChallanType;
  entityId: string;
  state: StateCode | null;
  /** Wage month the challan pays for (for LWF: the deduction month). */
  period: string;
  amountPaise: number;
  paidOn: string;
  challanNo: string;
  bsrCode: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface MockStructureTemplate {
  id: string;
  name: string;
  description: string;
  version: number;
  publishedAt: string;
  publishedBy: string;
  basicPctOfCtc: number;
  hraPctOfBasic: number;
  conveyancePaise: number;
  ltaPaise: number;
  pf: boolean;
  gratuity: boolean;
  esi: boolean;
  stipend: boolean;
}

export type StructureTerms = Pick<MockStructureTemplate, "name" | "basicPctOfCtc" | "hraPctOfBasic" | "conveyancePaise" | "ltaPaise" | "pf" | "gratuity">;

export interface MockStructureChange {
  id: string;
  reference: string;
  kind: "template" | "assignment";
  templateId: string;
  /** Template edits. */
  terms: StructureTerms | null;
  /** Assignment edits: group key such as `grade:L3` or `type:contract`. */
  groupKey: string | null;
  reason: string;
  preparedBy: string;
  preparedAt: string;
  state: "pending" | "approved" | "rejected" | "withdrawn";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export type PayrollInputKind = "bonus" | "incentive" | "arrears" | "other_deduction" | "lop_override";

export interface MockPayrollInput {
  id: string;
  month: string;
  employeeId: string;
  kind: PayrollInputKind;
  amountPaise: number;
  /** LOP override in half days. */
  lopHalves: number;
  arrearsFrom: string | null;
  arrearsMonths: number;
  note: string;
  addedBy: string;
  addedAt: string;
}

export interface MockPayrollHold {
  id: string;
  month: string;
  employeeId: string;
  reason: string;
  heldBy: string;
  heldAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseNote: string | null;
}

export interface MockBankExport {
  runId: string;
  at: string;
  by: string;
  count: number;
  amountPaise: number;
}

export interface StatutoryState {
  statEntities: MockEntity[];
  /** Work location → entity + state. Remote resolves to the employee's registered state. */
  statLocations: Record<string, { entityId: string; state: StateCode | null }>;
  statProfiles: Map<string, MockStatProfile>;
  statSettings: MockStatSettings;
  statChallans: MockChallan[];
  /** Challan amounts come from the engine, so history is filled on first read. */
  statChallansSeeded: boolean;
  statTemplates: MockStructureTemplate[];
  statAssignments: Record<string, string>;
  statStructureChanges: MockStructureChange[];
  payrollInputs: MockPayrollInput[];
  payrollHolds: MockPayrollHold[];
  statBankExports: MockBankExport[];
  /** Frozen per-employee results for approved/closed months (key `employeeId|month`). */
  statSnapshots: Map<string, unknown>;
  statForm16: Map<number, { generatedAt: string; generatedBy: string }>;
  statAudit: { at: string; actor: string; event: string }[];
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;

export const statEntitiesSeed: MockEntity[] = [
  {
    id: "ent_tech",
    name: "GTF Technologies Private Limited",
    address: "Plot 14, Sector 62, Noida, Uttar Pradesh 201309",
    pan: "AAHCG4521K",
    tan: "MRTG04521E",
    epfCode: "UPNOI0045217000",
    esicCode: "69001234560001001",
    debitAccount: "50200045217001",
    debitBank: "HDFC Bank · Sector 18 Noida",
    ptRegistrations: { MH: "27891234567P", KA: "PT-KA-1450029871", WB: "PT-WB-191000456712" },
    lwfRegistrations: { HR: "HR-LWF-GGN-20451", MH: "MH-LWF-PUN-30417", KA: "KA-LWF-BLR-66102", WB: "WB-LWF-KOL-12088", DL: "DL-LWF-ND-40771" },
  },
  {
    id: "ent_studio",
    name: "GTF Creative Studio Private Limited",
    address: "4th Floor, Kamala Mills, Lower Parel, Mumbai, Maharashtra 400013",
    pan: "AAJCG7788M",
    tan: "MUMG07788D",
    epfCode: "MHBAN0078812000",
    esicCode: "34001234560000999",
    debitAccount: "917020078812004",
    debitBank: "Axis Bank · Lower Parel",
    ptRegistrations: { MH: "27551234567P" },
    lwfRegistrations: { MH: "MH-LWF-MUM-88120" },
  },
];

const remoteStates: Record<string, StateCode> = {
  [e(8)]: "KA",
  [e(10)]: "UP",
  [e(15)]: "KA",
  [e(18)]: "WB",
  [e(23)]: "DL",
  [e(28)]: "MH",
};

const banks = [
  { name: "HDFC Bank", ifsc: "HDFC000", len: 14 },
  { name: "ICICI Bank", ifsc: "ICIC000", len: 12 },
  { name: "State Bank of India", ifsc: "SBIN000", len: 11 },
  { name: "Axis Bank", ifsc: "UTIB000", len: 15 },
  { name: "Kotak Mahindra Bank", ifsc: "KKBK000", len: 10 },
] as const;

const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function digits(count: number, ...parts: (string | number)[]) {
  return Array.from({ length: count }, (_, index) => String(seededInt(0, 9, ...parts, index))).join("");
}

function profileFor(employee: SeedEmployee, today: string, ago: (days: number, time?: string) => string): MockStatProfile {
  const n = Number(employee.id.slice(-4));
  const bank = banks[n % banks.length] ?? banks[0];
  const surname = employee.name.split(" ").at(-1) ?? "X";
  const pick = (index: number) => letters[seededInt(0, letters.length - 1, employee.id, "pan", index)] ?? "A";
  const pan = `${pick(1)}${pick(2)}${pick(3)}P${surname[0]?.toUpperCase() ?? "X"}${digits(4, employee.id, "pan")}${pick(4)}`;
  const intern = employee.type === "intern";
  const newJoiner = employee.joinedOn > addMonths(today.slice(0, 7), -1);
  const pending = employee.id === e(34) || employee.id === e(22);
  return {
    employeeId: employee.id,
    uan: intern || employee.id === e(34) ? null : `10${digits(10, employee.id, "uan")}`,
    pfMemberSerial: String(n).padStart(7, "0"),
    esiIp: null,
    pan: employee.id === e(34) ? null : pan,
    pfOptOut: employee.id === e(1),
    vpfPercent: employee.id === e(13) ? 4 : employee.id === e(25) ? 8 : 0,
    bankName: bank.name,
    accountNumber: `${seededInt(1, 9, employee.id, "acct")}${digits(bank.len - 1, employee.id, "acct")}`,
    ifsc: `${bank.ifsc}${digits(4, employee.id, "ifsc")}`,
    bankStatus: pending ? "pending" : "verified",
    bankChangedAt: employee.id === e(22) ? ago(5, "12:40") : newJoiner ? ago(Math.max(1, Math.round(seeded(employee.id) * 10)), "10:00") : null,
    registeredState: employee.location === "Remote" ? remoteStates[employee.id] ?? "UP" : null,
  };
}

/** Slab bounds and amounts in whole rupees. */
const slab = (from: number, to: number | null, monthly: number, february = monthly): PtSlab => ({
  fromPaise: from * 100,
  toPaise: to === null ? null : to * 100,
  monthlyPaise: monthly * 100,
  februaryPaise: february * 100,
});

function defaultSettings(): MockStatSettings {
  return {
    pfWageBasis: "ceiling",
    pfCeilingPaise: 1_500_000,
    esiCeilingPaise: 2_100_000,
    ptSlabs: {
      UP: [],
      HR: [],
      DL: [],
      // Maharashtra (male/general schedule): ₹200 a month, ₹300 in February.
      MH: [slab(0, 7_500, 0), slab(7_501, 10_000, 175), slab(10_001, null, 200, 300)],
      KA: [slab(0, 24_999, 0), slab(25_000, null, 200, 300)],
      WB: [slab(0, 10_000, 0), slab(10_001, 15_000, 110), slab(15_001, 25_000, 130), slab(25_001, 40_000, 150), slab(40_001, null, 200)],
    },
    ptDue: {
      UP: { kind: "none" },
      HR: { kind: "none" },
      DL: { kind: "none" },
      MH: { kind: "same_month_end" },
      KA: { kind: "next_month_day", day: 20 },
      WB: { kind: "next_month_day", day: 21 },
    },
    lwf: {
      MH: { months: [6, 12], employeeFixedPaise: 2_500, employeeRateBp: null, employeeCapPaise: null, employerFixedPaise: 7_500, employerMultiplier: null, due: { kind: "next_month_day", day: 15 } },
      HR: { months: [], employeeFixedPaise: null, employeeRateBp: 20, employeeCapPaise: 3_400, employerFixedPaise: null, employerMultiplier: 2, due: { kind: "next_month_day", day: 15 } },
      KA: { months: [12], employeeFixedPaise: 5_000, employeeRateBp: null, employeeCapPaise: null, employerFixedPaise: 10_000, employerMultiplier: null, due: { kind: "next_month_day", day: 15 } },
      WB: { months: [6, 12], employeeFixedPaise: 300, employeeRateBp: null, employeeCapPaise: null, employerFixedPaise: 1_500, employerMultiplier: null, due: { kind: "next_month_day", day: 15 } },
      DL: { months: [6, 12], employeeFixedPaise: 75, employeeRateBp: null, employeeCapPaise: null, employerFixedPaise: 225, employerMultiplier: null, due: { kind: "next_month_day", day: 15 } },
    },
    version: 1,
  };
}

export function createStatutoryState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): StatutoryState {
  const month = today.slice(0, 7);
  const yearStart = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const published = zonedInstant(`${yearStart}-04-01`, "10:00");
  const template = (
    id: string,
    name: string,
    description: string,
    terms: Omit<MockStructureTemplate, "id" | "name" | "description" | "version" | "publishedAt" | "publishedBy">,
  ): MockStructureTemplate => ({ id, name, description, version: 3, publishedAt: published, publishedBy: e(3), ...terms });

  const input = (
    n: number,
    employee: number,
    kind: MockPayrollInput["kind"],
    rupees: number,
    note: string,
    extra: Partial<MockPayrollInput> = {},
  ): MockPayrollInput => ({
    id: `pin_${n}`,
    month,
    employeeId: e(employee),
    kind,
    amountPaise: rupees * 100,
    lopHalves: 0,
    arrearsFrom: null,
    arrearsMonths: 0,
    note,
    addedBy: e(4),
    addedAt: ago(2, `1${n}:05`),
    ...extra,
  });

  const form16 = new Map<number, { generatedAt: string; generatedBy: string }>();
  const issueDate = `${yearStart}-06-12`;
  if (issueDate <= today) form16.set(yearStart - 1, { generatedAt: zonedInstant(issueDate, "11:00"), generatedBy: e(4) });

  return {
    statEntities: statEntitiesSeed.map((entity) => ({ ...entity, ptRegistrations: { ...entity.ptRegistrations }, lwfRegistrations: { ...entity.lwfRegistrations } })),
    statLocations: {
      "Noida HQ": { entityId: "ent_tech", state: "UP" },
      Gurugram: { entityId: "ent_tech", state: "HR" },
      Mumbai: { entityId: "ent_studio", state: "MH" },
      Remote: { entityId: "ent_tech", state: null },
    },
    statProfiles: new Map(employees.map((employee) => [employee.id, profileFor(employee, today, ago)])),
    statSettings: defaultSettings(),
    statChallans: [],
    statChallansSeeded: false,
    statTemplates: [
      template("tpl_std", "Standard (L1–L3)", "Associates to senior specialists. Basic 40% of CTC.", { basicPctOfCtc: 40, hraPctOfBasic: 50, conveyancePaise: 160_000, ltaPaise: 200_000, pf: true, gratuity: true, esi: true, stipend: false }),
      template("tpl_senior", "Senior & leadership (L4–L5)", "Leads, managers and leadership. Basic 50% of CTC.", { basicPctOfCtc: 50, hraPctOfBasic: 40, conveyancePaise: 160_000, ltaPaise: 500_000, pf: true, gratuity: true, esi: true, stipend: false }),
      template("tpl_contract", "Fixed-term contract", "Fixed-term contracts on payroll. No gratuity provision.", { basicPctOfCtc: 50, hraPctOfBasic: 40, conveyancePaise: 0, ltaPaise: 0, pf: true, gratuity: false, esi: true, stipend: false }),
      template("tpl_intern", "Intern stipend", "Stipend only. Not wages for EPF/ESI.", { basicPctOfCtc: 100, hraPctOfBasic: 0, conveyancePaise: 0, ltaPaise: 0, pf: false, gratuity: false, esi: false, stipend: true }),
    ],
    statAssignments: {
      "type:intern": "tpl_intern",
      "type:contract": "tpl_contract",
      "grade:L1": "tpl_std",
      "grade:L2": "tpl_std",
      "grade:L3": "tpl_std",
      "grade:L4": "tpl_senior",
      "grade:L5": "tpl_senior",
    },
    statStructureChanges: [
      {
        id: "sc_1",
        reference: `SC-${today.slice(2, 4)}0412`,
        kind: "template",
        templateId: "tpl_std",
        terms: { name: "Standard (L1–L3)", basicPctOfCtc: 40, hraPctOfBasic: 50, conveyancePaise: 160_000, ltaPaise: 250_000, pf: true, gratuity: true },
        groupKey: null,
        reason: "Align LTA with the revised travel policy from next month.",
        preparedBy: e(4),
        preparedAt: ago(1, "16:10"),
        state: "pending",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      },
    ],
    payrollInputs: [
      input(1, 18, "lop_override", 0, "2 days unpaid leave in period (approved LOP)", { lopHalves: 4 }),
      input(2, 21, "lop_override", 0, "1 day unpaid leave in period", { lopHalves: 2 }),
      input(3, 14, "arrears", 25_000, "Promotion arrears", { arrearsFrom: addMonths(month, -2), arrearsMonths: 2 }),
      input(4, 31, "incentive", 15_000, "Q2 client retention incentive"),
      input(5, 36, "bonus", 5_000, "Spot award — campus hiring drive"),
      input(6, 9, "other_deduction", 1_200, "ID card replacement recovery (employee consent on file)"),
    ],
    payrollHolds: [
      { id: "phd_1", month, employeeId: e(18), reason: "Serving notice — hold until knowledge-transfer sign-off from the engineering manager.", heldBy: e(4), heldAt: ago(1, "12:20"), releasedBy: null, releasedAt: null, releaseNote: null },
    ],
    statBankExports: [],
    statSnapshots: new Map(),
    statForm16: form16,
    statAudit: [
      { at: ago(40, "11:00"), actor: "Priya Iyer", event: `PT slabs reviewed for ${statStates.MH}, ${statStates.KA} and ${statStates.WB} (no change)` },
      { at: ago(3, "09:45"), actor: "Vikram Nair", event: `Statutory profiles synced for ${lastDayOfMonth(addMonths(month, -1))} close` },
    ],
  };
}
