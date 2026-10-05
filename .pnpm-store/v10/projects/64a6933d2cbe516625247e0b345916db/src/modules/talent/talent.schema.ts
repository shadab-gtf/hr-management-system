import { z } from "zod";
import { AuthenticationError, AuthorizationError, ConflictError } from "../../core/errors/index.js";
import type { TalentCall } from "./talent.controller.js";
export const emptyBody = z.object({}).prefault({});
export const pathId = z.string().min(1).max(120);
export function actorOf(call: TalentCall) {
  if (!call.actor) throw new AuthenticationError("AUTHENTICATION_REQUIRED", "Authentication is required.");
  return call.actor;
}
export function ensure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ConflictError(code, message);
}
export function requireValue<T>(value: T | null | undefined): T {
  ensure(value !== undefined && value !== null, "RELATED_RECORD_MISSING", "A required related record is unavailable.");
  return value;
}
export function own(actual: string, expected: string): void {
  if (actual !== expected) throw new AuthorizationError("You don't have access to this record.");
}
export function idOf(call: TalentCall, key: string): string {
  return pathId.parse(call.params[key]);
}
export const now = () => new Date().toISOString();
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}
