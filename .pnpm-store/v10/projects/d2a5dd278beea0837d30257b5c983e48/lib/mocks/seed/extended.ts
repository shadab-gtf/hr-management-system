import "server-only";
import { addDays, zonedInstant } from "@/lib/utils/date";
import type { ReactionKind } from "@/types/engage";
import type { LetterType } from "@/types/requests";
import type { ProofState, TaxRegime } from "@/types/salary";
import type { Announcement, TicketState } from "@/types/workplace";

/* Synthetic records for the extended modules. Relative to the business date. */

export interface MockPost {
  id: string;
  kind: "post" | "anniversary" | "welcome" | "announcement" | "achievement";
  group: "General" | "Events" | "Wins" | "People & Culture" | "IT";
  authorId: string | null;
  subjectId: string | null;
  title: string | null;
  body: string;
  createdAt: string;
  reactions: Record<ReactionKind, string[]>;
  comments: { id: string; authorId: string; body: string; createdAt: string }[];
}
export interface MockLetter {
  id: string;
  reference: string;
  employeeId: string;
  type: LetterType;
  purpose: string;
  addressedTo: string;
  state: "pending" | "in_progress" | "issued" | "rejected";
  requestedAt: string;
  issuedAt: string | null;
}
export interface MockLoan {
  id: string;
  reference: string;
  employeeId: string;
  type: "salary_advance" | "personal_loan" | "laptop_loan" | "emergency";
  principalPaise: number;
  tenureMonths: number;
  paidInstallments: number;
  startMonth: string;
  state: "requested" | "approved" | "active" | "closed" | "rejected";
  requestedAt: string;
  reason: string;
}
export interface MockDeclaration {
  regime: TaxRegime;
  status: "draft" | "submitted" | "locked";
  submittedAt: string | null;
  items: Record<string, number>;
  proofs: Record<string, ProofState>;
  monthlyRentPaise: number;
  rentCity: "metro" | "non_metro";
}
export interface MockPermission {
  id: string;
  reference: string;
  employeeId: string;
  date: string;
  from: string;
  to: string;
  reason: string;
  state: "pending" | "approved" | "rejected";
  approverId: string | null;
  submittedAt: string;
  version: number;
}
export interface MockDelegation {
  id: string;
  delegatorId: string;
  delegateId: string;
  startsOn: string;
  endsOn: string;
  workflows: ("leave" | "regularization" | "expense")[];
  reason: string;
  revoked: boolean;
}
export interface MockAnnouncement extends Omit<Announcement, "status"> {
  authorId: string | null;
}
export interface MockTicketMessage {
  id: string;
  author: string;
  fromHr: boolean;
  body: string;
  at: string;
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;
const none = (): Record<ReactionKind, string[]> => ({ like: [], celebrate: [], support: [], insightful: [] });

export function createExtendedState(today: string) {
  const ago = (days: number, time = "10:15") => zonedInstant(addDays(today, -days), time);
  const yy = today.slice(2, 4);

  const posts: MockPost[] = [
    { id: "po_1", kind: "announcement", group: "People & Culture", authorId: null, subjectId: null, title: "Festive season working calendar", body: "The holiday list for October–November is published. Plan leave early — approvals follow the usual team coverage rules.", createdAt: ago(1), reactions: { ...none(), like: [e(9), e(14), e(21)], support: [e(35)] }, comments: [{ id: "pc_1", authorId: e(9), body: "Thanks for sharing this early!", createdAt: ago(1, "11:02") }] },
    { id: "po_2", kind: "welcome", group: "Events", authorId: null, subjectId: e(34), title: null, body: "Please welcome Aman Tiwari to Client Services! Aman joins our Gurugram team as an Account Executive.", createdAt: ago(2, "12:30"), reactions: { ...none(), celebrate: [e(30), e(31), e(7), e(5)] }, comments: [{ id: "pc_2", authorId: e(31), body: "Welcome aboard, Aman!", createdAt: ago(2, "13:10") }] },
    { id: "po_3", kind: "achievement", group: "Wins", authorId: e(20), subjectId: null, title: null, body: "Huge shout-out to the Performance Marketing team — our real-estate launch campaign crossed 3× the lead target this week. 🎉", createdAt: ago(3, "17:45"), reactions: { ...none(), celebrate: [e(2), e(21), e(22), e(23), e(24)], insightful: [e(25)] }, comments: [] },
    { id: "po_4", kind: "anniversary", group: "Events", authorId: null, subjectId: e(41), title: null, body: "Happy 4-year work anniversary, Bhavna! Thank you for everything you bring to Media Planning.", createdAt: ago(4, "09:00"), reactions: { ...none(), celebrate: [e(20), e(21)] }, comments: [] },
    { id: "po_5", kind: "post", group: "IT", authorId: e(42), subjectId: null, title: null, body: "Reminder: laptop OS update rolls out this Friday after 7 PM. Keep your device plugged in and on Wi-Fi.", createdAt: ago(4, "16:00"), reactions: { ...none(), like: [e(17), e(19)] }, comments: [{ id: "pc_3", authorId: e(19), body: "Will this affect VPN profiles?", createdAt: ago(4, "16:20") }, { id: "pc_4", authorId: e(42), body: "No — VPN settings are preserved.", createdAt: ago(4, "16:32") }] },
    { id: "po_6", kind: "post", group: "General", authorId: e(6), subjectId: null, title: null, body: "Design crit is moving to Thursdays at 4 PM starting next week. Bring work in progress — rough is welcome!", createdAt: ago(6, "10:40"), reactions: { ...none(), like: [e(7), e(9), e(10), e(12)] }, comments: [] },
  ];

  const letters: MockLetter[] = [
    { id: "lt_1", reference: `LTR-${yy}0311`, employeeId: e(7), type: "address_proof", purpose: "Bank account address update", addressedTo: "HDFC Bank", state: "issued", requestedAt: ago(40), issuedAt: ago(38) },
    { id: "lt_2", reference: `LTR-${yy}0342`, employeeId: e(7), type: "visa_letter", purpose: "Tourist visa application — Singapore", addressedTo: "Embassy of Singapore", state: "in_progress", requestedAt: ago(2), issuedAt: null },
  ];

  const loans: MockLoan[] = [
    { id: "ln_1", reference: `LN-${yy}0107`, employeeId: e(7), type: "laptop_loan", principalPaise: 9_000_000, tenureMonths: 12, paidInstallments: 7, startMonth: `${addDays(today, -210).slice(0, 7)}`, state: "active", requestedAt: ago(220), reason: "Personal laptop for design work" },
  ];

  const declarations = new Map<string, MockDeclaration>([
    [e(7), { regime: "old", status: "draft", submittedAt: null, items: { "80c_ppf": 5_000_000, "80c_elss": 3_000_000, "80d_self": 1_800_000 }, proofs: {}, monthlyRentPaise: 2_600_000, rentCity: "non_metro" }],
  ]);

  const permissions: MockPermission[] = [
    { id: "pm_1", reference: `PM-${yy}0120`, employeeId: e(35), date: addDays(today, 2), from: "15:00", to: "17:00", reason: "College placement cell meeting", state: "pending", approverId: e(5), submittedAt: ago(0, "09:20"), version: 1 },
  ];

  const delegations: MockDelegation[] = [
    { id: "dl_1", delegatorId: e(30), delegateId: e(5), startsOn: addDays(today, -3), endsOn: addDays(today, 10), workflows: ["leave", "regularization", "expense"], reason: "Client travel — Dubai", revoked: false },
  ];

  const announcements: MockAnnouncement[] = [
    { id: "an_1", title: "Festive season working calendar", body: "The holiday list for October–November is published. Plan leave early — approvals follow the usual team coverage rules.", category: "policy", publishedAt: ago(1), author: "People & Culture", authorId: e(5), audience: "Everyone", pinned: true },
    { id: "an_2", title: "Welcome Arjun and Aman!", body: "Arjun Rao joins Design as an intern and Aman Tiwari joins Client Services. Say hello on your next visit to Noida HQ.", category: "celebration", publishedAt: ago(3, "12:30"), author: "People & Culture", authorId: e(5), audience: "Everyone", pinned: false },
    { id: "an_3", title: "Laptop security update this Friday", body: "IT will push an OS update after 7 PM. Keep your laptop plugged in and connected to Wi-Fi.", category: "it", publishedAt: ago(4, "16:00"), author: "IT Support", authorId: e(42), audience: "Everyone", pinned: false },
    { id: "an_4", title: "Quarterly town hall — agenda", body: "Business update, client wins, and Q&A with leadership. Submit questions anonymously through the helpdesk.", category: "event", publishedAt: ago(8), author: "Office of the COO", authorId: e(2), audience: "Everyone", pinned: false },
  ];

  const ticketMessages = new Map<string, MockTicketMessage[]>([
    ["tk_1", [
      { id: "tm_1", author: "Aanya Sharma", fromHr: false, body: "My Figma seat shows as viewer since Monday. I can't edit the brand files.", at: ago(9) },
      { id: "tm_2", author: "Tushar Goel", fromHr: true, body: "Seat upgraded to editor. Please sign out and back in.", at: ago(8, "15:20") },
    ]],
    ["tk_2", [
      { id: "tm_3", author: "Aanya Sharma", fromHr: false, body: "When does the investment proof window open? I want to submit HRA proofs.", at: ago(3) },
      { id: "tm_4", author: "Payroll team", fromHr: true, body: "The window is open now. Please share the rent receipts for Apr–Sep as one PDF.", at: ago(1, "12:10") },
    ]],
  ]);

  const ticketStateOverrides = new Map<string, TicketState>();

  return {
    posts,
    starred: new Map<string, Set<string>>([[e(7), new Set([e(6), e(9)])]]),
    letters,
    loans,
    declarations,
    permissions,
    delegations,
    announcements,
    ticketMessages,
    ticketStateOverrides,
    onboarding: new Map<string, Record<string, boolean>>([
      [e(34), { docs: true, bank: false, it: true, induction: false, buddy: true, policy: false }],
      [e(8), { docs: true, bank: true, it: true, induction: true, buddy: false, policy: false }],
    ]),
  };
}

export type ExtendedState = ReturnType<typeof createExtendedState>;
