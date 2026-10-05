import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  postInputSchema,
  pollInputSchema,
  praiseInputSchema,
  questionInputSchema,
  reactionKindSchema,
  surveyAnswersSchema,
  surveyInputSchema,
} from "../../contracts/engage.js";
import { createEngageService } from "./engage.service.js";
import { routeParam, workspaceRoute as route } from "../workspace/workspace.routes.js";
import { emptyBody } from "../workspace/workspace.schema.js";
export function engageRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const s = createEngageService(prisma);
  route(router, "get", "/engage/feed", emptyBody, (a, _b, _p, q) => s.feed(a, q));
  route(router, "post", "/engage/posts", postInputSchema, (a, b, _p, _q, c) => s.post(a, b, c));
  route(router, "post", "/engage/posts/:id/reactions", z.object({ kind: reactionKindSchema }), (a, b, p, _q, c) =>
    s.reaction(a, routeParam(p, "id"), b.kind, c),
  );
  route(
    router,
    "post",
    "/engage/posts/:id/comments",
    z.object({ body: z.string().trim().min(1).max(500) }),
    (a, b, p, _q, c) => s.comment(a, routeParam(p, "id"), b.body, c),
  );
  route(router, "post", "/engage/posts/:id/archive", emptyBody, (a, _b, p, _q, c) =>
    s.archivePost(a, routeParam(p, "id"), c),
  );
  route(router, "get", "/engage/polls", emptyBody, (a) => s.polls(a));
  route(router, "post", "/engage/polls", pollInputSchema, (a, b, _p, _q, c) => s.poll(a, b, c));
  route(
    router,
    "post",
    "/engage/polls/:id/ballot",
    z.object({ optionIds: z.array(z.string().max(100)).min(1).max(6) }),
    (a, b, p, _q, c) => s.vote(a, routeParam(p, "id"), b.optionIds, c),
  );
  route(router, "post", "/engage/polls/:id/close", emptyBody, (a, _b, p, _q, c) =>
    s.closePoll(a, routeParam(p, "id"), c),
  );
  route(router, "get", "/engage/praise", emptyBody, (a, _b, _p, q) => s.praiseWall(a, q));
  route(router, "post", "/engage/praise", praiseInputSchema, (a, b, _p, _q, c) => s.praise(a, b, c));
  route(router, "get", "/me/surveys", emptyBody, (a) => s.surveys(a, false));
  route(router, "get", "/engage/surveys", emptyBody, (a) => s.surveys(a, true));
  route(router, "get", "/engage/surveys/:id", emptyBody, (a, _b, p) => s.surveyDetail(a, routeParam(p, "id")));
  route(router, "get", "/engage/surveys/:id/results", emptyBody, (a, _b, p) => s.results(a, routeParam(p, "id")));
  route(router, "get", "/engage/surveys/:id/results/export", emptyBody, (a, _b, p) =>
    s.exportSurvey(a, routeParam(p, "id")),
  );
  route(router, "post", "/engage/surveys", surveyInputSchema, (a, b, _p, _q, c) => s.saveSurvey(a, b, undefined, c));
  route(router, "patch", "/engage/surveys/:id", surveyInputSchema, (a, b, p, _q, c) =>
    s.saveSurvey(a, b, routeParam(p, "id"), c),
  );
  route(router, "post", "/engage/surveys/:id/responses", z.object({ answers: surveyAnswersSchema }), (a, b, p, _q, c) =>
    s.respond(a, routeParam(p, "id"), b.answers, c),
  );
  route(router, "post", "/engage/surveys/:id/questions", questionInputSchema, (a, b, p, _q, c) =>
    s.surveyCommand(a, routeParam(p, "id"), "question", { question: b }, c),
  );
  route(router, "post", "/engage/surveys/:id/questions/:questionId/archive", emptyBody, (a, _b, p, _q, c) =>
    s.surveyCommand(a, routeParam(p, "id"), "remove_question", { questionId: routeParam(p, "questionId") }, c),
  );
  route(
    router,
    "post",
    "/engage/surveys/:id/questions/:questionId/move",
    z.object({ direction: z.enum(["up", "down"]) }),
    (a, b, p, _q, c) =>
      s.surveyCommand(
        a,
        routeParam(p, "id"),
        "move_question",
        { questionId: routeParam(p, "questionId"), direction: b.direction },
        c,
      ),
  );
  for (const op of ["publish", "close", "archive"] as const)
    route(router, "post", `/engage/surveys/:id/${op}`, emptyBody, (a, _b, p, _q, c) =>
      s.surveyCommand(a, routeParam(p, "id"), op, {}, c),
    );
  return router;
}
