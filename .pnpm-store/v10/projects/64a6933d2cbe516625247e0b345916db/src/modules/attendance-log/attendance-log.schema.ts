import { z } from "zod";
export {
  attendanceLogInputSchema as attendanceLogBody,
  attendanceLogQuerySchema as attendanceLogQuery,
  attendanceLogReviewQuerySchema as attendanceLogReviewQuery,
} from "../../contracts/attendance-log.js";

export const attendanceLogParams = z.object({ id: z.string().regex(/^alog_[0-9a-z]{20,40}$/) });
