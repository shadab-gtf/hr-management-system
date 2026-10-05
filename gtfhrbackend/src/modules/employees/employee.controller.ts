import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { sendData } from "../../utils/response.js";
import { createEmployeeSchema, listEmployeesQuerySchema } from "./employee.schema.js";
import type { EmployeeService } from "./employee.service.js";
import { idempotencyKeyOf } from "../../core/http/request-context.js";

export function createEmployeeController(service: EmployeeService) {
  return {
    list: async (request, response) => {
      const query = validated(response, "query", listEmployeesQuerySchema);
      const { data, meta } = await service.listDirectory(currentActor(request), query, request.requestId);
      sendData(response, data, { meta });
    },

    facets: async (request, response) => {
      sendData(response, await service.facets(currentActor(request)));
    },

    formOptions: async (request, response) => {
      sendData(response, await service.formOptions(currentActor(request)));
    },

    create: async (request, response) => {
      const input = validated(response, "body", createEmployeeSchema);
      sendData(
        response,
        await service.create(currentActor(request), input, request.requestId, idempotencyKeyOf(request)),
        { status: 201 },
      );
    },
  } satisfies Record<string, RequestHandler>;
}
