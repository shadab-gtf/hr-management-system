import "server-only";
import type { FoundationData } from "@/types/foundation";

// Fictional, deterministic fixtures. Never a fallback for a failed live API.
export const foundationFixture = {
  source: "synthetic",
  departments: ["Design", "Engineering", "People"],
  members: [
    {
      id: "DEMO-001",
      name: "Aanya Sharma",
      initials: "AS",
      jobTitle: "Product Designer",
      department: "Design",
      location: "Noida",
      status: "Active",
      color: "magenta",
    },
    {
      id: "DEMO-002",
      name: "Kabir Mehta",
      initials: "KM",
      jobTitle: "Frontend Engineer",
      department: "Engineering",
      location: "Remote",
      status: "Active",
      color: "cyan",
    },
    {
      id: "DEMO-003",
      name: "Meera Kapoor",
      initials: "MK",
      jobTitle: "People Partner",
      department: "People",
      location: "Noida",
      status: "On leave",
      color: "yellow",
    },
    {
      id: "DEMO-004",
      name: "Arjun Rao",
      initials: "AR",
      jobTitle: "Design Intern",
      department: "Design",
      location: "Remote",
      status: "Onboarding",
      color: "cyan",
    },
  ],
} satisfies FoundationData;
