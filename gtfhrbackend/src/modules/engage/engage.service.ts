import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { config } from "../../config/index.js";
import {
  postSchema,
  reactionKindSchema,
  praiseBadgeSchema,
  type Poll,
  type PollInput,
  type Post,
  type PraiseInput,
  type PraiseWall,
  type QuestionInput,
  type SurveyAnswers,
  type SurveyInput,
  type SurveyResults,
} from "../../contracts/engage.js";
import { requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { departmentInScope, isOrgWide, requireOrgWide } from "../../core/security/scope.js";
import { newId } from "../../core/database/ids.js";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors/index.js";
import { assertVersion } from "../../core/http/request-context.js";
import { personRef } from "../../core/people/person-ref.js";
import { todayInOrgZone } from "../../utils/date.js";
import { toCsv } from "../../utils/csv.js";
import { createEngageRepository, engageCommand } from "./engage.repository.js";
import type { CommandContext } from "../workspace/workspace.schema.js";
import { storedBallot, storedPoll, storedPost, storedPraise, storedResponse, storedSurvey } from "./engage.schema.js";

/**
 * Access (BE-003). Feed, polls, praise and survey answers are self-service for every employee. Administering engage
 * content is organization-level: survey design, publishing, results and exports, and moderating other people's posts
 * need an organization-wide grant (`requireOrgWide`). A department-targeted poll can also be seen and closed by an
 * HR operator whose `survey.manage` scope includes that department.
 */
export function createEngageService(prisma: PrismaClient) {
  const repo = createEngageRepository(prisma);
  const command = <T>(
    actor: AuthenticatedActor,
    action: string,
    id: string,
    context: CommandContext,
    work: Parameters<typeof engageCommand<T>>[6],
  ) => engageCommand(prisma, actor, action, id, context.key, context.requestId, work);
  const responseId = (surveyId: string, employeeId: string) =>
    `answer:${createHmac("sha256", config.jwt.secret).update(`${surveyId}:${employeeId}`).digest("hex")}`;
  const service = {
    async posts(actor: AuthenticatedActor, query: Record<string, string> = {}) {
      const rows = await repo.list("post");
      const reactions = await repo.list("reaction");
      const comments = await repo.list("post_comment");
      return rows
        .map((r) => {
          const post = storedPost.parse(r.data);
          return {
            ...post,
            canDelete: r.ownerId === actor.employeeId || isOrgWide(actor, "announcement.publish"),
            reactions: reactionKindSchema.options.map((kind) => ({
              kind,
              count: reactions.filter((v) => v.parentId === r.id && v.state === kind).length,
              mine: reactions.some((v) => v.parentId === r.id && v.state === kind && v.ownerId === actor.employeeId),
            })),
            comments: comments
              .filter((c) => c.parentId === r.id)
              .reverse()
              .map((c) => postSchema.shape.comments.element.parse(c.data)),
          };
        })
        .filter(
          (p) =>
            (!query.group || p.group === query.group) &&
            (!query.q || `${p.title ?? ""} ${p.body}`.toLowerCase().includes(query.q.toLowerCase())),
        )
        .slice(0, 200);
    },
    async feed(actor: AuthenticatedActor, query: Record<string, string>) {
      return {
        posts: await service.posts(actor, query),
        polls: (await service.polls(actor)).polls,
        groups: postSchema.shape.group.options,
      };
    },
    post(actor: AuthenticatedActor, input: { group: Post["group"]; body: string }, context: CommandContext) {
      requireCapability(actor, "engage.post");
      return command(actor, "engage.post.create", actor.employeeId, context, async (r) => {
        const id = newId("post");
        await r.create({
          id,
          kind: "post",
          ownerId: actor.employeeId,
          data: {
            ...input,
            id,
            kind: "post",
            author: personRef(await r.employee(actor.employeeId)),
            subject: null,
            title: null,
            createdAt: new Date().toISOString(),
            reactions: [],
            comments: [],
            canDelete: true,
          },
        });
        return { id };
      });
    },
    reaction(
      actor: AuthenticatedActor,
      postId: string,
      kind: z.infer<typeof reactionKindSchema>,
      context: CommandContext,
    ) {
      requireCapability(actor, "engage.post");
      return command(actor, "engage.reaction", postId, context, async (r) => {
        await r.require(postId, "post");
        const id = `reaction:${postId}:${actor.employeeId}`;
        const previous = await r.get(id);
        const active = previous?.state !== kind;
        if (previous) await r.remove(id);
        if (active)
          await r.create({ id, kind: "reaction", ownerId: actor.employeeId, parentId: postId, state: kind, data: {} });
        return { active, count: (await r.list("reaction", { parentId: postId, state: kind })).length };
      });
    },
    comment(actor: AuthenticatedActor, postId: string, body: string, context: CommandContext) {
      requireCapability(actor, "engage.post");
      return command(actor, "engage.comment", postId, context, async (r) => {
        await r.require(postId, "post");
        const id = newId("cmt");
        await r.create({
          id,
          kind: "post_comment",
          ownerId: actor.employeeId,
          parentId: postId,
          data: {
            id,
            body,
            author: personRef(await r.employee(actor.employeeId)),
            createdAt: new Date().toISOString(),
          },
        });
        return { ok: true };
      });
    },
    archivePost(actor: AuthenticatedActor, id: string, context: CommandContext) {
      return command(actor, "engage.post.archive", id, context, async (r) => {
        const row = await r.require(id, "post");
        if (row.ownerId !== actor.employeeId) requireOrgWide(actor, "announcement.publish");
        await r.update(id, row.data, row.version, "archived");
        return { ok: true };
      });
    },
    async polls(actor: AuthenticatedActor) {
      const employee = await repo.employee(actor.employeeId);
      const employees = await repo.employees();
      const ballots = await repo.list("ballot");
      const departments = await repo.departments();
      const manages = (department: string | null | undefined) => manageablePoll(actor, department, departments);
      const polls: Poll[] = [];
      for (const row of await repo.list("poll")) {
        const poll = storedPoll.parse(row.data);
        if (
          poll.input.department &&
          poll.input.department !== employee.department.name &&
          !manages(poll.input.department)
        )
          continue;
        const author = employees.find((e) => e.id === poll.authorId);
        if (!author) continue;
        const votes = ballots.filter((b) => b.parentId === row.id);
        const mine = votes.find((v) => v.ownerId === actor.employeeId);
        const myOptions = mine ? storedBallot.parse(mine.data).optionIds : [];
        const closed = poll.closedEarly || poll.input.closesOn < todayInOrgZone();
        const resultsVisible = closed || Boolean(mine);
        polls.push({
          id: row.id,
          question: poll.input.question,
          multiple: poll.input.multiple,
          anonymous: poll.input.anonymous,
          department: poll.input.department,
          author: personRef(author),
          createdAt: poll.createdAt,
          closesAt: new Date(`${poll.input.closesOn}T23:59:59.999+05:30`).toISOString(),
          state: closed ? "closed" : "open",
          closedEarly: poll.closedEarly,
          voterCount: votes.length,
          hasVoted: Boolean(mine),
          resultsVisible,
          canClose: !closed && (poll.authorId === actor.employeeId || manages(poll.input.department)),
          options: poll.input.options.map((label, index) => {
            const id = `${row.id}_${index}`;
            const count = votes.filter((v) => storedBallot.parse(v.data).optionIds.includes(id)).length;
            return {
              id,
              label,
              mine: myOptions.includes(id),
              votes: resultsVisible ? count : null,
              percent: resultsVisible ? Math.round((count * 100) / (votes.length || 1)) : null,
            };
          }),
          recentVoters:
            resultsVisible && !poll.input.anonymous
              ? votes.slice(0, 10).flatMap((v) => {
                  const voter = employees.find((e) => e.id === v.ownerId);
                  return voter ? [personRef(voter)] : [];
                })
              : [],
        });
      }
      return {
        polls,
        departments: departments.map((d) => d.name),
        myDepartment: employee.department.name,
      };
    },
    poll(actor: AuthenticatedActor, input: PollInput, context: CommandContext) {
      requireCapability(actor, "engage.post");
      return command(actor, "engage.poll.create", actor.employeeId, context, async (r) => {
        if (input.closesOn < todayInOrgZone())
          throw new ValidationError("PAST_DEADLINE", "Choose a current or future close date.");
        if (input.department && !(await r.department(input.department)))
          throw new ValidationError("INVALID_AUDIENCE", "Choose an existing department.");
        const id = newId("poll");
        await r.create({
          id,
          kind: "poll",
          ownerId: actor.employeeId,
          data: { id, input, authorId: actor.employeeId, createdAt: new Date().toISOString(), closedEarly: false },
        });
        return { id };
      });
    },
    vote(actor: AuthenticatedActor, id: string, optionIds: string[], context: CommandContext) {
      return command(actor, "engage.poll.vote", id, context, async (r) => {
        const row = await r.require(id, "poll");
        const poll = storedPoll.parse(row.data);
        const employee = await r.employee(actor.employeeId);
        if (poll.input.department && poll.input.department !== employee.department.name) throw new NotFoundError();
        if (poll.closedEarly || poll.input.closesOn < todayInOrgZone())
          throw new ConflictError("POLL_CLOSED", "This poll is closed.");
        const options = [...new Set(optionIds)];
        if (
          !options.length ||
          (!poll.input.multiple && options.length !== 1) ||
          options.some((o) => !poll.input.options.some((_v, i) => o === `${id}_${i}`))
        )
          throw new ValidationError("INVALID_BALLOT", "Choose valid poll options.");
        const ballotId = `ballot:${id}:${actor.employeeId}`;
        const changed = Boolean(await r.get(ballotId));
        if (changed) await r.update(ballotId, { optionIds: options });
        else
          await r.create({
            id: ballotId,
            kind: "ballot",
            ownerId: actor.employeeId,
            parentId: id,
            data: { optionIds: options },
          });
        return { changed };
      });
    },
    closePoll(actor: AuthenticatedActor, id: string, context: CommandContext) {
      return command(actor, "engage.poll.close", id, context, async (r) => {
        const row = await r.require(id, "poll");
        const department = storedPoll.parse(row.data).input.department;
        if (row.ownerId !== actor.employeeId && !manageablePoll(actor, department, await r.departments())) {
          // A poll for another department is invisible to this person, so it answers 404 like `vote`.
          if (department && department !== (await r.employee(actor.employeeId)).department.name)
            throw new NotFoundError();
          requireOrgWide(actor, "survey.manage");
        }
        await r.update(id, { ...storedPoll.parse(row.data), closedEarly: true }, row.version);
        return { ok: true };
      });
    },
    praise(actor: AuthenticatedActor, input: PraiseInput, context: CommandContext) {
      requireCapability(actor, "engage.post");
      return command(actor, "engage.praise.create", actor.employeeId, context, async (r) => {
        const recipients = [...new Set(input.recipientIds)];
        if (
          recipients.includes(actor.employeeId) ||
          (await r.employees({ id: { in: recipients } })).length !== recipients.length
        )
          throw new ValidationError("INVALID_RECIPIENT", "Choose active colleagues other than yourself.");
        const id = newId("praise");
        const postId = newId("post");
        const createdAt = new Date().toISOString();
        const author = personRef(await r.employee(actor.employeeId));
        await r.create({
          id,
          kind: "praise",
          ownerId: actor.employeeId,
          data: { ...input, recipientIds: recipients, id, giverId: actor.employeeId, postId, createdAt },
        });
        await r.create({
          id: postId,
          kind: "post",
          ownerId: actor.employeeId,
          parentId: id,
          data: {
            id: postId,
            kind: "praise",
            group: "Wins",
            author,
            subject: null,
            title: input.badge.replace(/_/g, " "),
            body: input.message,
            createdAt,
            reactions: [],
            comments: [],
            canDelete: true,
          },
        });
        return { id };
      });
    },
    async praiseWall(actor: AuthenticatedActor, query: Record<string, string>): Promise<PraiseWall> {
      const employees = await repo.employees();
      const posts = await service.posts(actor);
      const all = (await repo.list("praise")).map((r) => storedPraise.parse(r.data));
      const month = query.month ?? todayInOrgZone().slice(0, 7);
      const monthly = all.filter((p) => p.createdAt.startsWith(month));
      const items = monthly
        .filter(
          (p) =>
            (!query.badge || p.badge === query.badge) &&
            (query.scope !== "given" || p.giverId === actor.employeeId) &&
            (query.scope !== "received" || p.recipientIds.includes(actor.employeeId)),
        )
        .flatMap((p) => {
          const giver = employees.find((e) => e.id === p.giverId);
          const post = posts.find((e) => e.id === p.postId);
          return giver && post
            ? [
                {
                  ...p,
                  giver: personRef(giver),
                  recipients: employees.filter((e) => p.recipientIds.includes(e.id)).map(personRef),
                  post,
                },
              ]
            : [];
        });
      const leaderboard = employees
        .map((e) => {
          const received = monthly.filter((p) => p.recipientIds.includes(e.id));
          return { person: personRef(e), count: received.length, badges: [...new Set(received.map((p) => p.badge))] };
        })
        .filter((e) => e.count)
        .sort((a, b) => b.count - a.count);
      return {
        items,
        month,
        months: [...new Set([month, ...all.map((p) => p.createdAt.slice(0, 7))])].sort().reverse(),
        leaderboard,
        byBadge: praiseBadgeSchema.options.map((badge) => {
          const leaders = employees
            .map((e) => ({
              person: personRef(e),
              count: monthly.filter((p) => p.badge === badge && p.recipientIds.includes(e.id)).length,
            }))
            .sort((a, b) => b.count - a.count);
          return {
            badge,
            count: monthly.filter((p) => p.badge === badge).length,
            leader: leaders[0]?.count ? leaders[0].person : null,
            leaderCount: leaders[0]?.count ?? 0,
          };
        }),
        totals: {
          month: monthly.length,
          receivedByMe: monthly.filter((p) => p.recipientIds.includes(actor.employeeId)).length,
          givenByMe: monthly.filter((p) => p.giverId === actor.employeeId).length,
        },
        colleagues: employees
          .filter((e) => e.id !== actor.employeeId)
          .map((e) => ({ id: e.id, name: e.name, department: e.department.name })),
      };
    },
    async surveyDetail(actor: AuthenticatedActor, id: string) {
      requireOrgWide(actor, "survey.manage");
      return service.surveyView(actor, id);
    },
    async surveyView(actor: AuthenticatedActor, id: string) {
      const row = await repo.require(id, "survey");
      const survey = storedSurvey.parse(row.data);
      const responses = await repo.list("survey_response", { parentId: id });
      const employees = await repo.employees(survey.department ? { department: { name: survey.department } } : {});
      const today = todayInOrgZone();
      return {
        ...survey,
        version: row.version,
        state:
          survey.state === "draft" || survey.state === "closed"
            ? survey.state
            : survey.closesOn < today
              ? ("closed" as const)
              : survey.opensOn > today
                ? ("scheduled" as const)
                : ("open" as const),
        responseCount: responses.length,
        eligibleCount: employees.length,
        questionCount: survey.questions.length,
        responded: responses.some((r) => r.id === responseId(id, actor.employeeId)),
      };
    },
    async surveys(actor: AuthenticatedActor, admin: boolean) {
      if (admin) requireOrgWide(actor, "survey.manage");
      const employee = await repo.employee(actor.employeeId);
      const surveys = [];
      for (const row of await repo.list("survey")) {
        const survey = await service.surveyView(actor, row.id);
        if (
          admin ||
          (survey.state === "open" && (!survey.department || survey.department === employee.department.name))
        )
          surveys.push(survey);
      }
      if (!admin) return surveys;
      return {
        surveys,
        polls: (await service.polls(actor)).polls,
        departments: (await repo.departments()).map((d) => d.name),
      };
    },
    saveSurvey(actor: AuthenticatedActor, input: SurveyInput, id: string | undefined, context: CommandContext) {
      requireOrgWide(actor, "survey.manage");
      return command(actor, "survey.save", id ?? "new", context, async (r) => {
        const row = id ? await r.require(id, "survey") : null;
        const previous = row ? storedSurvey.parse(row.data) : null;
        if (row) assertVersion(row.version, context.version ?? input.version);
        if (previous && previous.state !== "draft")
          throw new ConflictError("SURVEY_PUBLISHED", "Only draft surveys can be edited.");
        if (input.department && !(await r.department(input.department)))
          throw new ValidationError("INVALID_AUDIENCE", "Choose an existing department.");
        const key = id ?? newId("survey");
        const creator = personRef(await r.employee(actor.employeeId));
        const data = {
          ...input,
          id: key,
          state: "draft",
          minResponses: 5,
          questionCount: previous?.questions.length ?? 0,
          responseCount: 0,
          eligibleCount: 0,
          responded: false,
          createdBy: previous?.createdBy ?? creator,
          version: (row?.version ?? 0) + 1,
          questions: previous?.questions ?? [],
          audit: [
            ...(previous?.audit ?? []),
            { at: new Date().toISOString(), actor: creator.name, event: "Draft saved" },
          ],
        };
        if (row) await r.update(key, data, row.version);
        else await r.create({ id: key, kind: "survey", ownerId: actor.employeeId, state: "draft", data });
        return { id: key };
      });
    },
    surveyCommand(
      actor: AuthenticatedActor,
      id: string,
      op: "question" | "remove_question" | "move_question" | "publish" | "close" | "archive",
      input: { question?: QuestionInput; questionId?: string; direction?: "up" | "down" },
      context: CommandContext,
    ) {
      requireOrgWide(actor, "survey.manage");
      return command(actor, `survey.${op}`, id, context, async (r) => {
        const row = await r.require(id, "survey");
        const survey = storedSurvey.parse(row.data);
        assertVersion(row.version, context.version);
        if (op !== "close" && survey.state !== "draft")
          throw new ConflictError("SURVEY_PUBLISHED", "This action is only available for a draft survey.");
        if (op === "question" && input.question)
          survey.questions.push({
            id: newId("q"),
            kind: input.question.kind,
            prompt: input.question.prompt,
            required: input.question.required,
            options: input.question.options,
          });
        if (op === "remove_question" || op === "move_question") {
          const index = survey.questions.findIndex((q) => q.id === input.questionId);
          if (index < 0) throw new NotFoundError();
          if (op === "remove_question") survey.questions.splice(index, 1);
          else {
            const destination = index + (input.direction === "up" ? -1 : 1);
            const question = survey.questions[index];
            if (question && destination >= 0 && destination < survey.questions.length) {
              survey.questions.splice(index, 1);
              survey.questions.splice(destination, 0, question);
            }
          }
        }
        if (op === "publish") {
          if (!survey.questions.length || survey.closesOn < todayInOrgZone())
            throw new ValidationError("INVALID_SURVEY", "Add questions and a valid closing date before publishing.");
          survey.state = survey.opensOn > todayInOrgZone() ? "scheduled" : "open";
        }
        if (op === "close") {
          if (survey.state === "draft" || survey.state === "closed")
            throw new ConflictError("SURVEY_NOT_OPEN", "Only published surveys can be closed.");
          survey.state = "closed";
        }
        survey.questionCount = survey.questions.length;
        survey.version = row.version + 1;
        survey.audit.push({
          at: new Date().toISOString(),
          actor: (await r.employee(actor.employeeId)).name,
          event: op.replace(/_/g, " "),
        });
        await r.update(id, survey, row.version, op === "archive" ? "archived" : survey.state);
        return { ok: true };
      });
    },
    respond(actor: AuthenticatedActor, id: string, answers: SurveyAnswers, context: CommandContext) {
      return command(actor, "survey.respond", id, context, async (r) => {
        const row = await r.require(id, "survey");
        const survey = storedSurvey.parse(row.data);
        const employee = await r.employee(actor.employeeId);
        if (survey.department && survey.department !== employee.department.name) throw new NotFoundError();
        if (
          survey.state === "draft" ||
          survey.state === "closed" ||
          survey.opensOn > todayInOrgZone() ||
          survey.closesOn < todayInOrgZone()
        )
          throw new ConflictError("SURVEY_CLOSED", "The survey is not open for responses.");
        const key = responseId(id, actor.employeeId);
        if (await r.get(key))
          throw new ConflictError("ALREADY_RESPONDED", "You have already responded to this survey.");
        if (Object.keys(answers).some((key) => !survey.questions.some((q) => q.id === key)))
          throw new ValidationError("INVALID_ANSWER", "The response contains an unknown question.");
        for (const q of survey.questions) {
          const answer = answers[q.id];
          const empty = answer === undefined || answer === "" || (Array.isArray(answer) && !answer.length);
          if (empty) {
            if (q.required) throw new ValidationError("ANSWER_REQUIRED", `Answer: ${q.prompt}`);
            continue;
          }
          if (q.kind === "rating" || q.kind === "enps") {
            const max = q.kind === "rating" ? 5 : 10;
            const min = q.kind === "rating" ? 1 : 0;
            if (typeof answer !== "string" || !/^\d{1,2}$/.test(answer) || Number(answer) < min || Number(answer) > max)
              throw new ValidationError("INVALID_ANSWER", "Choose a valid rating.");
          } else if (q.kind === "text") {
            if (typeof answer !== "string" || answer.length > 2000)
              throw new ValidationError("INVALID_ANSWER", "Text answers must be at most 2000 characters.");
          } else if (q.kind === "single") {
            if (typeof answer !== "string" || !q.options.includes(answer))
              throw new ValidationError("INVALID_ANSWER", "Choose an available option.");
          } else if (
            !Array.isArray(answer) ||
            new Set(answer).size !== answer.length ||
            answer.some((a) => !q.options.includes(a))
          )
            throw new ValidationError("INVALID_ANSWER", "Choose valid options.");
        }
        await r.create({
          id: key,
          kind: "survey_response",
          parentId: id,
          ownerId: survey.anonymous ? null : actor.employeeId,
          data: { answers, department: employee.department.name, author: survey.anonymous ? null : employee.name },
        });
        return { ok: true };
      });
    },
    async results(actor: AuthenticatedActor, id: string): Promise<SurveyResults> {
      requireOrgWide(actor, "survey.manage");
      const survey = await service.surveyView(actor, id);
      const answers = (await repo.list("survey_response", { parentId: id })).map((r) => ({
        id: r.id,
        ...storedResponse.parse(r.data),
      }));
      const suppressed = survey.anonymous && answers.length < survey.minResponses;
      const enpsFor = (data: typeof answers) => {
        const question = survey.questions.find((q) => q.kind === "enps");
        if (!question) return null;
        const ratings = data.flatMap((a) => {
          const value = a.answers[question.id];
          return typeof value === "string" && value !== "" ? [Number(value)] : [];
        });
        if (!ratings.length) return null;
        const promoters = ratings.filter((n) => n >= 9).length,
          detractors = ratings.filter((n) => n <= 6).length;
        return {
          score: Math.round(((promoters - detractors) * 100) / ratings.length),
          promoters,
          detractors,
          passives: ratings.length - promoters - detractors,
          responses: ratings.length,
        };
      };
      return {
        survey,
        responseRate: Math.min(100, Math.round((answers.length * 100) / (survey.eligibleCount || 1))),
        suppressed,
        enps: suppressed ? null : enpsFor(answers),
        questions: suppressed
          ? []
          : survey.questions.map((q) => {
              const values = answers.flatMap((a) => {
                const v = a.answers[q.id];
                return v === undefined || v === "" ? [] : [{ id: a.id, value: v, author: a.author }];
              });
              const labels =
                q.kind === "rating"
                  ? ["1", "2", "3", "4", "5"]
                  : q.kind === "enps"
                    ? Array.from({ length: 11 }, (_v, i) => String(i))
                    : q.options;
              const numbers = values.flatMap((v) =>
                typeof v.value === "string" && (q.kind === "rating" || q.kind === "enps") ? [Number(v.value)] : [],
              );
              return {
                id: q.id,
                kind: q.kind,
                prompt: q.prompt,
                answered: values.length,
                average: numbers.length ? (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(2) : null,
                distribution: labels.map((label) => {
                  const count = values.filter((v) =>
                    Array.isArray(v.value) ? v.value.includes(label) : v.value === label,
                  ).length;
                  return { label, count, percent: Math.round((count * 100) / (values.length || 1)) };
                }),
                texts:
                  q.kind === "text"
                    ? values.flatMap((v) =>
                        typeof v.value === "string"
                          ? [{ id: v.id, body: v.value, author: survey.anonymous ? null : v.author }]
                          : [],
                      )
                    : [],
              };
            }),
        departments: await Promise.all(
          (await repo.departments())
            .filter((d) => !survey.department || d.name === survey.department)
            .map(async (d) => {
              const values = answers.filter((a) => a.department === d.name);
              const hidden = suppressed || (survey.anonymous && values.length < survey.minResponses);
              const eligible = (await repo.employees({ departmentId: d.id })).length;
              const ratings = survey.questions
                .filter((q) => q.kind === "rating")
                .flatMap((q) =>
                  values.flatMap((v) => {
                    const value = v.answers[q.id];
                    return typeof value === "string" && value ? [Number(value)] : [];
                  }),
                );
              return {
                name: d.name,
                eligible,
                responses: values.length,
                suppressed: hidden,
                enps: hidden ? null : (enpsFor(values)?.score ?? null),
                averageRating:
                  hidden || !ratings.length ? null : (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2),
              };
            }),
        ),
      };
    },
    async exportSurvey(actor: AuthenticatedActor, id: string) {
      const results = await service.results(actor, id);
      if (results.suppressed)
        throw new ConflictError("RESULTS_SUPPRESSED", "The minimum anonymous response count has not been reached.");
      return toCsv(
        ["Question", "Answer", "Count", "Percent"],
        results.questions.flatMap((q) => q.distribution.map((d) => [q.prompt, d.label, d.count, d.percent])),
      );
    },
  };
  return service;
}

/** Org-wide survey managers manage every poll; a scoped one only polls targeted at a department in their scope. */
function manageablePoll(
  actor: AuthenticatedActor,
  department: string | null | undefined,
  departments: readonly { id: string; name: string }[],
): boolean {
  if (isOrgWide(actor, "survey.manage")) return true;
  const target = department ? departments.find((d) => d.name === department) : undefined;
  return Boolean(target && departmentInScope(actor, "survey.manage", target.id));
}
