import { required } from "../time/time.service.js";
import type { PrismaClient, TimeWorkflow } from "@prisma/client";
import { z } from "zod";
import { newId } from "../../core/database/ids.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can } from "../../core/security/actor.js";
import { employeeScopeWhere, hasAdministrativeReach, isOrgWide, requireOrgWide } from "../../core/security/scope.js";
import { addDays, daysBetween, todayInOrgZone, toIsoDate } from "../../utils/date.js";
import {
  type LeaveOverview,
  type LeaveLedger,
  type CompOffClaim,
  type Encashment,
  type YearEnd,
  type YearEndRow,
  leaveRequestInputSchema,
  compOffClaimInputSchema,
  encashInputSchema,
  balanceAdjustmentInputSchema,
  yearEndSchema,
} from "../../contracts/leave.js";
import { type LeaveTypeConfig } from "../../contracts/hr-config.js";
import {
  createTimeRepository,
  timeCommand,
  json,
  type CommandContext,
  type TimeRepository,
} from "../time/time.repository.js";
import {
  calendarDay,
  canDecide,
  clockTime,
  requireAdministers,
  datesBetween,
  decimal,
  employeeOf,
  employeeCalendar,
  fail,
  holidaysFor,
  leaveBalance,
  money,
  monthDates,
  personRef,
  policyTypes,
  policyVersion,
  requireDecision,
  requireOwner,
  requirePending,
  scopedPeople,
  workflowOf,
} from "../time/time.service.js";
import { compOffPayload, encashPayload, leavePayload, leaveEligibilityBody } from "../time/time.schema.js";
import { provisionLeaveEntitlements } from "../time/time.service.js";
export const leaveBody = leaveRequestInputSchema.safeExtend({
  attachmentName: z.string().max(200).nullable().default(null),
});
async function eligibleType(repo: TimeRepository, employeeId: string, type: LeaveTypeConfig, startDate: string) {
  const e = await employeeOf(repo, employeeId);
  if (!type.active || !type.employmentTypes.includes(e.employmentType))
    fail("INELIGIBLE_LEAVE_TYPE", "This leave type is not available for your employment type.");
  if (daysBetween(toIsoDate(e.joinedOn), startDate) < type.minServiceDays)
    fail("INSUFFICIENT_SERVICE", "You have not completed the required service period.");
  if (type.afterProbationOnly) {
    const setting = await repo.organizationSetting("probation_defaults"),
      months = setting ? (z.record(z.string(), z.number()).parse(setting.value)[e.employmentType] ?? 6) : 6;
    const ends = new Date(e.joinedOn);
    ends.setUTCMonth(ends.getUTCMonth() + months);
    if (startDate < toIsoDate(ends)) fail("PROBATION_RESTRICTION", "This leave type is available after probation.");
  }
  if (type.gender !== "any") {
    const profile = await repo.document(`time_profile:${employeeId}`);
    const gender = profile ? z.object({ gender: z.string() }).parse(profile.payload).gender : null;
    if (gender !== type.gender) fail("INELIGIBLE_LEAVE_TYPE", "Ask HR to verify your eligibility for this leave type.");
  }
}
async function leaveDto(repo: TimeRepository, row: TimeWorkflow) {
  const p = leavePayload.parse(row.payload),
    type = (await policyTypes(repo)).find((t) => t.id === p.leaveTypeId),
    approver = row.approverId ? await repo.employee(row.approverId) : null;
  return {
    id: row.id,
    reference: row.reference,
    leaveType: type?.name ?? p.leaveTypeId,
    leaveTypeCode: type?.code ?? "",
    startDate: p.startDate,
    endDate: p.endDate,
    units: decimal(p.units),
    reason: p.reason,
    state: z.enum(["pending", "approved", "rejected", "cancelled"]).parse(row.state),
    submittedAt: row.createdAt.toISOString(),
    approver: approver ? personRef(approver) : null,
    decisionNote: row.decisionNote,
    canCancel: ["pending", "approved"].includes(row.state) && p.startDate >= todayInOrgZone(),
    version: row.version,
  };
}
async function perDay(repo: TimeRepository, employeeId: string) {
  const salary = await repo.salary(employeeId);
  if (salary) {
    const paise = (salary.annualPaise + 156n) / 312n;
    return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
  }
  const doc = await repo.document(`leave_salary:${employeeId}`);
  if (!doc) fail("SALARY_NOT_CONFIGURED", "Payroll must configure a salary before encashment.", 409);
  return z.object({ perDay: z.string().regex(/^\d+(\.\d{1,2})?$/) }).parse(doc.payload).perDay;
}
async function encashOptions(repo: TimeRepository, employeeId: string) {
  const result = [];
  for (const t of (await policyTypes(repo)).filter((t) => t.active && t.encashable)) {
    const balance = await leaveBalance(repo, employeeId, t.id),
      requests = await repo.workflows({
        kind: "encashment",
        employeeId,
        state: { in: ["pending", "approved"] },
        createdAt: { gte: new Date(`${todayInOrgZone().slice(0, 4)}-01-01`) },
      });
    const taken = requests.reduce((sum, r) => {
        const p = encashPayload.parse(r.payload);
        return sum + (p.leaveTypeId === t.id ? p.days : 0);
      }, 0),
      remaining = Math.max(0, Number(t.maxEncashDays) - taken);
    result.push({
      leaveTypeId: t.id,
      name: t.name,
      available: balance.available,
      retain: t.minRetainDays,
      remainingThisYear: decimal(remaining),
      maxNow: decimal(Math.max(0, Math.min(remaining, Number(balance.available) - Number(t.minRetainDays)))),
      perDay: money(await perDay(repo, employeeId)),
    });
  }
  return result;
}
export function createLeaveService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  return {
    async eligibility(ctx: CommandContext, employeeId: string) {
      await requireAdministers(repo, ctx.actor, "employee.update", employeeId);
      const record = await repo.document(`time_profile:${employeeId}`);
      return {
        employeeId,
        gender: record
          ? z.object({ gender: leaveEligibilityBody.shape.gender }).parse(record.payload).gender
          : "unspecified",
        version: record?.version ?? 0,
      };
    },
    saveEligibility(ctx: CommandContext, employeeId: string, input: z.infer<typeof leaveEligibilityBody>) {
      return timeCommand(prisma, ctx, `leave.eligibility.${employeeId}.verify`, async (r) => {
        await requireAdministers(r, ctx.actor, "employee.update", employeeId);
        const id = `time_profile:${employeeId}`,
          previous = await r.document(id);
        assertVersion(previous?.version ?? 0, ctx.version ?? input.version);
        const record = await r.saveDocument(
          id,
          "time_profile",
          {
            gender: input.gender,
            note: input.note,
            verifiedBy: ctx.actor.employeeId,
            verifiedAt: new Date().toISOString(),
          },
          employeeId,
        );
        return { employeeId, gender: input.gender, version: record.version };
      });
    },
    async overview(ctx: CommandContext): Promise<LeaveOverview> {
      const year = todayInOrgZone().slice(0, 4),
        version = await policyVersion(repo);
      await timeCommand(
        prisma,
        { ...ctx, key: `leave-entitlements:${year}:${version}` },
        `leave.entitlements.${year}.${version}`,
        async (r) => {
          await provisionLeaveEntitlements(r, ctx.actor.employeeId, year);
          return { ok: true };
        },
      );
      const e = await employeeOf(repo, ctx.actor.employeeId),
        types = (await policyTypes(repo)).filter((t) => t.active && t.employmentTypes.includes(e.employmentType));
      return {
        balances: await Promise.all(types.map((t) => leaveBalance(repo, e.id, t.id))),
        types: types.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          description: t.description,
          allowHalfDay: t.allowHalfDay,
          requiresAttachment: t.documentAfterDays === 0,
          minNoticeDays: t.minNoticeDays,
          backdateDays: t.backdateDays,
          maxConsecutiveDays: t.maxConsecutiveDays,
          sandwich: t.sandwich,
          documentAfterDays: t.documentAfterDays,
          negativeDays: t.negativeDays,
          rules: [
            `Request ${t.minNoticeDays} days in advance`,
            ...(t.sandwich ? ["Intervening holidays and weekly offs are included"] : []),
          ],
        })),
        requests: await Promise.all(
          (await repo.workflows({ employeeId: e.id, kind: "leave" })).map((r) => leaveDto(repo, r)),
        ),
        holidays: await holidaysFor(repo, e.id),
        approverPath: e.manager ? [personRef(e.manager)] : [],
      };
    },
    submit(ctx: CommandContext, input: z.infer<typeof leaveBody>) {
      return timeCommand(prisma, ctx, "leave.request.create", async (r, reference) => {
        if (await r.document(`year_end:${input.startDate.slice(0, 4)}`))
          fail("POLICY_YEAR_CLOSED", "This policy year has already been closed.", 409);
        await provisionLeaveEntitlements(r, ctx.actor.employeeId, todayInOrgZone().slice(0, 4));
        const type =
            (await policyTypes(r)).find((t) => t.id === input.leaveTypeId) ??
            fail("INVALID_LEAVE_TYPE", "Choose a valid leave type."),
          today = todayInOrgZone(),
          e = await employeeOf(r, ctx.actor.employeeId);
        await eligibleType(r, e.id, type, input.startDate);
        if (!e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        if (
          input.startDate.slice(0, 4) !== input.endDate.slice(0, 4) ||
          input.startDate.slice(0, 4) !== today.slice(0, 4)
        )
          fail("POLICY_YEAR", "Apply within the current policy year.");
        const notice = daysBetween(today, input.startDate);
        if (notice >= 0 && notice < type.minNoticeDays)
          fail("INSUFFICIENT_NOTICE", `This leave needs ${type.minNoticeDays} days notice.`);
        if (notice < 0 && -notice > type.backdateDays)
          fail("BACKDATE_LIMIT", "This request exceeds the backdating limit.");
        if (input.portion !== "full" && (!type.allowHalfDay || input.startDate !== input.endDate))
          fail("INVALID_HALF_DAY", "Half-day requests must cover one eligible date.");
        const dates = datesBetween(input.startDate, input.endDate),
          calendar = await employeeCalendar(r, e.id, input.startDate, input.endDate),
          chargeDates = dates.filter((date) => {
            const day = required(calendar.get(date));
            return type.sandwich || (!day.off && !day.holiday);
          }),
          units = chargeDates.length;
        const charge = input.portion === "full" ? units : units / 2;
        if (charge <= 0) fail("NO_WORKING_DAYS", "The selected dates contain no working days.");
        if (type.maxConsecutiveDays !== null && charge > type.maxConsecutiveDays)
          fail("CONSECUTIVE_LIMIT", `This type allows ${type.maxConsecutiveDays} consecutive days.`);
        if (type.documentAfterDays !== null && charge > type.documentAfterDays && !input.attachmentName)
          fail("DOCUMENT_REQUIRED", "Attach the supporting document required by this policy.");
        const overlaps = await r.workflows({
          kind: "leave",
          employeeId: e.id,
          state: { in: ["pending", "approved"] },
          startDate: { lte: input.endDate },
          endDate: { gte: input.startDate },
        });
        if (
          overlaps.some((row) => {
            const p = leavePayload.parse(row.payload);
            return p.portion === "full" || input.portion === "full" || p.portion === input.portion;
          })
        )
          fail("OVERLAPPING_LEAVE", "You already have leave for these dates.", 409);
        const balance = await leaveBalance(r, e.id, type.id);
        if (type.entitledDays !== null && Number(balance.available) + Number(type.negativeDays) < charge)
          fail("INSUFFICIENT_BALANCE", "There is not enough available leave balance.");
        const ref = await reference("LV");
        await r.createWorkflow({
          id: newId("lv"),
          reference: ref,
          kind: "leave",
          employeeId: e.id,
          approverId: e.managerId,
          startDate: input.startDate,
          endDate: input.endDate,
          payload: json({ ...input, units: charge, chargeDates, policyVersion: await policyVersion(r) }),
        });
        await r.notify(e.managerId, "Leave approval requested", `${e.name} submitted ${ref}.`, "/approvals");
        return { reference: ref, units: decimal(charge), state: "pending" };
      });
    },
    cancel(ctx: CommandContext, id: string) {
      return timeCommand(prisma, ctx, `leave.request.${id}.cancel`, async (r) => {
        const row = await workflowOf(r, id, "leave");
        requireOwner(ctx.actor, row);
        assertVersion(row.version, ctx.version);
        if (!["pending", "approved"].includes(row.state))
          fail("ALREADY_CLOSED", "This request cannot be cancelled.", 409);
        const p = leavePayload.parse(row.payload);
        if (p.startDate < todayInOrgZone())
          fail("LEAVE_STARTED", "Ask HR to correct leave that has already started.", 409);
        if (row.state === "approved")
          await r.addLedger({
            id: newId("lg"),
            employeeId: row.employeeId,
            leaveTypeId: p.leaveTypeId,
            date: todayInOrgZone(),
            kind: "adjustment",
            units: p.units,
            reference: `CANCEL-${row.reference}`,
            note: "Approved leave cancelled",
            actorId: ctx.actor.employeeId,
          });
        await r.updateWorkflow(id, { state: "cancelled", version: { increment: 1 } });
        return { reference: row.reference, state: "cancelled" };
      });
    },
    async calendar(ctx: CommandContext, month: string) {
      const people = await scopedPeople(repo, ctx.actor, true),
        ids = people.map((e) => e.id),
        dates = monthDates(month),
        rows = await repo.workflows({
          kind: "leave",
          employeeId: { in: ids },
          state: { in: ["pending", "approved"] },
          startDate: { lte: required(dates.at(-1)) },
          endDate: { gte: required(dates[0]) },
        }),
        types = await policyTypes(repo),
        holidays = await holidaysFor(repo, ctx.actor.employeeId);
      return {
        month,
        scope: can(ctx.actor, "attendance.read.team") ? "reports" : "team",
        days: dates.map((date) => ({
          date,
          holiday: holidays.find((h) => h.date === date)?.name ?? null,
          away: rows
            .filter((r) => required(r.startDate) <= date && required(r.endDate) >= date)
            .map((row) => {
              const p = leavePayload.parse(row.payload);
              return {
                person: personRef(required(people.find((e) => e.id === row.employeeId))),
                leaveType: types.find((t) => t.id === p.leaveTypeId)?.name ?? p.leaveTypeId,
                state: row.state,
                half: p.portion !== "full",
              };
            }),
        })),
      };
    },
    holidays: (ctx: CommandContext) => holidaysFor(repo, ctx.actor.employeeId),
    async ledger(ctx: CommandContext, employeeId?: string, year?: string): Promise<LeaveLedger> {
      const id = employeeId ?? ctx.actor.employeeId;
      if (id !== ctx.actor.employeeId) {
        if (!hasAdministrativeReach(ctx.actor, "employee.update"))
          fail("FORBIDDEN", "Only HR can read another employee's ledger.", 403);
        await requireAdministers(repo, ctx.actor, "employee.update", id);
      }
      const e = await employeeOf(repo, id),
        selected = year ?? todayInOrgZone().slice(0, 4),
        types = await policyTypes(repo),
        entries = await repo.ledger(id);
      return {
        employee: personRef(e),
        year: selected,
        types: await Promise.all(
          types.map(async (t) => {
            let total = 0;
            const items = entries
              .filter((e) => e.leaveTypeId === t.id && e.date.startsWith(selected))
              .map((row) => {
                total += Number(row.units);
                return {
                  id: row.id,
                  date: row.date,
                  kind: z
                    .enum([
                      "opening",
                      "credit",
                      "accrual",
                      "availed",
                      "encashed",
                      "lapsed",
                      "carry_forward",
                      "adjustment",
                    ])
                    .parse(row.kind),
                  units: decimal(Number(row.units)),
                  balance: decimal(total),
                  note: row.note,
                  by: row.actorId,
                  reference: row.reference,
                  scheduled: row.date > todayInOrgZone(),
                };
              });
            return {
              leaveTypeId: t.id,
              name: t.name,
              code: t.code,
              balance: (
                await leaveBalance(
                  repo,
                  id,
                  t.id,
                  selected === todayInOrgZone().slice(0, 4) ? todayInOrgZone() : `${selected}-12-31`,
                )
              ).available,
              entries: items,
            };
          }),
        ),
      };
    },
    async people(ctx: CommandContext) {
      if (!hasAdministrativeReach(ctx.actor, "employee.update"))
        fail("FORBIDDEN", "You don't have access to this.", 403);
      return (await repo.people(employeeScopeWhere(ctx.actor, "employee.update"))).map(personRef);
    },
    adjust(ctx: CommandContext, input: z.infer<typeof balanceAdjustmentInputSchema>) {
      return timeCommand(prisma, ctx, "leave.balance.adjust", async (r, reference) => {
        await requireAdministers(r, ctx.actor, "employee.update", input.employeeId);
        const balance = await leaveBalance(r, input.employeeId, input.leaveTypeId),
          units = Number(input.days) * (input.direction === "debit" ? -1 : 1);
        if (Number(balance.available) + units < 0)
          fail("INSUFFICIENT_BALANCE", "The adjustment would make available balance negative.");
        const ref = await reference("LA");
        await r.addLedger({
          id: newId("lg"),
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          date: todayInOrgZone(),
          kind: "adjustment",
          units,
          reference: ref,
          note: input.reason,
          actorId: ctx.actor.employeeId,
        });
        return { reference: ref, balance: decimal(Number(balance.available) + units) };
      });
    },
    async compOff(ctx: CommandContext) {
      const today = todayInOrgZone(),
        types = await policyTypes(repo),
        co = types.find((t) => t.code === "CO"),
        people = await scopedPeople(repo, ctx.actor),
        claims = await repo.workflows({ kind: "comp_off", employeeId: { in: people.map((e) => e.id) } }),
        mine = claims.filter((c) => c.employeeId === ctx.actor.employeeId),
        eligible = [];
      for (const p of await repo.attendanceDays(ctx.actor.employeeId, addDays(today, -30), today)) {
        const cal = await calendarDay(repo, ctx.actor.employeeId, p.date);
        if (
          (cal.off || cal.holiday) &&
          p.workedMinutes >= 240 &&
          !mine.some((c) => c.startDate === p.date && ["pending", "approved"].includes(c.state))
        )
          eligible.push({
            date: p.date,
            dayKind: cal.holiday ?? "Weekly off",
            workedMinutes: p.workedMinutes,
            punches: `${clockTime(p.firstIn) ?? "—"} – ${clockTime(p.lastOut) ?? "—"}`,
            maxPortion: p.workedMinutes >= 480 ? "full" : "half",
          });
      }
      const balance = co ? await leaveBalance(repo, ctx.actor.employeeId, co.id) : null,
        encashments = await repo.workflows({
          kind: "encashment",
          ...(isOrgWide(ctx.actor, "employee.update")
            ? {}
            : {
                employeeId: {
                  in: hasAdministrativeReach(ctx.actor, "employee.update")
                    ? [
                        ctx.actor.employeeId,
                        ...(await repo.people(employeeScopeWhere(ctx.actor, "employee.update"))).map((e) => e.id),
                      ]
                    : [ctx.actor.employeeId],
                },
              }),
        });
      return {
        today,
        expiryDays: co?.expiryDays ?? 60,
        claimWindowDays: 30,
        balance: balance?.available ?? "0.00",
        nextExpiry: balance?.nextExpiry ?? null,
        eligibleDays: eligible,
        mine: await Promise.all(mine.map((c) => compOffDto(repo, ctx, c))),
        team: await Promise.all(
          claims.filter((c) => c.employeeId !== ctx.actor.employeeId).map((c) => compOffDto(repo, ctx, c)),
        ),
        encashOptions: await encashOptions(repo, ctx.actor.employeeId),
        encashments: await Promise.all(
          encashments.filter((e) => e.employeeId === ctx.actor.employeeId).map((e) => encashDto(repo, ctx, e)),
        ),
        encashQueue: hasAdministrativeReach(ctx.actor, "employee.update")
          ? await Promise.all(
              encashments.filter((e) => e.employeeId !== ctx.actor.employeeId).map((e) => encashDto(repo, ctx, e)),
            )
          : null,
        payrollMonth: today.slice(0, 7),
      };
    },
    claim(ctx: CommandContext, input: z.infer<typeof compOffClaimInputSchema>) {
      return timeCommand(prisma, ctx, "leave.comp_off.create", async (r, reference) => {
        const today = todayInOrgZone();
        if (input.workedDate >= today || daysBetween(input.workedDate, today) > 30)
          fail("CLAIM_WINDOW", "Claim completed work within the last 30 days.");
        const e = await employeeOf(r, ctx.actor.employeeId),
          p = await r.attendance(e.id, input.workedDate),
          cal = await calendarDay(r, e.id, input.workedDate);
        if (!e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        if (!cal.off && !cal.holiday) fail("NOT_OFF_DAY", "Comp-off requires work on a holiday or weekly off.");
        if (!p || p.workedMinutes < (input.portion === "full" ? 480 : 240))
          fail("INSUFFICIENT_WORK", "Recorded working time is insufficient for this claim.");
        if (
          (
            await r.workflows({
              kind: "comp_off",
              employeeId: e.id,
              startDate: input.workedDate,
              state: { in: ["pending", "approved"] },
            })
          ).length
        )
          fail("DUPLICATE_CLAIM", "This date has already been claimed.", 409);
        const ref = await reference("CO");
        await r.createWorkflow({
          id: newId("co"),
          reference: ref,
          kind: "comp_off",
          employeeId: e.id,
          approverId: e.managerId,
          startDate: input.workedDate,
          endDate: input.workedDate,
          payload: json({
            ...input,
            units: input.portion === "full" ? 1 : 0.5,
            workedMinutes: p.workedMinutes,
            punches: `${clockTime(p.firstIn)} – ${clockTime(p.lastOut)}`,
            dayKind: cal.holiday ?? "Weekly off",
            expiresOn: null,
          }),
        });
        return { reference: ref, state: "pending" };
      });
    },
    encash(ctx: CommandContext, input: z.infer<typeof encashInputSchema>) {
      return timeCommand(prisma, ctx, "leave.encashment.create", async (r, reference) => {
        const option = (await encashOptions(r, ctx.actor.employeeId)).find((o) => o.leaveTypeId === input.leaveTypeId);
        if (!option || input.days > Number(option.maxNow))
          fail("ENCASHMENT_LIMIT", "The requested days exceed your encashment limit or retained balance.");
        const type = required((await policyTypes(r)).find((t) => t.id === input.leaveTypeId));
        await eligibleType(r, ctx.actor.employeeId, type, todayInOrgZone());
        const ref = await reference("EN"),
          amount = decimal(Number(option.perDay.amount) * input.days);
        await r.createWorkflow({
          id: newId("enc"),
          reference: ref,
          kind: "encashment",
          employeeId: ctx.actor.employeeId,
          payload: json({
            ...input,
            amount,
            perDay: option.perDay.amount,
            payrollMonth: todayInOrgZone().slice(0, 7),
            source: "request",
          }),
        });
        return { reference: ref, amount };
      });
    },
    decision(
      ctx: CommandContext,
      id: string,
      kind: "comp_off" | "encashment",
      decision: "approve" | "reject",
      note: string,
    ) {
      return timeCommand(prisma, ctx, `${kind}.${id}.${decision}`, async (r) => {
        const row = await workflowOf(r, id, kind);
        await requireDecision(r, ctx.actor, row);
        requirePending(row);
        assertVersion(row.version, ctx.version);
        let payload = json(row.payload);
        if (decision === "approve") {
          if (kind === "comp_off") {
            const p = compOffPayload.parse(row.payload),
              type =
                (await policyTypes(r)).find((t) => t.code === "CO") ??
                fail("NO_COMP_OFF_TYPE", "Configure the comp-off leave type first.", 409),
              expiresOn = addDays(todayInOrgZone(), type.expiryDays ?? 60);
            payload = json({ ...p, expiresOn });
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.employeeId,
              leaveTypeId: type.id,
              date: todayInOrgZone(),
              kind: "credit",
              units: p.units,
              reference: row.reference,
              note: p.reason,
              expiresOn,
              actorId: ctx.actor.employeeId,
            });
          } else {
            const p = encashPayload.parse(row.payload),
              balance = await leaveBalance(r, row.employeeId, p.leaveTypeId);
            if (Number(balance.available) < 0) fail("INSUFFICIENT_BALANCE", "Balance changed before approval.", 409);
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.employeeId,
              leaveTypeId: p.leaveTypeId,
              date: todayInOrgZone(),
              kind: "encashed",
              units: -p.days,
              reference: row.reference,
              note: p.reason || "Leave encashment",
              actorId: ctx.actor.employeeId,
            });
          }
        }
        const state = decision === "approve" ? "approved" : "rejected";
        await r.updateWorkflow(id, {
          state,
          payload,
          version: { increment: 1 },
          decidedAt: new Date(),
          decidedBy: ctx.actor.employeeId,
          decisionNote: note,
        });
        return { reference: row.reference, state };
      });
    },
    cancelOther: (ctx: CommandContext, id: string, kind: "comp_off" | "encashment") =>
      timeCommand(prisma, ctx, `${kind}.${id}.cancel`, async (r) => {
        const row = await workflowOf(r, id, kind);
        requireOwner(ctx.actor, row);
        requirePending(row);
        await r.updateWorkflow(id, { state: "cancelled", version: { increment: 1 } });
        return { reference: row.reference, state: "cancelled" };
      }),
    // Year-end closing runs over the whole organization: organization-level (BE-003).
    yearEnd: async (ctx: CommandContext) => {
      requireOrgWide(ctx.actor, "employee.update");
      return yearEndView(repo, todayInOrgZone().slice(0, 4));
    },
    commitYear(ctx: CommandContext, year: string) {
      requireOrgWide(ctx.actor, "employee.update");
      return timeCommand(prisma, ctx, `leave.year_end.${year}`, async (r) => {
        if (year !== todayInOrgZone().slice(0, 4)) fail("INVALID_YEAR", "Only the current policy year can be closed.");
        if (await r.document(`year_end:${year}`))
          fail("YEAR_ALREADY_CLOSED", "The year-end has already been committed.", 409);
        if ((await r.workflows({ kind: { in: ["leave", "encashment", "comp_off"] }, state: "pending" })).length)
          fail(
            "PENDING_REQUESTS",
            "Resolve all pending leave, comp-off and encashment requests before closing the year.",
            409,
          );
        const preview = await yearEndView(r, year),
          types = await policyTypes(r),
          next = `${Number(year) + 1}-01-01`;
        for (const row of preview.rows) {
          const type = required(types.find((t) => t.name === row.leaveType));
          if (Number(row.closing) - Number(row.encash) !== 0)
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.person.id,
              leaveTypeId: type.id,
              date: `${year}-12-31`,
              kind: "lapsed",
              units: -(Number(row.closing) - Number(row.encash)),
              reference: `YE-${year}`,
              note: "Year-end closing",
              actorId: ctx.actor.employeeId,
            });
          if (Number(row.encash) > 0) {
            const reference = `YE-${year}-${row.person.id}-${type.code}`,
              id = newId("enc");
            await r.createWorkflow({
              id,
              reference,
              kind: "encashment",
              employeeId: row.person.id,
              state: "approved",
              decidedAt: new Date(),
              decidedBy: ctx.actor.employeeId,
              decisionNote: "Year-end policy encashment",
              payload: json({
                leaveTypeId: type.id,
                days: Number(row.encash),
                amount: row.encashAmount.amount,
                perDay: await perDay(r, row.person.id),
                payrollMonth: `${Number(year) + 1}-01`,
                source: "year_end",
                reason: `Year-end ${year} auto-encashment`,
              }),
            });
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.person.id,
              leaveTypeId: type.id,
              date: `${year}-12-31`,
              kind: "encashed",
              units: -Number(row.encash),
              reference,
              note: "Year-end policy encashment",
              actorId: ctx.actor.employeeId,
            });
          }
          if (Number(row.carryForward) !== 0)
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.person.id,
              leaveTypeId: type.id,
              date: next,
              kind: "carry_forward",
              units: Number(row.carryForward),
              reference: `YE-${year}`,
              note: "Year-end carry forward",
              actorId: ctx.actor.employeeId,
            });
        }
        const by = (await employeeOf(r, ctx.actor.employeeId)).name;
        await r.saveDocument(`year_end:${year}`, "year_end", {
          ...preview,
          state: "committed",
          lastRun: {
            year,
            at: new Date().toISOString(),
            by,
            rows: preview.rows.length,
            carryForward: preview.totals.carryForward,
            encash: preview.totals.encash,
            lapse: preview.totals.lapse,
          },
        });
        return { year, rows: preview.rows.length };
      });
    },
    async whoIsOut(ctx: CommandContext) {
      const today = todayInOrgZone(),
        people = await scopedPeople(repo, ctx.actor, true),
        rows = await repo.workflows({
          kind: "leave",
          state: "approved",
          employeeId: { in: people.map((e) => e.id) },
          endDate: { gte: today },
          startDate: { lte: addDays(today, 7) },
        }),
        types = await policyTypes(repo);
      const items = rows.map((r) => {
        const p = leavePayload.parse(r.payload);
        return {
          person: personRef(required(people.find((e) => e.id === r.employeeId))),
          leaveType: types.find((t) => t.id === p.leaveTypeId)?.name ?? p.leaveTypeId,
          from: p.startDate,
          to: p.endDate,
        };
      });
      return {
        scope: isOrgWide(ctx.actor, "employee.read")
          ? "organization"
          : hasAdministrativeReach(ctx.actor, "employee.read")
            ? "department"
            : can(ctx.actor, "attendance.read.team")
              ? "team"
              : "department",
        today: items
          .filter((r) => r.from <= today)
          .map((r) => ({ person: r.person, leaveType: r.leaveType, until: r.to })),
        upcoming: items.filter((r) => r.from > today),
      };
    },
  };
}
async function compOffDto(repo: TimeRepository, ctx: CommandContext, row: TimeWorkflow): Promise<CompOffClaim> {
  const p = compOffPayload.parse(row.payload),
    approver = row.approverId ? await repo.employee(row.approverId) : null;
  return {
    id: row.id,
    reference: row.reference,
    person: personRef(await employeeOf(repo, row.employeeId)),
    workedDate: p.workedDate,
    dayKind: p.dayKind,
    portion: p.portion,
    units: decimal(p.units),
    workedMinutes: p.workedMinutes,
    punches: p.punches,
    reason: p.reason,
    state: z.enum(["pending", "approved", "rejected", "cancelled"]).parse(row.state),
    submittedAt: row.createdAt.toISOString(),
    approver: approver ? personRef(approver) : null,
    decisionNote: row.decisionNote,
    expiresOn: p.expiresOn,
    credit: row.state === "approved" ? (p.expiresOn && p.expiresOn < todayInOrgZone() ? "lapsed" : "active") : null,
    canDecide: row.state === "pending" && (await canDecide(repo, ctx.actor, row)),
    canCancel: row.state === "pending" && row.employeeId === ctx.actor.employeeId,
    version: row.version,
  };
}
async function encashDto(repo: TimeRepository, ctx: CommandContext, row: TimeWorkflow): Promise<Encashment> {
  const p = encashPayload.parse(row.payload),
    type = (await policyTypes(repo)).find((t) => t.id === p.leaveTypeId);
  return {
    id: row.id,
    reference: row.reference,
    person: personRef(await employeeOf(repo, row.employeeId)),
    leaveType: type?.name ?? p.leaveTypeId,
    units: decimal(p.days),
    perDay: money(p.perDay),
    amount: money(p.amount),
    payrollMonth: p.payrollMonth,
    source: p.source,
    reason: p.reason,
    state: z.enum(["pending", "approved", "rejected", "cancelled"]).parse(row.state),
    submittedAt: row.createdAt.toISOString(),
    decidedBy: row.decidedBy ? (await employeeOf(repo, row.decidedBy)).name : null,
    decisionNote: row.decisionNote,
    canDecide: row.state === "pending" && (await canDecide(repo, ctx.actor, row)),
    canCancel: row.state === "pending" && row.employeeId === ctx.actor.employeeId,
    version: row.version,
  };
}
async function yearEndView(repo: TimeRepository, year: string): Promise<YearEnd> {
  const existing = await repo.document(`year_end:${year}`);
  if (existing) return yearEndSchema.parse(existing.payload);
  const people = await repo.people(),
    types = (await policyTypes(repo)).filter((t) => t.active && t.entitledDays !== null),
    rows: YearEndRow[] = [];
  for (const e of people)
    for (const t of types) {
      if (!t.employmentTypes.includes(e.employmentType)) continue;
      const balance = await leaveBalance(repo, e.id, t.id, `${year}-12-31`),
        closing = Number(balance.available),
        carry = closing < 0 ? closing : Math.min(closing, Number(t.carryForwardDays));
      const taken = (await repo.ledger(e.id, t.id))
          .filter((e) => e.kind === "encashed" && e.date.startsWith(year))
          .reduce((sum, e) => sum - Number(e.units), 0),
        encash = t.encashable ? Math.floor(Math.max(0, Math.min(closing - carry, Number(t.maxEncashDays) - taken))) : 0;
      rows.push({
        person: personRef(e),
        department: e.department.name,
        leaveType: t.name,
        closing: decimal(closing),
        carryForward: decimal(carry),
        encash: decimal(encash),
        encashAmount: money(encash > 0 ? encash * Number(await perDay(repo, e.id)) : 0),
        lapse: decimal(closing - carry - encash),
      });
    }
  return {
    year,
    asOf: `${year}-12-31`,
    state: "preview",
    rows,
    totals: {
      carryForward: decimal(rows.reduce((s, r) => s + Number(r.carryForward), 0)),
      encash: decimal(rows.reduce((sum, row) => sum + Number(row.encash), 0)),
      encashAmount: money(rows.reduce((sum, row) => sum + Number(row.encashAmount.amount), 0)),
      lapse: decimal(rows.reduce((s, r) => s + Number(r.lapse), 0)),
      employees: people.length,
    },
    lastRun: null,
    audit: [],
  };
}
