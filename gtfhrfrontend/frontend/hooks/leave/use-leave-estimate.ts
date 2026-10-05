"use client";

import { useMemo } from "react";
import { eachDay, isWeekend } from "@/lib/utils/date";
import type { LeaveBalance, LeaveType } from "@/types/leave";

/**
 * Display-only estimate while the employee picks dates. The server computes
 * the authoritative chargeable units from policy on submit.
 */
export function useLeaveEstimate({
  start,
  end,
  portion,
  type,
  balance,
  holidayDates,
}: {
  start: string;
  end: string;
  portion: string;
  type: LeaveType | undefined;
  balance: LeaveBalance | undefined;
  holidayDates: string[];
}) {
  return useMemo(() => {
    const singleDay = start === end;
    const halfAllowed = Boolean(type?.allowHalfDay && singleDay);
    const effectivePortion = halfAllowed ? portion : "full";
    const holidays = new Set(holidayDates);
    const working = end >= start ? eachDay(start, end).filter((d) => !isWeekend(d) && !holidays.has(d)).length : 0;
    const estimate = working === 1 && effectivePortion !== "full" ? 0.5 : working;
    const remaining = balance ? Number(balance.available) - estimate : null;
    return { singleDay, halfAllowed, effectivePortion, estimate, remaining };
  }, [start, end, portion, type, balance, holidayDates]);
}
