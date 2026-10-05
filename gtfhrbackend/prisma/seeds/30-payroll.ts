import { z } from "zod";
import type { SeedContext } from "./context.js";
import { encrypt } from "../../src/core/security/encryption.js";
import { fromIsoDate, todayInOrgZone } from "../../src/utils/date.js";
import { fiscalYear, loadPolicy } from "../../src/modules/payroll/payroll.rules.js";
import { createPayrollRepository } from "../../src/modules/payroll/payroll.repository.js";
import { json, persistCalculation } from "../../src/modules/payroll/payroll.service.js";

/** Synthetic development fixture only. Never approves the policy for production. */
export default async function seed(ctx: SeedContext) {
  const { prisma, data } = ctx;
  const today = todayInOrgZone();
  const fy = fiscalYear(today.slice(0, 7));
  const settings = z.record(z.string(), z.unknown()).parse(data.statSettings);
  const taxNew = {
    standardDeductionPaise: 7500000,
    slabs: [
      { upToPaise: 40000000, rateBps: 0 },
      { upToPaise: 80000000, rateBps: 500 },
      { upToPaise: 120000000, rateBps: 1000 },
      { upToPaise: 160000000, rateBps: 1500 },
      { upToPaise: 200000000, rateBps: 2000 },
      { upToPaise: 240000000, rateBps: 2500 },
      { upToPaise: null, rateBps: 3000 },
    ],
    rebateLimitPaise: 120000000,
    rebateMaxPaise: 6000000,
  };
  const taxOld = {
    standardDeductionPaise: 5000000,
    slabs: [
      { upToPaise: 25000000, rateBps: 0 },
      { upToPaise: 50000000, rateBps: 500 },
      { upToPaise: 100000000, rateBps: 2000 },
      { upToPaise: null, rateBps: 3000 },
    ],
    rebateLimitPaise: 50000000,
    rebateMaxPaise: 1250000,
  };
  const policy = loadPolicy({
    ...settings,
    policyLabel: "Synthetic development policy; Finance must configure and approve production rates",
    approvedForProduction: false,
    financialYears: [fy.key, `${fy.start - 1}-${String(fy.start).slice(-2)}`],
    tax: { new: taxNew, old: taxOld },
    hra: { rentBaseBps: 1000, metroLimitBps: 5000, nonMetroLimitBps: 4000 },
    rates: {
      pfEmployeeBps: 1200,
      pfEmployerBps: 1200,
      epsBps: 833,
      edliBps: 50,
      pfAdminBps: 50,
      esiEmployeeBps: 75,
      esiEmployerBps: 325,
      gratuityBps: 481,
      cessBps: 400,
      panMissingBps: 2000,
    },
    dueDays: { epf: 15, esi: 15, tds: 7, tdsReturn: 28 },
    declarationWindow: {
      opensOn: `${fy.start}-04-01`,
      closesOn: `${fy.start + 1}-03-31`,
      proofOpensOn: `${fy.start + 1}-01-01`,
      proofClosesOn: `${fy.start + 1}-02-28`,
    },
    declarationSections: [
      {
        code: "80C",
        name: "Section 80C investments",
        limitPaise: 15000000,
        oldRegimeOnly: true,
        items: [
          { id: "80c_ppf", name: "Public Provident Fund" },
          { id: "80c_elss", name: "ELSS funds" },
          { id: "80c_lic", name: "Life insurance" },
          { id: "80c_tuition", name: "Tuition fees" },
          { id: "80c_hlp", name: "Home loan principal" },
        ],
      },
      {
        code: "80D",
        name: "Health insurance",
        limitPaise: 7500000,
        oldRegimeOnly: true,
        items: [
          { id: "80d_self", name: "Self and family" },
          { id: "80d_parents", name: "Parents" },
        ],
      },
      {
        code: "80CCD(1B)",
        name: "Additional pension",
        limitPaise: 5000000,
        oldRegimeOnly: true,
        items: [{ id: "80ccd_nps", name: "NPS" }],
      },
      {
        code: "24(b)",
        name: "Home loan interest",
        limitPaise: 20000000,
        oldRegimeOnly: true,
        items: [{ id: "24b_interest", name: "Home loan interest" }],
      },
    ],
    entities: data.statEntities,
    locations: data.statLocations,
    assignments: data.statAssignments,
    states: { UP: "Uttar Pradesh", HR: "Haryana", MH: "Maharashtra", KA: "Karnataka", WB: "West Bengal", DL: "Delhi" },
  });
  await prisma.payConfiguration.upsert({ where: { id: 1 }, create: { id: 1, settings: json(policy) }, update: {} });
  const profileSchema = z.object({
    employeeId: z.string(),
    uan: z.string().nullable(),
    pfMemberSerial: z.string(),
    esiIp: z.string().nullable(),
    pan: z.string().nullable(),
    pfOptOut: z.boolean(),
    vpfPercent: z.number(),
    bankName: z.string(),
    accountNumber: z.string(),
    ifsc: z.string(),
    bankStatus: z.string(),
    bankChangedAt: z.string().nullable(),
    registeredState: z.string().nullable(),
  });
  for (const profile of Object.values(z.record(z.string(), profileSchema).parse(data.statProfiles))) {
    const employee = data.employees.find((row) => row.id === profile.employeeId);
    if (!employee) continue;
    const location = policy.locations[employee.location];
    await prisma.payProfile.upsert({
      where: { employeeId: employee.id },
      create: {
        employeeId: employee.id,
        entityId: location?.entityId ?? policy.entities[0]?.id ?? "",
        state: location?.state ?? profile.registeredState ?? "UP",
        uan: profile.uan,
        pfMemberId: profile.pfMemberSerial,
        esiIp: profile.esiIp,
        pan: profile.pan ? encrypt(profile.pan) : null,
        pfOptOut: profile.pfOptOut,
        vpfPercent: profile.vpfPercent,
        bankName: profile.bankName,
        accountNumber: encrypt(profile.accountNumber),
        ifsc: profile.ifsc,
        bankStatus: profile.bankStatus,
        bankChangedBy: profile.bankChangedAt ? employee.id : null,
        bankChangedAt: profile.bankChangedAt ? ctx.shiftInstant(profile.bankChangedAt) : null,
      },
      update: {},
    });
  }
  const templates = z
    .array(z.object({ id: z.string(), publishedAt: z.string(), publishedBy: z.string(), version: z.number() }).loose())
    .parse(data.statTemplates);
  for (const template of templates)
    await prisma.payTemplate.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        publishedBy: template.publishedBy,
        publishedAt: ctx.shiftInstant(template.publishedAt),
        version: template.version,
        terms: json(template),
      },
      update: {},
    });
  for (const employee of data.employees)
    await prisma.payCompensation.upsert({
      where: {
        employeeId_effectiveFrom: {
          employeeId: employee.id,
          effectiveFrom: fromIsoDate(ctx.shiftDate(employee.joinedOn)),
        },
      },
      create: {
        id: `pc_seed_${employee.id}`,
        employeeId: employee.id,
        effectiveFrom: fromIsoDate(ctx.shiftDate(employee.joinedOn)),
        annualPaise: BigInt(Math.round(employee.annualCtc * 100)),
        reason: "Development opening compensation",
        reference: `OPEN-${employee.code}`,
      },
      update: {},
    });
  const loans = z
    .array(
      z.object({
        id: z.string(),
        reference: z.string(),
        employeeId: z.string(),
        type: z.string(),
        principalPaise: z.number(),
        tenureMonths: z.number(),
        paidInstallments: z.number(),
        startMonth: z.string(),
        state: z.string(),
        requestedAt: z.string(),
        reason: z.string(),
      }),
    )
    .parse(data.loans ?? []);
  for (const loan of loans)
    await prisma.payLoan.upsert({
      where: { id: loan.id },
      create: {
        ...loan,
        principalPaise: BigInt(loan.principalPaise),
        recoveredPaise: BigInt(
          Math.min(
            loan.principalPaise,
            Math.ceil(loan.principalPaise / loan.tenureMonths / 100) * 100 * loan.paidInstallments,
          ),
        ),
        requestedAt: ctx.shiftInstant(loan.requestedAt),
      },
      update: {},
    });
  const runs = z
    .array(
      z.object({
        id: z.string(),
        month: z.string(),
        revision: z.number(),
        state: z.string(),
        preparedBy: z.string(),
        approvedBy: z.string().nullable(),
        publishedAt: z.string().nullable(),
      }),
    )
    .parse(data.payrollRuns);
  for (const source of runs) {
    const month = ctx.shiftDate(`${source.month}-01`).slice(0, 7);
    if (await prisma.payRun.findUnique({ where: { month } })) continue;
    await prisma.$transaction(
      async (tx) => {
        const repo = createPayrollRepository(tx);
        await repo.createRun({ id: source.id, month, revision: source.revision, preparedBy: source.preparedBy });
        const run = await repo.run(source.id);
        if (!run) throw new Error("Seed run unavailable");
        await persistCalculation(repo, run);
        await repo.updateRun(source.id, {
          state: source.state,
          approvedBy: source.approvedBy,
          publishedAt: source.publishedAt ? ctx.shiftInstant(source.publishedAt) : null,
        });
      },
      { timeout: 60000 },
    );
  }
  ctx.log(`Payroll configuration, ${templates.length} templates and ${runs.length} runs seeded.`);
}
