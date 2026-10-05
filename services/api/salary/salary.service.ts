import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  compensation,
  listLoans,
  requestLoan,
  saveDeclaration,
  taxDeclaration,
  taxStatement,
  ytdSummary,
} from "@/lib/mocks/handlers/salary";
import {
  compensationSchema,
  loanSchema,
  taxDeclarationSchema,
  taxStatementSchema,
  ytdSchema,
  type DeclarationInput,
  type LoanInput,
} from "@/types/salary";

export const getYtd = cache(async () =>
  callApi({ schema: ytdSchema, live: { path: "/me/salary/ytd" }, mock: async () => ytdSummary(await mockActor()) }),
);

export const getTaxDeclaration = cache(async () =>
  callApi({ schema: taxDeclarationSchema, live: { path: "/me/tax/declaration" }, mock: async () => taxDeclaration(await mockActor()) }),
);

export const getTaxStatement = cache(async () =>
  callApi({ schema: taxStatementSchema, live: { path: "/me/tax/statement" }, mock: async () => taxStatement(await mockActor()) }),
);

export async function updateDeclaration(input: DeclarationInput) {
  return callApi({
    schema: z.object({ status: z.string() }),
    live: { method: "PATCH", path: "/me/tax/declaration", body: input },
    mock: async () => saveDeclaration(await mockActor(), input),
  });
}

export const getLoans = cache(async () =>
  callApi({ schema: z.array(loanSchema), live: { path: "/me/loans", list: true }, mock: async () => listLoans(await mockActor()) }),
);

export async function applyForLoan(input: LoanInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string() }),
    live: { method: "POST", path: "/me/loans", body: input, idempotencyKey },
    mock: async () => requestLoan(await mockActor(), input, idempotencyKey),
  });
}

export const getCompensation = cache(async () =>
  callApi({ schema: compensationSchema, live: { path: "/me/compensation" }, mock: async () => compensation(await mockActor()) }),
);
