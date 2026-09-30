import type { IconName } from "@/components/ui/app-icon";
import type { Tone } from "@/types/common";
import type { AssetCategory, AssetCondition, AssetStatus, LetterKind, ResignationReason, ResignationState, SettlementState } from "@/types/lifecycle";

/* Display labels for the lifecycle module. Colour is never the only cue. */

export const resignationReasonLabels: Record<ResignationReason, string> = {
  better_opportunity: "Better opportunity",
  higher_studies: "Higher studies",
  relocation: "Relocation",
  personal: "Personal reasons",
  health: "Health",
  compensation: "Compensation",
  career_change: "Career change",
  work_environment: "Work environment",
  other: "Other",
};
export const resignationReasonOptions = (Object.keys(resignationReasonLabels) as ResignationReason[]).map((value) => ({ value, label: resignationReasonLabels[value] }));

export const resignationStatus: Record<ResignationState, { label: string; tone: Tone }> = {
  pending_manager: { label: "With manager", tone: "warning" },
  pending_hr: { label: "With HR", tone: "warning" },
  on_hold: { label: "On hold — discussion", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Not accepted", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const settlementStatus: Record<SettlementState, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Sent back", tone: "danger" },
  paid: { label: "Paid", tone: "success" },
};
export const settlementSteps = ["Prepared", "Submitted", "Approved", "Paid"];
export function settlementStep(state: SettlementState): number {
  return { draft: 0, rejected: 0, submitted: 1, approved: 2, paid: 4 }[state];
}

export const assetCategoryLabels: Record<AssetCategory, string> = {
  laptop: "Laptop",
  phone: "Phone",
  monitor: "Monitor",
  id_card: "ID card",
  sim: "SIM",
  other: "Other",
};
export const assetCategoryIcons: Record<AssetCategory, IconName> = {
  laptop: "monitor",
  phone: "phone",
  monitor: "monitor",
  id_card: "card",
  sim: "phone",
  other: "box",
};
export const assetCategoryOptions = (Object.keys(assetCategoryLabels) as AssetCategory[]).map((value) => ({ value, label: assetCategoryLabels[value] }));
export const assetStatus: Record<AssetStatus, { label: string; tone: Tone }> = {
  in_stock: { label: "In stock", tone: "success" },
  assigned: { label: "Assigned", tone: "info" },
  in_repair: { label: "In repair", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};
export const assetConditionLabels: Record<AssetCondition, string> = { new: "New", good: "Good", fair: "Fair", damaged: "Damaged" };
export const assetConditionOptions = (Object.keys(assetConditionLabels) as AssetCondition[]).map((value) => ({ value, label: assetConditionLabels[value] }));

export const letterKindLabels: Record<LetterKind, string> = {
  offer: "Offer",
  appointment: "Appointment",
  confirmation: "Confirmation",
  increment: "Increment",
  experience: "Experience",
  relieving: "Relieving",
  address_proof: "Address proof",
  employment_verification: "Employment verification",
  salary_certificate: "Salary certificate",
  visa_letter: "Visa / travel",
};
export const letterKindOptions = (Object.keys(letterKindLabels) as LetterKind[]).map((value) => ({ value, label: letterKindLabels[value] }));

export const ratingLabels = { role: "Role & work", manager: "Manager", growth: "Growth", compensation: "Compensation", culture: "Culture", workLife: "Work-life balance" } as const;
