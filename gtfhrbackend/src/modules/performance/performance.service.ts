import { requireValue } from "../talent/talent.schema.js";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as p from "../../contracts/performance.js";
import { personRef } from "../../core/people/person-ref.js";
import { assertVersion } from "../../core/http/request-context.js";
import { newId } from "../../core/database/ids.js";
import { todayInOrgZone } from "../../utils/date.js";
import { isOrgWide, requireOrgWide } from "../../core/security/scope.js";
import { personIdScope } from "../talent/talent.scope.js";
import type { TalentCall } from "../talent/talent.controller.js";
import type { TalentRepository } from "../talent/talent.repository.js";
import { actorOf, ensure, idOf, now, own } from "../talent/talent.schema.js";
import { performanceRepository } from "./performance.repository.js";
import * as s from "./performance.schema.js";
const emptySelf = (): p.PerfSelfPart => ({
  status: "not_started",
  goals: [],
  competencies: [],
  strengths: "",
  improvements: "",
  submittedAt: null,
  score: null,
});
const emptyManager = (): p.PerfManagerPart => ({
  ...emptySelf(),
  overallRating: null,
  summary: "",
  promotion: "not_now",
  incrementPercent: null,
});
const editableSheet = (r: s.ReviewRecord) => ["draft", "sent_back"].includes(r.sheet.status);
const versionOf = (call: TalentCall, supplied?: number) => call.version ?? supplied;
/** BE-003: cycles, calibration locks and competencies affect every department, so they need an org-wide grant. */
const orgLevelCommands = new Set(["cycle", "advance", "lock", "reopen", "competency"]);
export function createPerformanceService(prisma: PrismaClient) {
  const unit = performanceRepository(prisma);
  async function snapshot(repo: TalentRepository = unit.read) {
    const [cycles, reviews, competencies, people] = await Promise.all([
      repo.list("cycle", p.perfCycleSchema),
      repo.list("review", s.reviewRecordSchema),
      repo.list("competency", p.perfCompetencySchema),
      repo.people(),
    ]);
    return { cycles, reviews, competencies, people };
  }
  async function my(call: TalentCall) {
    const actor = actorOf(call);
    const { cycles, reviews, competencies, people } = await snapshot();
    const mine = reviews.filter((r) => r.employeeId === actor.employeeId);
    const visible = cycles.filter((c) => mine.some((r) => r.cycleId === c.id));
    const cycle = visible.find((c) => c.id === call.query.cycle) ?? visible.at(-1) ?? null;
    const review = mine.find((r) => r.cycleId === cycle?.id);
    const reviewer = people.find((e) => e.id === review?.reviewerId);
    const released = cycle?.phase === "released";
    const outcome: p.PerfOutcome | null =
      !cycle || !review
        ? null
        : !released
          ? { state: "under_review", releaseOn: cycle.releaseOn }
          : review.finalRating === null
            ? { state: "not_rated", reason: "No final rating was recorded." }
            : {
                state: "released",
                finalRating: review.finalRating,
                finalLabel: cycle.scale.find((l) => l.rating === review.finalRating)?.label ?? "",
                managerScore: review.manager.score,
                manager: review.manager,
                reviewer: reviewer ? personRef(reviewer) : null,
                releasedAt: cycle.releasedAt ?? now(),
                acknowledgedAt: review.acknowledgedAt,
                acknowledgementComment: review.acknowledgementComment,
              };
    return p.myPerformanceSchema.parse({
      cycles: visible,
      cycle,
      reviewId: review?.id ?? null,
      reviewVersion: review?.version ?? 0,
      reviewer: reviewer ? personRef(reviewer) : null,
      sheet: review?.sheet ?? null,
      goals: review?.goals ?? [],
      competencies,
      objectives: [],
      self: review?.self ?? null,
      outcome,
      can: {
        editGoals: cycle?.phase === "goal_setting" && !!review && editableSheet(review),
        checkIn: !!review && review.sheet.status === "approved" && !released,
        selfReview: cycle?.phase === "self_review" && review?.self.status !== "submitted",
        acknowledge: released && !!review?.finalRating && !review.acknowledgedAt,
      },
      history: mine
        .filter((r) => cycles.some((c) => c.id === r.cycleId && c.phase === "released"))
        .map((r) => {
          const c = requireValue(cycles.find((c) => c.id === r.cycleId));
          return {
            cycleId: c.id,
            cycleName: c.name,
            finalRating: r.finalRating,
            finalLabel: c.scale.find((l) => l.rating === r.finalRating)?.label ?? null,
            releasedAt: c.releasedAt,
            acknowledged: !!r.acknowledgedAt,
          };
        }),
    });
  }
  async function team(call: TalentCall) {
    const actor = actorOf(call);
    const { cycles, reviews, competencies, people } = await snapshot();
    const cycle = cycles.find((c) => c.id === call.query.cycle) ?? cycles.at(-1) ?? null;
    const mine = reviews.filter(
      (r) => r.cycleId === cycle?.id && r.reviewerId === actor.employeeId && r.employeeId !== actor.employeeId,
    );
    const employee = (r: s.ReviewRecord) => requireValue(people.find((e) => e.id === r.employeeId));
    const selected = mine.find((r) => r.id === call.query.review) ?? null;
    if (call.query.review) ensure(selected, "REVIEW_NOT_ASSIGNED", "This review is not assigned to you.");
    return p.teamPerformanceSchema.parse({
      cycles,
      cycle,
      reviewees: mine.map((r) => ({
        reviewId: r.id,
        person: personRef(employee(r)),
        department: employee(r).department.name,
        sheet: r.sheet,
        goalCount: r.goals.length,
        selfStatus: r.self.status,
        managerStatus: r.manager.status,
        managerRating: r.manager.overallRating,
        finalRating: r.finalRating,
        reassigned: r.reviewerId !== r.originalReviewerId,
      })),
      approvals: mine
        .filter((r) => r.sheet.status === "submitted")
        .map((r) => ({
          person: personRef(employee(r)),
          cycleId: requireValue(cycle).id,
          cycleName: requireValue(cycle).name,
          sheet: r.sheet,
          goals: r.goals,
        })),
      detail:
        !selected || !cycle
          ? null
          : {
              reviewId: selected.id,
              version: selected.version,
              person: personRef(employee(selected)),
              cycle,
              sheet: selected.sheet,
              goals: selected.goals,
              competencies,
              self: selected.self.status === "submitted" ? selected.self : null,
              selfStatus: selected.self.status,
              manager: selected.manager,
              canEdit: cycle.phase === "manager_review" && selected.manager.status !== "submitted",
              lockReason: cycle.phase !== "manager_review" ? "Manager review is not open." : null,
              finalRating: selected.finalRating,
              acknowledgedAt: selected.acknowledgedAt,
              acknowledgementComment: selected.acknowledgementComment,
            },
    });
  }
  function blockers(cycle: p.PerfCycle, reviews: s.ReviewRecord[]): string[] {
    if (cycle.phase === "goal_setting" && reviews.some((r) => r.sheet.status !== "approved"))
      return ["All goal sheets must be approved."];
    if (cycle.phase === "self_review" && reviews.some((r) => r.self.status !== "submitted"))
      return ["All self reviews must be submitted."];
    if (cycle.phase === "manager_review" && reviews.some((r) => r.manager.status !== "submitted"))
      return ["All manager reviews must be submitted."];
    if (cycle.phase === "calibration")
      return [
        ...(!cycle.calibrationLocked ? ["Lock calibration before release."] : []),
        ...(reviews.some((r) => r.finalRating === null) ? ["Finalise every participant rating."] : []),
        ...(todayInOrgZone() < cycle.releaseOn ? ["The release date has not arrived."] : []),
      ];
    return [];
  }
  async function admin(call: TalentCall) {
    const actor = actorOf(call);
    const { cycles, reviews, competencies, people } = await snapshot();
    const cycle = cycles.find((c) => c.id === call.query.cycle) ?? cycles.at(-1) ?? null;
    // BE-003: participants, progress and distribution cover only employees in the actor's performance.manage scope.
    const inScope = personIdScope(actor, "performance.manage", people);
    const selected = reviews.filter((r) => r.cycleId === cycle?.id && inScope(r.employeeId));
    const orgWide = isOrgWide(actor, "performance.manage");
    const departments = (await unit.read.departments())
      .filter((d) => orgWide || people.some((e) => e.departmentId === d.id && inScope(e.id)))
      .map((d) => d.name);
    const participants = selected.map((r) => {
      const employee = requireValue(people.find((e) => e.id === r.employeeId));
      const reviewer = people.find((e) => e.id === r.reviewerId);
      return {
        reviewId: r.id,
        person: personRef(employee),
        department: employee.department.name,
        reviewer: reviewer ? personRef(reviewer) : null,
        sheetStatus: r.sheet.status,
        selfStatus: r.self.status,
        managerStatus: r.manager.status,
        managerRating: r.manager.overallRating,
        managerScore: r.manager.score,
        promotion: r.manager.promotion,
        incrementPercent: r.manager.incrementPercent,
        finalRating: r.finalRating,
        finalReason: r.finalReason,
        version: r.version,
      };
    });
    return p.adminPerformanceSchema.parse({
      cycles,
      cycle,
      participants,
      progress: departments.map((department) => {
        const rows = participants.filter((r) => r.department === department);
        return {
          department,
          participants: rows.length,
          goalsApproved: rows.filter((r) => r.sheetStatus === "approved").length,
          selfSubmitted: rows.filter((r) => r.selfStatus === "submitted").length,
          managerSubmitted: rows.filter((r) => r.managerStatus === "submitted").length,
          finalised: rows.filter((r) => r.finalRating !== null).length,
        };
      }),
      distribution:
        cycle?.scale.map((level) => {
          const count = selected.filter((r) => r.finalRating === level.rating).length;
          return {
            rating: level.rating,
            label: level.label,
            guideline: cycle.guideline[level.rating - 1],
            count,
            percent: selected.length ? Math.round((count * 100) / selected.length) : 0,
          };
        }) ?? [],
      advance: {
        next: cycle ? (p.perfPhaseOrder[p.perfPhaseOrder.indexOf(cycle.phase) + 1] ?? null) : null,
        blockers: cycle ? blockers(cycle, selected) : [],
        warnings: [],
      },
      // The performance audit trail spans every department: organization-wide operators only.
      audit: orgWide ? await unit.read.list("audit", p.perfAuditEntrySchema) : [],
      competencies,
      departments,
      reviewers: people.filter((e) => e.status !== "exited").map(personRef),
    });
  }
  async function feedbackHub(call: TalentCall) {
    const actor = actorOf(call);
    const [feedback, requests, meetings, people, competencies, reviews] = await Promise.all([
      unit.read.list("feedback", p.perfFeedbackSchema),
      unit.read.list("feedback_request", p.perfFeedbackRequestSchema),
      unit.read.list("one_on_one", p.perfOneOnOneSchema),
      unit.read.people(),
      unit.read.list("competency", p.perfCompetencySchema),
      unit.read.list("review", s.reviewRecordSchema, { ownerId: actor.employeeId }),
    ]);
    const me = requireValue(people.find((e) => e.id === actor.employeeId));
    return p.feedbackHubSchema.parse({
      received: feedback.filter((f) => f.to.id === me.id),
      given: feedback.filter((f) => f.from.id === me.id),
      wall: feedback.filter((f) => f.visibility === "public"),
      teamPrivate: feedback.filter(
        (f) => f.visibility === "private" && people.some((e) => e.id === f.to.id && e.managerId === me.id),
      ),
      requestsToMe: requests.filter((r) => r.asked.id === me.id),
      myRequests: requests.filter((r) => r.requester.id === me.id),
      oneOnOnes: meetings.filter((m) => m.manager.id === me.id || m.report.id === me.id),
      counterparts: people
        .filter((e) => e.id === me.managerId || e.managerId === me.id)
        .map((e) => ({ ...personRef(e), relation: e.id === me.managerId ? "manager" : "report" })),
      colleagues: people.filter((e) => e.id !== me.id && e.status !== "exited").map(personRef),
      competencies,
      myGoals: reviews.flatMap((r) => r.goals.map((g) => ({ id: g.id, title: g.title }))),
    });
  }
  async function command(action: string, call: TalentCall, body: unknown) {
    const actor = actorOf(call);
    if (orgLevelCommands.has(action)) requireOrgWide(actor, "performance.manage");
    return unit.command(actor.employeeId, call.key, action, async (repo) => {
      const self = await repo.person(actor.employeeId);
      const auditId = newId("pa");
      await repo.save("audit", p.perfAuditEntrySchema, { id: auditId, at: now(), actor: self.name, event: action });
      if (action === "cycle") {
        const input = p.cycleInputSchema.parse(body);
        const id = call.params.cycleId ?? input.id ?? newId("pc");
        const previous = input.id || call.params.cycleId ? await repo.get(id, "cycle", p.perfCycleSchema) : null;
        if (previous) {
          assertVersion(previous.version, versionOf(call, input.version));
          ensure(previous.phase === "draft", "CYCLE_LOCKED", "Only draft cycles can be edited.");
        }
        await repo.save("cycle", p.perfCycleSchema, {
          ...input,
          id,
          competencyWeight: 100 - input.goalWeight,
          scale: input.scale.map((l, i) => ({ ...l, rating: i + 1 })),
          phase: "draft",
          calibrationLocked: false,
          releasedAt: null,
          participantCount: 0,
          version: (previous?.version ?? 0) + 1,
        });
        return { id };
      }
      if (["advance", "lock", "reopen"].includes(action)) {
        const cycle = await repo.get(idOf(call, "cycleId"), "cycle", p.perfCycleSchema);
        const reviews = await repo.list("review", s.reviewRecordSchema, { parentId: cycle.id });
        if (action === "advance") {
          const input = z.object({ expectedPhase: p.perfPhaseSchema }).parse(body);
          ensure(cycle.phase === input.expectedPhase, "STALE_PHASE", "The cycle phase changed. Refresh first.");
          const next = p.perfPhaseOrder[p.perfPhaseOrder.indexOf(cycle.phase) + 1];
          ensure(next, "CYCLE_RELEASED", "This cycle is already released.");
          ensure(!blockers(cycle, reviews).length, "PHASE_BLOCKED", blockers(cycle, reviews).join(" "));
          if (next === "goal_setting") {
            const people = (await repo.people()).filter(
              (e) =>
                e.status !== "exited" &&
                e.joinedOn.toISOString().slice(0, 10) <= cycle.eligibilityCutoff &&
                (!cycle.departments.length || cycle.departments.includes(e.department.name)),
            );
            ensure(people.length, "NO_PARTICIPANTS", "There are no eligible participants.");
            for (const employee of people) {
              const id = newId("pr");
              const review: s.ReviewRecord = {
                id,
                employeeId: employee.id,
                cycleId: cycle.id,
                reviewerId: employee.managerId,
                originalReviewerId: employee.managerId,
                version: 1,
                sheet: {
                  id,
                  status: "draft",
                  totalWeight: 0,
                  submittedAt: null,
                  decidedAt: null,
                  decidedBy: null,
                  comment: null,
                  version: 1,
                },
                goals: [],
                self: emptySelf(),
                manager: emptyManager(),
                finalRating: null,
                finalReason: null,
                acknowledgedAt: null,
                acknowledgementComment: null,
              };
              await repo.save("review", s.reviewRecordSchema, review, { ownerId: employee.id, parentId: cycle.id });
            }
            cycle.participantCount = people.length;
          }
          cycle.phase = next;
          if (next === "released") cycle.releasedAt = now();
        } else {
          ensure(cycle.phase === "calibration", "WRONG_PHASE", "Calibration is not open.");
          if (action === "lock")
            ensure(
              reviews.every((r) => r.finalRating !== null),
              "UNFINALISED_REVIEWS",
              "Finalise every rating before locking.",
            );
          cycle.calibrationLocked = action === "lock";
        }
        cycle.version++;
        await repo.save("cycle", p.perfCycleSchema, cycle);
        return { id: cycle.id, phase: cycle.phase };
      }
      if (action === "competency") {
        const input = s.competencyInput.parse(body);
        const id = call.params.competencyId ?? input.id ?? newId("comp");
        if (input.id || call.params.competencyId) await repo.get(id, "competency", p.perfCompetencySchema);
        await repo.save("competency", p.perfCompetencySchema, { ...input, id });
        return { id };
      }
      if (action === "feedback" || action === "request" || action === "decline" || action === "one_on_one") {
        const id = newId("pf");
        if (action === "feedback") {
          const input = s.feedbackInput.parse(body);
          ensure(input.toId !== actor.employeeId, "SELF_FEEDBACK", "Choose a colleague.");
          const recipient = await repo.person(input.toId);
          let goal: string | null = null;
          if (input.requestId) {
            const request = await repo.get(input.requestId, "feedback_request", p.perfFeedbackRequestSchema);
            own(request.asked.id, actor.employeeId);
            own(request.requester.id, input.toId);
            ensure(request.status === "pending", "REQUEST_CLOSED", "This feedback request is closed.");
            goal = request.goal;
            await repo.save("feedback_request", p.perfFeedbackRequestSchema, {
              ...request,
              status: "answered",
              respondedAt: now(),
            });
          }
          const competency = input.competencyId
            ? await repo.get(input.competencyId, "competency", p.perfCompetencySchema)
            : null;
          await repo.save(
            "feedback",
            p.perfFeedbackSchema,
            {
              id,
              from: personRef(self),
              to: personRef(recipient),
              visibility: input.visibility,
              kind: input.kind,
              competency: competency?.name ?? null,
              goal,
              message: input.message,
              createdAt: now(),
              inResponseToRequest: !!input.requestId,
            },
            { ownerId: recipient.id },
          );
        }
        if (action === "request") {
          const input = s.requestInput.parse(body);
          ensure(input.askedId !== actor.employeeId, "SELF_REQUEST", "Choose a colleague.");
          const asked = await repo.person(input.askedId);
          const goals = (await repo.list("review", s.reviewRecordSchema, { ownerId: actor.employeeId })).flatMap(
            (r) => r.goals,
          );
          const goal = goals.find((g) => g.id === input.goalId);
          ensure(!input.goalId || goal, "GOAL_NOT_OWNED", "Select one of your goals.");
          await repo.save(
            "feedback_request",
            p.perfFeedbackRequestSchema,
            {
              id,
              requester: personRef(self),
              asked: personRef(asked),
              goal: goal?.title ?? null,
              question: input.question,
              status: "pending",
              createdAt: now(),
              respondedAt: null,
            },
            { ownerId: self.id, parentId: asked.id },
          );
        }
        if (action === "decline") {
          const request = await repo.get(idOf(call, "requestId"), "feedback_request", p.perfFeedbackRequestSchema);
          own(request.asked.id, actor.employeeId);
          ensure(request.status === "pending", "REQUEST_CLOSED", "This request is closed.");
          await repo.save("feedback_request", p.perfFeedbackRequestSchema, {
            ...request,
            status: "declined",
            respondedAt: now(),
          });
        }
        if (action === "one_on_one") {
          const input = p.oneOnOneInputSchema.parse(body);
          const other = await repo.person(input.counterpartId);
          ensure(
            other.managerId === self.id || self.managerId === other.id,
            "NOT_COUNTERPART",
            "Only your manager and direct reports are valid counterparts.",
          );
          ensure(input.meetingOn <= todayInOrgZone(), "FUTURE_MEETING", "Record a meeting that has already happened.");
          await repo.save(
            "one_on_one",
            p.perfOneOnOneSchema,
            {
              id,
              manager: personRef(other.managerId === self.id ? self : other),
              report: personRef(other.managerId === self.id ? other : self),
              author: self.name,
              meetingOn: input.meetingOn,
              note: input.note,
              actionItems: input.actionItems,
              createdAt: now(),
            },
            { ownerId: self.id, parentId: other.id },
          );
        }
        return { id };
      }
      const all = await repo.list("review", s.reviewRecordSchema);
      const raw = z.record(z.string(), z.unknown()).parse(body ?? {});
      const review = all.find(
        (r) =>
          r.id === (call.params.reviewId ?? call.params.sheetId ?? raw.reviewId ?? raw.sheetId) ||
          (call.params.goalId && r.goals.some((g) => g.id === call.params.goalId)) ||
          ((action === "goal" || action === "submit_goals") &&
            r.employeeId === actor.employeeId &&
            r.cycleId === (call.params.cycleId ?? raw.cycleId)),
      );
      ensure(review, "REVIEW_NOT_FOUND", "No participating review was found.");
      const cycle = await repo.get(review.cycleId, "cycle", p.perfCycleSchema);
      const isManager = ["decision", "manager"].includes(action);
      const isAdmin = ["rating", "reviewer"].includes(action);
      if (isManager) {
        own(review.reviewerId ?? "", actor.employeeId);
        ensure(review.employeeId !== actor.employeeId, "SELF_APPROVAL", "You cannot review yourself.");
      } else if (isAdmin) await repo.assertInScope(actor, "performance.manage", review.employeeId);
      else own(review.employeeId, actor.employeeId);
      assertVersion(review.version, call.version ?? (typeof raw.version === "number" ? raw.version : undefined));
      if (action === "goal" || action === "delete_goal") {
        ensure(cycle.phase === "goal_setting" && editableSheet(review), "GOALS_LOCKED", "Goal editing is closed.");
        if (action === "delete_goal") review.goals = review.goals.filter((g) => g.id !== call.params.goalId);
        else {
          const input = s.goalInput.parse(body);
          const id = call.params.goalId ?? input.id ?? newId("goal");
          const previous = review.goals.find((g) => g.id === id);
          ensure(!input.id || previous, "GOAL_NOT_OWNED", "This goal does not belong to your review.");
          ensure(!input.objectiveId, "UNKNOWN_OBJECTIVE", "The selected organization objective is unavailable.");
          ensure(
            input.dueDate >= cycle.periodStart && input.dueDate <= cycle.periodEnd,
            "INVALID_DUE_DATE",
            "Goal due dates must be inside the cycle period.",
          );
          const goal: p.PerfGoal = {
            ...input,
            id,
            objective: null,
            progress: previous?.progress ?? 0,
            health: previous?.health ?? "on_track",
            checkIns: previous?.checkIns ?? [],
          };
          review.goals = [...review.goals.filter((g) => g.id !== id), goal];
        }
        review.sheet.totalWeight = review.goals.reduce((n, g) => n + g.weight, 0);
        review.sheet.version++;
      }
      if (action === "submit_goals") {
        ensure(cycle.phase === "goal_setting" && editableSheet(review), "GOALS_LOCKED", "Goal submission is closed.");
        ensure(review.goals.length && review.sheet.totalWeight === 100, "GOAL_WEIGHT", "Goals must total 100%.");
        ensure(
          review.reviewerId && review.reviewerId !== review.employeeId,
          "REVIEWER_REQUIRED",
          "Assign an independent reviewer before submitting.",
        );
        review.sheet.status = "submitted";
        review.sheet.submittedAt = now();
        review.sheet.version++;
      }
      if (action === "decision") {
        const input = p.goalDecisionSchema.parse(body);
        ensure(
          cycle.phase === "goal_setting" && review.sheet.status === "submitted",
          "GOALS_NOT_SUBMITTED",
          "There is no pending goal sheet.",
        );
        review.sheet.status = input.decision === "approve" ? "approved" : "sent_back";
        review.sheet.comment = input.comment;
        review.sheet.decidedAt = now();
        review.sheet.decidedBy = self.name;
        review.sheet.version++;
      }
      if (action === "check_in") {
        const input = p.checkInInputSchema.parse(body);
        ensure(
          review.sheet.status === "approved" && cycle.phase !== "released",
          "CHECK_IN_CLOSED",
          "Goal check-ins are closed.",
        );
        const goal = review.goals.find((g) => g.id === input.goalId);
        ensure(goal, "GOAL_NOT_FOUND", "The goal was not found.");
        goal.progress = input.progress;
        goal.health = input.health;
        goal.checkIns.push({
          id: newId("ci"),
          at: now(),
          progress: input.progress,
          health: input.health,
          comment: input.comment,
          author: self.name,
        });
      }
      if (action === "self" || action === "manager") {
        const input = action === "self" ? s.reviewInput.parse(body) : s.managerInput.parse(body);
        ensure(
          cycle.phase === (action === "self" ? "self_review" : "manager_review"),
          "WRONG_PHASE",
          "This review phase is closed.",
        );
        const part = action === "self" ? review.self : review.manager;
        ensure(part.status !== "submitted", "REVIEW_SUBMITTED", "A submitted review cannot be changed.");
        const competencies = await repo.list("competency", p.perfCompetencySchema);
        ensure(
          new Set(input.goals.map((g) => g.targetId)).size === input.goals.length &&
            input.goals.every((g) => review.goals.some((x) => x.id === g.targetId)),
          "INVALID_TARGET",
          "Ratings contain invalid or duplicate goals.",
        );
        ensure(
          new Set(input.competencies.map((g) => g.targetId)).size === input.competencies.length &&
            input.competencies.every((g) => competencies.some((x) => x.id === g.targetId)),
          "INVALID_TARGET",
          "Ratings contain invalid or duplicate competencies.",
        );
        if (input.intent === "submit")
          ensure(
            input.goals.length === review.goals.length &&
              input.competencies.length === competencies.length &&
              [...input.goals, ...input.competencies].every((g) => g.rating !== null) &&
              input.strengths.length >= 10 &&
              input.improvements.length >= 10,
            "INCOMPLETE_REVIEW",
            "Complete all ratings, strengths and improvement areas.",
          );
        const score = p.weightedScore(
          input.goals.map((g) => ({
            weight: requireValue(review.goals.find((x) => x.id === g.targetId)).weight,
            rating: g.rating,
          })),
          input.competencies.map((g) => g.rating),
          cycle.goalWeight,
        );
        Object.assign(part, {
          goals: input.goals,
          competencies: input.competencies,
          strengths: input.strengths,
          improvements: input.improvements,
          status: input.intent === "submit" ? "submitted" : "draft",
          submittedAt: input.intent === "submit" ? now() : null,
          score: score === null ? null : p.scoreText(score),
        });
        if (action === "manager") {
          const manager = s.managerInput.parse(body);
          if (manager.intent === "submit")
            ensure(
              manager.overallRating !== null && manager.summary.length >= 10,
              "INCOMPLETE_REVIEW",
              "Add an overall rating and summary.",
            );
          Object.assign(review.manager, {
            overallRating: manager.overallRating,
            summary: manager.summary,
            promotion: manager.promotion,
            incrementPercent: manager.incrementPercent,
          });
          if (manager.intent === "submit") review.finalRating = manager.overallRating;
        }
      }
      if (action === "rating") {
        const input = p.calibrateInputSchema.parse(body);
        ensure(
          cycle.phase === "calibration" && !cycle.calibrationLocked,
          "CALIBRATION_LOCKED",
          "Calibration is not open.",
        );
        review.finalRating = input.finalRating;
        review.finalReason = input.reason;
      }
      if (action === "reviewer") {
        const input = p.reassignInputSchema.parse(body);
        ensure(cycle.phase !== "released", "RELEASED_REVIEW", "Released reviews cannot be reassigned.");
        ensure(input.reviewerId !== review.employeeId, "SELF_REVIEW", "A reviewer must be independent.");
        const reviewer = await repo.person(input.reviewerId);
        ensure(reviewer.status !== "exited", "INACTIVE_REVIEWER", "Choose an active reviewer.");
        review.reviewerId = input.reviewerId;
      }
      if (action === "acknowledge") {
        const input = p.acknowledgeInputSchema.parse(body);
        ensure(
          cycle.phase === "released" && review.finalRating !== null,
          "OUTCOME_NOT_RELEASED",
          "The outcome has not been released.",
        );
        ensure(!review.acknowledgedAt, "ALREADY_ACKNOWLEDGED", "This outcome was already acknowledged.");
        review.acknowledgedAt = now();
        review.acknowledgementComment = input.comment;
      }
      review.version++;
      await repo.save("review", s.reviewRecordSchema, review, { ownerId: review.employeeId, parentId: review.cycleId });
      return { id: review.id, version: review.version };
    });
  }
  return { my, team, admin, feedbackHub, command };
}
