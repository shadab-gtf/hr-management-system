import type { IconName } from "@/components/ui/app-icon";
import type { CompanyValue, PraiseBadge, SurveyQuestionKind } from "@/types/engage";

/* Display labels, kept apart from the Zod contract so client bundles stay small. */

export const praiseBadges: Record<PraiseBadge, string> = {
  team_player: "Team player",
  client_hero: "Client hero",
  innovator: "Innovator",
  above_beyond: "Above & beyond",
  mentor: "Mentor",
};
export const companyValues: Record<CompanyValue, string> = {
  own_the_outcome: "Own the outcome",
  craft_with_care: "Craft with care",
  win_together: "Win together",
  stay_curious: "Stay curious",
  client_first: "Client first",
};
export const surveyQuestionKinds: Record<SurveyQuestionKind, string> = {
  rating: "Rating 1–5",
  enps: "eNPS 0–10",
  single: "Single choice",
  multiple: "Multiple choice",
  text: "Free text",
};
export const badgeIcons: Record<PraiseBadge, IconName> = {
  team_player: "team",
  client_hero: "crown",
  innovator: "star",
  above_beyond: "medal",
  mentor: "book",
};
