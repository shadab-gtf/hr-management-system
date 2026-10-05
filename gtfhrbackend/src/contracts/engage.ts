import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "./common.js";

export const reactionKindSchema = z.enum(["like", "celebrate", "support", "insightful"]);

export const postCommentSchema = z.object({
  id: z.string(),
  author: personRefSchema,
  body: z.string(),
  createdAt: instantSchema,
});

export const postSchema = z.object({
  id: z.string(),
  kind: z.enum(["post", "anniversary", "welcome", "announcement", "achievement", "praise"]),
  group: z.enum(["General", "Events", "Wins", "People & Culture", "IT"]),
  /** null = posted by the organization. */
  author: personRefSchema.nullable(),
  subject: personRefSchema.nullable(),
  title: z.string().nullable(),
  body: z.string(),
  createdAt: instantSchema,
  reactions: z.array(z.object({ kind: reactionKindSchema, count: z.number().int(), mine: z.boolean() })),
  comments: z.array(postCommentSchema),
  canDelete: z.boolean(),
});

export const postInputSchema = z.object({
  group: postSchema.shape.group,
  body: z.string().trim().min(3, "Write at least 3 characters.").max(1000, "Keep posts under 1000 characters."),
});
export const commentInputSchema = z.object({
  postId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment.").max(500),
});

/* Polls -------------------------------------------------------------------- */

export const pollOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** null while results are hidden from this viewer. */
  votes: z.number().int().nonnegative().nullable(),
  percent: z.number().int().min(0).max(100).nullable(),
  mine: z.boolean(),
});

export const pollSchema = z.object({
  id: z.string(),
  question: z.string(),
  multiple: z.boolean(),
  anonymous: z.boolean(),
  /** null = everyone. */
  department: z.string().nullable(),
  author: personRefSchema,
  createdAt: instantSchema,
  closesAt: instantSchema,
  state: z.enum(["open", "closed"]),
  closedEarly: z.boolean(),
  /** Distinct voters (always shown). */
  voterCount: z.number().int().nonnegative(),
  hasVoted: z.boolean(),
  resultsVisible: z.boolean(),
  canClose: z.boolean(),
  options: z.array(pollOptionSchema),
  /** Named voters for non-anonymous polls once results are visible (latest first, capped). */
  recentVoters: z.array(personRefSchema),
});

export const pollsPageSchema = z.object({
  polls: z.array(pollSchema),
  departments: z.array(z.string()),
  myDepartment: z.string(),
});

export const pollInputSchema = z
  .object({
    question: z.string().trim().min(5, "Ask a question of at least 5 characters.").max(200, "Keep the question under 200 characters."),
    options: z
      .array(z.string().trim().max(80, "Keep each option under 80 characters."))
      .transform((list) => list.filter(Boolean))
      .pipe(z.array(z.string()).min(2, "Add at least 2 options.").max(6, "Use at most 6 options.")),
    multiple: z.boolean(),
    anonymous: z.boolean(),
    closesOn: isoDateSchema,
    department: z.string().trim().max(60).nullable(),
  })
  .refine((value) => new Set(value.options.map((option) => option.toLowerCase())).size === value.options.length, { message: "Options must be different.", path: ["options"] });

export const voteInputSchema = z.object({
  pollId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).min(1, "Choose an option."),
});

/* Surveys ------------------------------------------------------------------ */

export const surveyQuestionKindSchema = z.enum(["rating", "enps", "single", "multiple", "text"]);
export const surveyStateSchema = z.enum(["draft", "scheduled", "open", "closed"]);

export const surveyQuestionSchema = z.object({
  id: z.string(),
  kind: surveyQuestionKindSchema,
  prompt: z.string(),
  required: z.boolean(),
  options: z.array(z.string()),
});

export const surveySummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  state: surveyStateSchema,
  anonymous: z.boolean(),
  department: z.string().nullable(),
  opensOn: isoDateSchema,
  closesOn: isoDateSchema,
  minResponses: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
  responseCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  responded: z.boolean(),
  createdBy: personRefSchema.nullable(),
  version: z.number().int(),
});

export const surveyAuditSchema = z.object({ at: instantSchema, actor: z.string(), event: z.string() });

export const surveyDetailSchema = surveySummarySchema.extend({
  questions: z.array(surveyQuestionSchema),
  audit: z.array(surveyAuditSchema),
});

export const surveysForYouSchema = z.array(surveySummarySchema.extend({ questions: z.array(surveyQuestionSchema) }));

export const surveyResultsSchema = z.object({
  survey: surveyDetailSchema,
  responseRate: z.number().int().min(0).max(100),
  /** Anonymous survey below the minimum: nothing beyond counts is shown. */
  suppressed: z.boolean(),
  enps: z
    .object({ score: z.number().int(), promoters: z.number().int(), passives: z.number().int(), detractors: z.number().int(), responses: z.number().int() })
    .nullable(),
  questions: z.array(
    z.object({
      id: z.string(),
      kind: surveyQuestionKindSchema,
      prompt: z.string(),
      answered: z.number().int(),
      average: z.string().nullable(),
      distribution: z.array(z.object({ label: z.string(), count: z.number().int(), percent: z.number().int() })),
      texts: z.array(z.object({ id: z.string(), body: z.string(), author: z.string().nullable() })),
    }),
  ),
  departments: z.array(
    z.object({
      name: z.string(),
      eligible: z.number().int(),
      responses: z.number().int(),
      suppressed: z.boolean(),
      enps: z.number().int().nullable(),
      averageRating: z.string().nullable(),
    }),
  ),
});

