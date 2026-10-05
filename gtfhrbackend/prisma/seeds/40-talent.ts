import type { SeedContext } from "./context.js";
import { talentRepository } from "../../src/modules/talent/talent.repository.js";
import { checklistTaskSchema } from "../../src/contracts/hr-config.js";
import { perfCompetencySchema } from "../../src/contracts/performance.js";
import { letterTemplateSchema } from "../../src/contracts/lifecycle.js";

/** Explicit development-only fixtures. Application reads never seed or manufacture records. */
export default async function seedTalent(ctx: SeedContext): Promise<void> {
  await ctx.prisma.organizationSetting.upsert({
    where: { key: "settlement_policy" },
    create: {
      key: "settlement_policy",
      value: {
        approvedForProduction: false,
        noticeDivisor: 30,
        leaveDivisor: 30,
        leaveBasis: "basic",
        gratuityEnabled: true,
        gratuityMinimumYears: 5,
        gratuityNumerator: 15,
        gratuityDivisor: 26,
        gratuityCapPaise: 200000000,
      },
    },
    update: {},
  });
  await ctx.prisma.organizationSetting.upsert({
    where: { key: "notice_days" },
    create: { key: "notice_days", value: { full_time: 60, contract: 30, intern: 15 } },
    update: {},
  });
  const lifecycle = talentRepository(ctx.prisma, "lifecycle");
  for (const task of [
    { id: "on_identity", title: "Verify employment documents", owner: "HR" as const, offsetDays: 1, blocking: true },
    { id: "on_equipment", title: "Issue workstation and access", owner: "IT" as const, offsetDays: 1, blocking: true },
  ])
    await lifecycle.save("checklist_onboarding", checklistTaskSchema, task);
  for (const task of [
    {
      id: "off_handover",
      title: "Complete project handover",
      owner: "Manager" as const,
      offsetDays: 2,
      blocking: true,
    },
    { id: "off_access", title: "Review access revocation", owner: "IT" as const, offsetDays: 0, blocking: true },
  ])
    await lifecycle.save("checklist_offboarding", checklistTaskSchema, task);
  await lifecycle.save("letter_template", letterTemplateSchema, {
    id: "tpl_employment",
    name: "Employment verification",
    kind: "employment_verification",
    subject: "Employment verification for {{name}}",
    body: "This is to confirm that {{name}} ({{code}}) is employed by {{company}} as {{designation}} in {{department}} since {{joinedOn}}. This letter is issued for {{purpose}}.\n\n{{signatory}}\n{{signatoryTitle}}",
    active: true,
    updatedAt: new Date().toISOString(),
    updatedBy: "Development seed",
    version: 1,
    issuedCount: 0,
  });
  await talentRepository(ctx.prisma, "performance").save("competency", perfCompetencySchema, {
    id: "comp_ownership",
    name: "Ownership",
    description: "Takes responsibility for outcomes and communicates progress.",
    behaviours: ["Follows through on commitments", "Escalates risks early"],
  });
  ctx.log("Talent development checklists, letter template and competency configured.");
}
