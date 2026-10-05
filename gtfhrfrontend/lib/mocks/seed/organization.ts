import "server-only";

/**
 * Synthetic organization structure. Department, location and entity names are
 * illustrative; GTF must verify real legal entities and sites before go-live.
 */
export const organization = {
  name: "GTF Technologies",
  timezone: "Asia/Kolkata",
  currency: "INR",
  legalEntity: "GTF Technologies (sample entity)",
  payGroup: "India · Monthly · INR",
  emailDomain: "gtf-hr.example",
} as const;

export const departments = [
  "Leadership",
  "Design",
  "Engineering",
  "Performance Marketing",
  "Strategy & Brand",
  "Client Services",
  "People & Culture",
  "Finance",
] as const;

export const locations = ["Noida HQ", "Gurugram", "Mumbai", "Remote"] as const;

export const costCenters: Record<(typeof departments)[number], string> = {
  Leadership: "CC-100 Corporate",
  Design: "CC-210 Creative",
  Engineering: "CC-220 Technology",
  "Performance Marketing": "CC-230 Growth",
  "Strategy & Brand": "CC-240 Strategy",
  "Client Services": "CC-250 Accounts",
  "People & Culture": "CC-110 People",
  Finance: "CC-120 Finance",
};

export const defaultShift = {
  name: "General shift",
  start: "09:30",
  end: "18:30",
  graceMinutes: 15,
} as const;