export const surveyAdminSchema = z.object({
  surveys: z.array(surveySummarySchema),
  polls: z.array(pollSchema),
  departments: z.array(z.string()),
});

export const surveyInputSchema = z
  .object({
    surveyId: z.string().min(1).optional(),
    version: z.coerce.number().int().optional(),
    title: z.string().trim().min(5, "Use at least 5 characters.").max(120),
    description: z.string().trim().max(500, "Keep the description under 500 characters."),
    department: z.string().trim().max(60).nullable(),
    opensOn: isoDateSchema,
    closesOn: isoDateSchema,
    anonymous: z.boolean(),
  })
  .refine((value) => value.closesOn >= value.opensOn, { message: "Close date must be on or after the open date.", path: ["closesOn"] });

export const questionInputSchema = z
  .object({
    surveyId: z.string().min(1),
    kind: surveyQuestionKindSchema,
    prompt: z.string().trim().min(5, "Write a question of at least 5 characters.").max(200),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(80)).max(8, "Use at most 8 options."),
  })
  .refine((value) => (value.kind === "single" || value.kind === "multiple" ? value.options.length >= 2 : true), { message: "Add at least 2 options, one per line.", path: ["options"] })
  .refine((value) => new Set(value.options.map((option) => option.toLowerCase())).size === value.options.length, { message: "Options must be different.", path: ["options"] });

/** Raw answers keyed by question id; the handler validates against the question kind. */
export const surveyAnswersSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

/* Praise ------------------------------------------------------------------- */

export const praiseBadgeSchema = z.enum(["team_player", "client_hero", "innovator", "above_beyond", "mentor"]);
export const companyValueSchema = z.enum(["own_the_outcome", "craft_with_care", "win_together", "stay_curious", "client_first"]);

export const praiseSchema = z.object({
  id: z.string(),
  giver: personRefSchema,
  recipients: z.array(personRefSchema),
  badge: praiseBadgeSchema,
  value: companyValueSchema,
  message: z.string(),
  createdAt: instantSchema,
  /** Feed-shaped copy for reactions and comments. */
  post: postSchema,
});

export const praiseWallSchema = z.object({
  items: z.array(praiseSchema),
  month: z.string(),
  months: z.array(z.string()),
  leaderboard: z.array(z.object({ person: personRefSchema, count: z.number().int(), badges: z.array(praiseBadgeSchema) })),
  byBadge: z.array(z.object({ badge: praiseBadgeSchema, count: z.number().int(), leader: personRefSchema.nullable(), leaderCount: z.number().int() })),
  totals: z.object({ month: z.number().int(), receivedByMe: z.number().int(), givenByMe: z.number().int() }),
  colleagues: z.array(z.object({ id: z.string(), name: z.string(), department: z.string() })),
});

export const praiseInputSchema = z.object({
  recipientIds: z.array(z.string().min(1)).min(1, "Choose at least one colleague.").max(5, "Praise up to 5 people at once."),
  badge: praiseBadgeSchema,
  value: companyValueSchema,
  message: z.string().trim().min(10, "Say a little more — at least 10 characters.").max(500, "Keep it under 500 characters."),
});

export const feedSchema = z.object({
  posts: z.array(postSchema),
  polls: z.array(pollSchema),
  groups: z.array(z.string()),
});

export type ReactionKind = z.infer<typeof reactionKindSchema>;
export type Post = z.infer<typeof postSchema>;
export type PostComment = z.infer<typeof postCommentSchema>;
export type Feed = z.infer<typeof feedSchema>;
export type Poll = z.infer<typeof pollSchema>;
export type PollsPage = z.infer<typeof pollsPageSchema>;
export type PollInput = z.infer<typeof pollInputSchema>;
export type SurveyQuestionKind = z.infer<typeof surveyQuestionKindSchema>;
export type SurveyState = z.infer<typeof surveyStateSchema>;
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type SurveySummary = z.infer<typeof surveySummarySchema>;
export type SurveyDetail = z.infer<typeof surveyDetailSchema>;
export type SurveyForYou = z.infer<typeof surveysForYouSchema>[number];
export type SurveyResults = z.infer<typeof surveyResultsSchema>;
export type SurveyAdmin = z.infer<typeof surveyAdminSchema>;
export type SurveyInput = z.infer<typeof surveyInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type SurveyAnswers = z.infer<typeof surveyAnswersSchema>;
export type PraiseBadge = z.infer<typeof praiseBadgeSchema>;
export type CompanyValue = z.infer<typeof companyValueSchema>;
export type Praise = z.infer<typeof praiseSchema>;
export type PraiseWall = z.infer<typeof praiseWallSchema>;
export type PraiseInput = z.infer<typeof praiseInputSchema>;
