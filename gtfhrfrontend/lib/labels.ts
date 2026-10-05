import type { LetterType } from "@/types/requests";

/** Shared display labels (safe for server and client modules). */
export const letterOptions: { value: LetterType; label: string }[] = [
  { value: "employment_verification", label: "Employment verification" },
  { value: "address_proof", label: "Address proof letter" },
  { value: "salary_certificate", label: "Salary certificate" },
  { value: "visa_letter", label: "Visa / travel letter" },
  { value: "experience_letter", label: "Experience letter (during exit)" },
];
