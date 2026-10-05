import { requireValue } from "../talent/talent.schema.js";
import { createHash } from "node:crypto";
import { AuthorizationError, NotFoundError } from "../../core/errors/index.js";
import { can } from "../../core/security/actor.js";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as r from "../../contracts/recruitment.js";
import { personRef } from "../../core/people/person-ref.js";
import { assertVersion } from "../../core/http/request-context.js";
import { newId } from "../../core/database/ids.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { todayInOrgZone, zonedInstant } from "../../utils/date.js";
import type { TalentCall } from "../talent/talent.controller.js";
import type { TalentRepository } from "../talent/talent.repository.js";
import { actorOf, ensure, idOf, now, own, addDays, daysBetween } from "../talent/talent.schema.js";
import { recruitmentRepository } from "./recruitment.repository.js";
import * as s from "./recruitment.schema.js";
const activeOffer = (c: s.CandidateRecord) =>
  !!c.offer && ["pending_approval", "extended", "accepted"].includes(c.offer.state) && !c.offer.employeeId;
const publicJob = (job: r.JobDetail) => r.publicJobSchema.parse({ ...job, postedOn: job.openedOn });
const isPublic = (job: r.JobDetail) => job.state === "published" && job.publishToCareers;
function visibleInterview(interview: r.Interview, call: TalentCall): r.Interview {
  const actor = actorOf(call);
  const isPanelist = interview.panel.some((p) => p.person.id === actor.employeeId);
  const submitted = interview.scorecards.some((s) => s.panelist.id === actor.employeeId);
  const visible = isPanelist ? submitted : can(actor, "recruitment.manage");
  const blocked = !isPanelist
    ? "Only assigned panelists can submit."
    : submitted
      ? "Your scorecard was submitted."
      : interview.state === "cancelled"
        ? "Interview cancelled."
        : interview.scheduledAt.slice(0, 10) > todayInOrgZone()
          ? "Scorecards open on the interview date."
          : null;
  return {
    ...interview,
    isPanelist,
    myScorecardSubmitted: submitted,
    scorecards: visible ? interview.scorecards : [],
    feedbackHidden: !visible && interview.scorecards.length > 0,
    canSubmit: !blocked,
    submitBlockedReason: blocked,
  };
}
function candidateView(candidate: s.CandidateRecord, job: r.JobDetail, call: TalentCall): r.CandidateDetail {
  const c = { ...candidate };
  const due = !c.erased && c.stage !== "hired" && c.retainUntil <= todayInOrgZone();
  const blocked = c.erased
    ? "Already erased."
    : c.stage === "hired"
      ? "Hired candidates are retained in the employee record."
      : activeOffer(c)
        ? "Resolve the open offer first."
        : c.stage !== "rejected" && !due
          ? "Reject the candidate or wait for retention expiry."
          : null;
  const open = job.state !== "closed" && job.state !== "filled";
  return r.candidateDetailSchema.parse({
    ...c,
    retentionDue: due,
    jobTitle: job.title,
    jobState: job.state,
    interviews: c.interviews.map((i) => visibleInterview(i, call)),
    offer: c.offer
      ? {
          ...c.offer,
          canApprove:
            can(actorOf(call), "payroll.approve") &&
            c.offer.createdBy.id !== actorOf(call).employeeId &&
            c.offer.state === "pending_approval",
        }
      : null,
    permissions: {
      canMove: !c.erased && c.stage !== "hired" && !activeOffer(c),
      canSchedule: !c.erased && open && ["applied", "screening", "interview"].includes(c.stage),
      canOffer: !c.erased && open && ["interview", "offer"].includes(c.stage) && !activeOffer(c),
      canConvert: c.offer?.state === "accepted" && !c.employeeId,
      canErase: !blocked,
      eraseBlockedReason: blocked,
    },
  });
}
export function createRecruitmentService(prisma: PrismaClient) {
  const unit = recruitmentRepository(prisma);
  async function all(repo: TalentRepository = unit.read) {
    const [jobs, candidates, requisitions] = await Promise.all([
      repo.list("job", r.jobDetailSchema),
      repo.list("candidate", s.candidateRecord),
      repo.list("requisition", r.requisitionSchema),
    ]);
    return { jobs, candidates, requisitions };
  }
  function jobView(job: r.JobDetail, candidates: s.CandidateRecord[]): r.JobDetail {
    const mine = candidates.filter((c) => c.jobId === job.id);
    const counts = { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
    for (const c of mine) counts[c.stage]++;
    return {
      ...job,
      hires: counts.hired,
      daysOpen: daysBetween(job.openedOn, job.closedOn ?? todayInOrgZone()),
      stageCounts: counts,
      sourceBreakdown: r.candidateSourceSchema.options.map((source) => ({
        source,
        count: mine.filter((c) => c.source === source).length,
      })),
      candidates: mine.map((c) => ({
        id: c.id,
        reference: c.reference,
        name: c.name,
        experienceYears: c.experienceYears,
        currentCompany: c.currentCompany,
        source: c.source,
        stage: c.stage,
        daysInStage: daysBetween(c.stageChangedAt, now()),
        nextInterviewAt:
          c.interviews
            .filter((i) => i.state === "scheduled" && i.scheduledAt > now())
            .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]?.scheduledAt ?? null,
        offerState: c.offer?.state ?? null,
        rejectionReason: c.rejectionReason,
        erased: c.erased,
        version: c.version,
      })),
    };
  }
  async function read(action: string, call: TalentCall) {
    if (action === "resume") {
      const actor = actorOf(call);
      if (!can(actor, "recruitment.manage")) throw new AuthorizationError("Recruitment access is restricted.");
      return unit.command(actor.employeeId, undefined, "resume_download", async (repo) => {
        const candidate = await repo.get(idOf(call, "candidateId"), "candidate", s.candidateRecord);
        if (candidate.erased || !candidate.resumeFileId || !candidate.resume)
          throw new NotFoundError("No resume is available.");
        const row = await repo.workspace().require(candidate.resumeFileId, "resume");
        ensure(
          row.state === "clean",
          "RESUME_NOT_READY",
          row.state === "rejected"
            ? "The resume failed its security scan."
            : "The resume is awaiting its security scan.",
        );
        const file = await repo.workspace().file(row.id);
        if (!file) throw new NotFoundError("The resume file is unavailable.");
        return {
          id: candidate.id,
          fileName: candidate.resume.name,
          mime: file.mime,
          contentBase64: Buffer.from(file.bytes).toString("base64"),
        };
      });
    }
    const { jobs, candidates, requisitions } = await all();
    if (action === "public_jobs") return jobs.filter(isPublic).map(publicJob);
    if (action === "public_job") {
      const job = jobs.find((j) => j.id === call.params.jobId && isPublic(j));
      ensure(job, "JOB_UNAVAILABLE", "This opening is unavailable.");
      return publicJob(job);
    }
    const actor = actorOf(call);
    if (action === "jobs") return jobs.map((j) => jobView(j, candidates));
    if (action === "job") {
      const job = jobs.find((j) => j.id === call.params.jobId);
      ensure(job, "JOB_NOT_FOUND", "The job was not found.");
      return jobView(job, candidates);
    }
    if (action === "requisitions")
      return requisitions.map((q) => ({
        ...q,
        canDecide: q.state === "pending" && q.raisedBy.id !== actor.employeeId && can(actor, "recruitment.manage"),
      }));
    if (action === "candidates")
      return candidates
        .filter(
          (c) =>
            (!call.query.q ||
              `${c.name} ${c.email ?? ""} ${c.reference}`.toLowerCase().includes(call.query.q.toLowerCase())) &&
            (!call.query.jobId || c.jobId === call.query.jobId) &&
            (!call.query.stage || c.stage === call.query.stage) &&
            (!call.query.source || c.source === call.query.source) &&
            (!call.query.retentionDue || (!c.erased && c.stage !== "hired" && c.retainUntil <= todayInOrgZone())),
        )
        .map((c) => candidateView(c, requireValue(jobs.find((j) => j.id === c.jobId)), call));
    if (action === "candidate" || action === "offer") {
      const candidate = candidates.find((c) => c.id === call.params.candidateId);
      ensure(candidate, "CANDIDATE_NOT_FOUND", "The candidate was not found.");
      const view = candidateView(candidate, requireValue(jobs.find((j) => j.id === candidate.jobId)), call);
      if (action === "offer") {
        ensure(view.offer, "NO_OFFER", "No offer exists.");
        return view.offer;
      }
      return view;
    }
    if (action === "options") {
      const [departments, locations, people] = await Promise.all([
        unit.read.departments(),
        unit.read.locations(),
        unit.read.people(),
      ]);
      return {
        departments: departments.map((d) => d.name),
        locations: locations.map((l) => l.name),
        people: people.filter((e) => e.status !== "exited").map(personRef),
        jobs: jobs.map((j) => ({ id: j.id, title: j.title, state: j.state })),
        today: todayInOrgZone(),
      };
    }
    if (action === "referrals")
      return candidates
        .filter((c) => c.referrer?.id === actor.employeeId)
        .map((c) => ({
          id: c.id,
          jobId: c.jobId,
          name: c.name,
          jobTitle: c.jobTitle,
          status: c.stage === "hired" ? "hired" : c.stage === "rejected" ? "not_selected" : "in_process",
          referredAt: c.appliedAt,
        }));
    if (action === "interviews")
      return {
        interviews: candidates
          .flatMap((c) => c.interviews)
          .filter((i) => i.panel.some((p) => p.person.id === actor.employeeId))
          .map((i) => visibleInterview(i, call)),
        requisitions: requisitions
          .filter((q) => q.raisedBy.id === actor.employeeId)
          .map((q) => ({ ...q, canDecide: false })),
        offerApprovals: candidates
          .flatMap((c) => (c.offer ? [c.offer] : []))
          .filter(
            (o) =>
              can(actor, "payroll.approve") && o.state === "pending_approval" && o.createdBy.id !== actor.employeeId,
          )
          .map((o) => ({ ...o, canApprove: true })),
        canApproveOffers: can(actor, "payroll.approve"),
      };
    const accepted = candidates.filter((c) => c.offer?.state === "accepted").length;
    const decided = candidates.filter((c) => c.offer && ["accepted", "declined"].includes(c.offer.state)).length;
    const hired = candidates.filter((c) => c.stage === "hired");
    return r.recruitmentStatsSchema.parse({
      openPositions: jobs
        .filter((j) => j.state === "published")
        .reduce(
          (n, j) =>
            n + Math.max(0, j.openings - candidates.filter((c) => c.jobId === j.id && c.stage === "hired").length),
          0,
        ),
      activeJobs: jobs.filter((j) => j.state === "published").length,
      inPipeline: candidates.filter((c) => !["hired", "rejected"].includes(c.stage)).length,
      offersAccepted: accepted,
      offersDecided: decided,
      acceptanceRate: decided ? Math.round((accepted * 100) / decided) : null,
      avgDaysToHire: hired.length
        ? Math.round(hired.reduce((n, c) => n + daysBetween(c.appliedAt, c.stageChangedAt), 0) / hired.length)
        : null,
      hires: hired.length,
      pendingRequisitions: requisitions.filter((q) => q.state === "pending").length,
      pendingOfferApprovals: candidates.filter((c) => c.offer?.state === "pending_approval").length,
      sources: r.candidateSourceSchema.options.map((source) => {
        const rows = candidates.filter((c) => c.source === source);
        const hires = rows.filter((c) => c.stage === "hired").length;
        return {
          source,
          candidates: rows.length,
          interviewed: rows.filter((c) => c.interviews.length > 0).length,
          hired: hires,
          conversion: rows.length ? Math.round((hires * 100) / rows.length) : 0,
        };
      }),
    });
  }
  async function command(action: string, call: TalentCall, body: unknown) {
    return unit.command(call.actor?.employeeId ?? null, call.key, action, async (repo) => {
      const self = call.actor ? await repo.person(call.actor.employeeId) : null;
      const { jobs, candidates } = await all(repo);
      if (action === "requisition") {
        const input = s.requisitionInput.parse(body);
        ensure(self, "AUTHENTICATION_REQUIRED", "Sign in first.");
        ensure(
          (await repo.departments()).some((d) => d.name === input.department) &&
            (await repo.locations()).some((l) => l.name === input.location),
          "INVALID_ORGANIZATION",
          "Select a configured department and location.",
        );
        const id = newId("req");
        const reference = await repo.reference("REQ");
        await repo.save(
          "requisition",
          r.requisitionSchema,
          {
            ...input,
            id,
            reference,
            budgetMin: inr(paiseFromAmount(input.budgetMin)),
            budgetMax: inr(paiseFromAmount(input.budgetMax)),
            backfillFor: input.backfillFor ?? null,
            raisedBy: personRef(self),
            raisedAt: now(),
            state: "pending",
            decidedBy: null,
            decidedAt: null,
            decisionNote: null,
            jobId: null,
            version: 1,
            canDecide: false,
          },
          { ownerId: self.id, state: "pending" },
        );
        return { reference };
      }
      if (action === "requisition_decision") {
        const input = s.decisionInput.parse(body);
        const req = await repo.get(idOf(call, "requisitionId"), "requisition", r.requisitionSchema);
        assertVersion(req.version, call.version);
        ensure(self && self.id !== req.raisedBy.id, "SELF_APPROVAL", "An independent approver must decide.");
        ensure(req.state === "pending", "ALREADY_DECIDED", "This requisition was decided.");
        req.state = input.decision === "approve" ? "approved" : "rejected";
        req.decidedBy = personRef(self);
        req.decidedAt = now();
        req.decisionNote = input.note;
        req.version++;
        if (input.decision === "approve") {
          const id = newId("job");
          const manager = await repo.person(req.raisedBy.id);
          const reference = await repo.reference("JOB");
          await repo.save("job", r.jobDetailSchema, {
            id,
            reference,
            title: req.title,
            department: req.department,
            location: req.location,
            employmentType: req.employmentType,
            openings: req.openings,
            hires: 0,
            hiringManager: personRef(manager),
            hiringManagerId: manager.id,
            state: "draft",
            publishToCareers: false,
            openedOn: todayInOrgZone(),
            closedOn: null,
            daysOpen: 0,
            stageCounts: { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
            ctcMin: req.budgetMin,
            ctcMax: req.budgetMax,
            experienceMin: 0,
            experienceMax: 40,
            requisitionReference: req.reference,
            description: req.reason,
            skills: [],
            version: 1,
            sourceBreakdown: [],
            candidates: [],
          });
          req.jobId = id;
        }
        await repo.save("requisition", r.requisitionSchema, req, { state: req.state });
        return { reference: req.reference, jobId: req.jobId };
      }
      if (action === "job") {
        const input = s.jobInput.parse(body);
        const id = call.params.jobId ?? input.jobId ?? newId("job");
        const old = input.jobId || call.params.jobId ? await repo.get(id, "job", r.jobDetailSchema) : null;
        if (old) {
          assertVersion(old.version, call.version ?? input.expectedVersion);
          ensure(!["closed", "filled"].includes(old.state), "JOB_CLOSED", "Closed jobs cannot be edited.");
          ensure(
            input.openings >= candidates.filter((c) => c.jobId === id && c.stage === "hired").length,
            "OPENINGS_BELOW_HIRES",
            "Openings cannot be lower than completed hires.",
          );
        }
        const manager = await repo.person(input.hiringManagerId);
        ensure(manager.status !== "exited", "INACTIVE_MANAGER", "Choose an active hiring manager.");
        ensure(
          (await repo.departments()).some((d) => d.name === input.department) &&
            (await repo.locations()).some((l) => l.name === input.location),
          "INVALID_ORGANIZATION",
          "Select a configured department and location.",
        );
        if (old?.requisitionReference) {
          const reqs = await repo.list("requisition", r.requisitionSchema);
          const req = reqs.find((q) => q.reference === old.requisitionReference);
          ensure(
            !req || paiseFromAmount(input.ctcMax) <= paiseFromAmount(req.budgetMax.amount),
            "OVER_BUDGET",
            "Job CTC cannot exceed its approved requisition budget.",
          );
        }
        const reference = old?.reference ?? (await repo.reference("JOB"));
        await repo.save(
          "job",
          r.jobDetailSchema,
          {
            ...input,
            id,
            reference,
            hires: old?.hires ?? 0,
            hiringManager: personRef(manager),
            state: old?.state ?? "draft",
            openedOn: old?.openedOn ?? todayInOrgZone(),
            closedOn: null,
            daysOpen: 0,
            stageCounts: old?.stageCounts ?? {
              applied: 0,
              screening: 0,
              interview: 0,
              offer: 0,
              hired: 0,
              rejected: 0,
            },
            ctcMin: inr(paiseFromAmount(input.ctcMin)),
            ctcMax: inr(paiseFromAmount(input.ctcMax)),
            requisitionReference: old?.requisitionReference ?? null,
            version: (old?.version ?? 0) + 1,
            sourceBreakdown: [],
            candidates: [],
          },
          { state: old?.state ?? "draft" },
        );
        return { id, reference };
      }
      if (action === "job_state") {
        const input = z.object({ to: r.jobStateSchema.extract(["published", "on_hold", "closed"]) }).parse(body);
        const job = await repo.get(idOf(call, "jobId"), "job", r.jobDetailSchema);
        assertVersion(job.version, call.version);
        const allowed = {
          published: ["draft", "on_hold"],
          on_hold: ["published"],
          closed: ["draft", "published", "on_hold"],
        };
        ensure(allowed[input.to].includes(job.state), "INVALID_TRANSITION", "The job cannot enter that state.");
        if (input.to === "published")
          ensure(
            job.description.length >= 50 && job.skills.length > 0,
            "INCOMPLETE_JOB",
            "Complete the job description and skills before publishing.",
          );
        if (input.to === "closed")
          ensure(
            !candidates.some((c) => c.jobId === job.id && activeOffer(c)),
            "OPEN_OFFERS",
            "Resolve open offers before closing.",
          );
        job.state = input.to;
        job.version++;
        job.closedOn = input.to === "closed" ? todayInOrgZone() : null;
        await repo.save("job", r.jobDetailSchema, job, { state: job.state });
        return { id: job.id, state: job.state };
      }
      if (["candidate", "application", "referral"].includes(action)) {
        const input =
          action === "candidate"
            ? s.candidateInput.parse(body)
            : action === "application"
              ? s.applyInput.parse(body)
              : s.referralInput.parse(body);
        const job = jobs.find((j) => j.id === (call.params.jobId ?? input.jobId));
        ensure(
          job && job.state === "published" && (action !== "application" || job.publishToCareers),
          "JOB_UNAVAILABLE",
          "This opening is unavailable.",
        );
        if (call.params.jobId) own(input.jobId, call.params.jobId);
        const duplicate = candidates.find(
          (c) =>
            !c.erased &&
            (c.email === input.email ||
              c.phone?.replace(/\D/g, "").slice(-10) === input.phone.replace(/\D/g, "").slice(-10)),
        );
        ensure(
          !duplicate || ("allowDuplicate" in input && input.allowDuplicate),
          "DUPLICATE_CANDIDATE",
          "A candidate with this email or mobile already exists.",
        );
        const id = newId("cand");
        const reference = await repo.reference("CAN");
        const source =
          action === "application"
            ? "careers"
            : action === "referral"
              ? "referral"
              : "source" in input
                ? input.source
                : "careers";
        const referrerId = action === "referral" ? self?.id : "referrerId" in input ? input.referrerId : undefined;
        const referrer = referrerId ? await repo.person(referrerId) : null;
        const resumeFileId = input.resume ? newId("resume") : null;
        if (input.resume && resumeFileId) {
          const bytes = Buffer.from(input.resume.contentBase64, "base64");
          const owner = await repo.person(job.hiringManagerId);
          await repo
            .workspace()
            .create({
              id: resumeFileId,
              kind: "resume",
              ownerId: owner.id,
              parentId: id,
              state: "scanning",
              data: {
                ...r.resumeMetaSchema.parse(input.resume),
                id: resumeFileId,
                uploadedAt: now(),
                scanState: "scanning",
              },
            });
          await repo
            .workspace()
            .saveFile(
              resumeFileId,
              owner.id,
              input.resume.mime,
              bytes,
              createHash("sha256").update(bytes).digest("hex"),
            );
        }
        const candidate: s.CandidateRecord = {
          id,
          reference,
          name: input.name,
          email: input.email,
          phone: input.phone,
          jobId: job.id,
          jobTitle: job.title,
          stage: "applied",
          source,
          appliedAt: now(),
          stageChangedAt: now(),
          experienceYears: input.experienceYears,
          retentionDue: false,
          erased: false,
          possibleDuplicate: !!duplicate,
          currentCompany: "currentCompany" in input ? (input.currentCompany ?? null) : null,
          noticePeriodDays:
            "noticePeriodDays" in input && typeof input.noticePeriodDays === "number" ? input.noticePeriodDays : null,
          currentCtc: "currentCtc" in input && input.currentCtc ? inr(paiseFromAmount(input.currentCtc)) : null,
          expectedCtc: "expectedCtc" in input && input.expectedCtc ? inr(paiseFromAmount(input.expectedCtc)) : null,
          referrer: referrer ? personRef(referrer) : null,
          resume: input.resume ? r.resumeMetaSchema.parse(input.resume) : null,
          resumeFileId,
          consentAt: now(),
          retainUntil: addDays(todayInOrgZone(), 365),
          erasedAt: null,
          rejectionReason: null,
          employeeId: null,
          duplicateOf: duplicate
            ? { id: duplicate.id, reference: duplicate.reference, jobTitle: duplicate.jobTitle }
            : null,
          jobState: job.state,
          version: 1,
          notes: [],
          timeline: [
            {
              id: newId("evt"),
              at: now(),
              actor: self?.name ?? "Applicant",
              title: "Application received",
              detail: null,
            },
          ],
          interviews: [],
          offer: null,
          permissions: {
            canMove: true,
            canSchedule: true,
            canOffer: false,
            canConvert: false,
            canErase: false,
            eraseBlockedReason: "Candidate is active.",
          },
        };
        await repo.save("candidate", s.candidateRecord, candidate, {
          parentId: job.id,
          ...(referrerId ? { ownerId: referrerId } : {}),
          state: "applied",
        });
        return { id, reference };
      }
      const candidate = candidates.find(
        (c) =>
          c.id === call.params.candidateId ||
          c.offer?.id === call.params.offerId ||
          c.interviews.some((i) => i.id === call.params.interviewId),
      );
      ensure(candidate, "CANDIDATE_NOT_FOUND", "Candidate was not found.");
      const job = requireValue(jobs.find((j) => j.id === candidate.jobId));
      ensure(!candidate.erased, "CANDIDATE_ERASED", "This candidate's personal data was erased.");
      assertVersion(call.params.offerId ? requireValue(candidate.offer).version : candidate.version, call.version);
      let result: unknown = { id: candidate.id };
      if (action === "stage") {
        const input = s.stageInput.parse(body);
        ensure(
          candidate.stage !== "hired" && !activeOffer(candidate),
          "STAGE_LOCKED",
          "Resolve the offer before moving this candidate.",
        );
        ensure(candidate.stage !== input.to, "SAME_STAGE", "Choose a different stage.");
        ensure(
          !["closed", "filled"].includes(job.state) || input.to === "rejected",
          "JOB_CLOSED",
          "This job is closed.",
        );
        ensure(
          candidate.stage !== "rejected" || ["applied", "screening"].includes(input.to),
          "INVALID_REOPEN",
          "Reopen into applied or screening.",
        );
        candidate.stage = input.to;
        candidate.stageChangedAt = now();
        candidate.rejectionReason = input.to === "rejected" ? input.reason : null;
        result = { id: candidate.id, stage: candidate.stage };
      }
      if (action === "note") {
        const input = z.object({ body: z.string().trim().min(2).max(1000) }).parse(body);
        ensure(self, "AUTHENTICATION_REQUIRED", "Sign in first.");
        candidate.notes.push({ id: newId("note"), author: personRef(self), body: input.body, at: now() });
      }
      if (action === "erase") {
        const view = candidateView(candidate, job, call);
        ensure(view.permissions.canErase, "ERASURE_BLOCKED", view.permissions.eraseBlockedReason ?? "Cannot erase.");
        candidate.name = "Erased candidate";
        candidate.email = null;
        candidate.phone = null;
        candidate.currentCompany = null;
        candidate.noticePeriodDays = null;
        candidate.currentCtc = null;
        candidate.expectedCtc = null;
        candidate.referrer = null;
        if (candidate.resumeFileId) {
          await repo.workspace().deleteFile(candidate.resumeFileId);
          await repo.workspace().remove(candidate.resumeFileId);
        }
        candidate.resume = null;
        candidate.resumeFileId = null;
        candidate.notes = [];
        candidate.interviews = [];
        candidate.offer = null;
        candidate.timeline = [];
        candidate.duplicateOf = null;
        candidate.rejectionReason = null;
        candidate.consentAt = null;
        candidate.erased = true;
        candidate.erasedAt = now();
        candidate.experienceYears = "0";
      }
      if (action === "interview") {
        const input = r.interviewInputSchema.parse(body);
        own(input.candidateId, candidate.id);
        ensure(
          ["applied", "screening", "interview"].includes(candidate.stage) && !["closed", "filled"].includes(job.state),
          "INTERVIEW_BLOCKED",
          "Candidate cannot be interviewed now.",
        );
        ensure(
          new Set(input.panelIds).size === input.panelIds.length,
          "DUPLICATE_PANELIST",
          "Choose distinct panelists.",
        );
        const start = zonedInstant(input.date, input.time);
        ensure(
          start.getTime() > Date.now() && input.date <= addDays(todayInOrgZone(), 60),
          "INVALID_SLOT",
          "Choose a future slot within 60 days.",
        );
        ensure(
          input.mode !== "online" || /^https:\/\/\S+$/.test(input.locationOrLink),
          "INVALID_LINK",
          "Online interviews require an HTTPS link.",
        );
        const end = start.getTime() + input.durationMinutes * 60000;
        const interviews = candidates.flatMap((c) => c.interviews);
        ensure(
          !interviews.some(
            (i) =>
              i.state === "scheduled" &&
              i.panel.some((p) => input.panelIds.includes(p.person.id)) &&
              start.getTime() < new Date(i.scheduledAt).getTime() + i.durationMinutes * 60000 &&
              new Date(i.scheduledAt).getTime() < end,
          ),
          "PANEL_CONFLICT",
          "A panelist already has an interview in that slot.",
        );
        const panel = await Promise.all(
          input.panelIds.map(async (id) => {
            const employee = await repo.person(id);
            ensure(employee.status !== "exited", "INACTIVE_PANELIST", "Choose active panelists.");
            return { person: personRef(employee), submitted: false };
          }),
        );
        const id = newId("int");
        const round = candidate.interviews.length + 1;
        candidate.interviews.push({
          id,
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateReference: candidate.reference,
          jobId: job.id,
          jobTitle: job.title,
          round,
          type: input.type,
          scheduledAt: start.toISOString(),
          durationMinutes: input.durationMinutes,
          mode: input.mode,
          locationOrLink: input.locationOrLink,
          panel,
          state: "scheduled",
          scorecards: [],
          feedbackHidden: false,
          isPanelist: false,
          myScorecardSubmitted: false,
          canSubmit: false,
          submitBlockedReason: null,
          candidateSummary: {
            experienceYears: candidate.experienceYears,
            currentCompany: candidate.currentCompany,
            resumeName: candidate.resume?.name ?? null,
          },
        });
        candidate.stage = "interview";
        candidate.stageChangedAt = now();
        for (const panelist of panel)
          await repo.notify(
            panelist.person.id,
            "Interview scheduled",
            `Interview for ${job.title} is scheduled.`,
            "/recruitment/interviews",
          );
        result = { id, round };
      }
      if (action === "scorecard") {
        const input = r.scorecardInputSchema.parse(body);
        own(input.interviewId, idOf(call, "interviewId"));
        const interview = requireValue(candidate.interviews.find((i) => i.id === input.interviewId));
        const visible = visibleInterview(interview, call);
        ensure(visible.canSubmit, "SCORECARD_BLOCKED", visible.submitBlockedReason ?? "Cannot submit.");
        ensure(self, "AUTHENTICATION_REQUIRED", "Sign in first.");
        interview.scorecards.push({
          panelist: personRef(self),
          ratings: r.scorecardCriteria.map((c) => ({ criterion: c.key, label: c.label, rating: input.ratings[c.key] })),
          average: (Object.values(input.ratings).reduce((n, v) => n + v, 0) / 5).toFixed(1),
          recommendation: input.recommendation,
          comments: input.comments,
          submittedAt: now(),
        });
        interview.panel = interview.panel.map((p) => ({ ...p, submitted: p.submitted || p.person.id === self.id }));
        if (interview.panel.every((p) => p.submitted)) interview.state = "completed";
        result = { id: interview.id, state: interview.state };
      }
      if (action === "offer") {
        const input = s.offerInput.parse(body);
        own(input.candidateId, candidate.id);
        ensure(
          ["interview", "offer"].includes(candidate.stage) &&
            !activeOffer(candidate) &&
            !["closed", "filled"].includes(job.state),
          "OFFER_BLOCKED",
          "Candidate cannot receive an offer now.",
        );
        ensure(
          input.joiningDate >= todayInOrgZone() &&
            input.joiningDate <= addDays(todayInOrgZone(), 180) &&
            paiseFromAmount(input.ctc) >= 10000000,
          "INVALID_OFFER_TERMS",
          "Check joining date and annual CTC.",
        );
        ensure(self, "AUTHENTICATION_REQUIRED", "Sign in first.");
        const manager = await repo.person(input.managerId);
        ensure(manager.status !== "exited", "INACTIVE_MANAGER", "Choose an active manager.");
        ensure(
          (await repo.departments()).some((d) => d.name === input.department) &&
            (await repo.locations()).some((l) => l.name === input.location),
          "INVALID_ORGANIZATION",
          "Select configured department and location.",
        );
        const overBudget = paiseFromAmount(input.ctc) > paiseFromAmount(job.ctcMax.amount);
        candidate.offer = {
          id: newId("offer"),
          reference: await repo.reference("OFF"),
          candidateId: candidate.id,
          candidateName: candidate.name,
          jobId: job.id,
          jobTitle: job.title,
          ctc: inr(paiseFromAmount(input.ctc)),
          budgetMax: job.ctcMax,
          overBudget,
          joiningDate: input.joiningDate,
          designation: input.designation,
          department: input.department,
          location: input.location,
          employmentType: job.employmentType,
          manager: personRef(manager),
          state: overBudget ? "pending_approval" : "extended",
          createdBy: personRef(self),
          createdAt: now(),
          approver: null,
          approvedAt: null,
          approvalNote: null,
          respondedAt: null,
          responseNote: null,
          employeeId: null,
          version: 1,
          canApprove: false,
        };
        candidate.stage = "offer";
        candidate.stageChangedAt = now();
        result = { reference: candidate.offer.reference, state: candidate.offer.state };
      }
      if (action === "offer_approval") {
        const input = s.decisionInput.parse(body);
        const offer = candidate.offer;
        ensure(offer && offer.state === "pending_approval", "OFFER_NOT_PENDING", "No pending approval exists.");
        ensure(self && offer.createdBy.id !== self.id, "SELF_APPROVAL", "An independent approver must decide.");
        offer.state = input.decision === "approve" ? "extended" : "approval_rejected";
        offer.approver = personRef(self);
        offer.approvedAt = now();
        offer.approvalNote = input.note;
        offer.version++;
        result = { reference: offer.reference, state: offer.state };
      }
      if (action === "offer_response") {
        const input = s.responseInput.parse(body);
        const offer = candidate.offer;
        ensure(offer && offer.state === "extended", "OFFER_NOT_EXTENDED", "Only extended offers can be responded to.");
        offer.state = input.response;
        offer.respondedAt = now();
        offer.responseNote = input.note;
        offer.version++;
        result = { reference: offer.reference, state: offer.state };
      }
      if (action === "convert") {
        const offer = candidate.offer;
        ensure(
          offer && offer.state === "accepted" && !candidate.employeeId && !offer.employeeId,
          "OFFER_NOT_CONVERTIBLE",
          "This offer is not eligible for conversion.",
        );
        ensure(
          candidates.filter((c) => c.jobId === job.id && c.stage === "hired").length < job.openings,
          "NO_OPENINGS",
          "All openings have been filled.",
        );
        const employee = await repo.convertEmployee({
          name: candidate.name,
          designation: offer.designation,
          department: offer.department,
          location: offer.location,
          managerId: offer.manager.id,
          joinedOn: offer.joiningDate,
          employmentType: offer.employmentType,
        });
        offer.employeeId = employee.employeeId;
        offer.version++;
        candidate.employeeId = employee.employeeId;
        candidate.stage = "hired";
        candidate.stageChangedAt = now();
        if (candidates.filter((c) => c.jobId === job.id && c.stage === "hired").length >= job.openings) {
          job.state = "filled";
          job.closedOn = todayInOrgZone();
          job.version++;
          await repo.save("job", r.jobDetailSchema, job, { state: job.state });
        }
        result = employee;
      }
      candidate.version++;
      candidate.timeline.push({
        id: newId("evt"),
        at: now(),
        actor: self?.name ?? "Applicant",
        title: action.replaceAll("_", " "),
        detail: null,
      });
      await repo.save("candidate", s.candidateRecord, candidate, { parentId: job.id, state: candidate.stage });
      return result;
    });
  }
  return { read, command };
}
