/** Preview DTOs used by explicit demo fixtures. Live parsing belongs to the HR API. */
export interface ParsedRecord { line: number; code: string; name: string | null; date: string | null; firstIn: string | null; lastOut: string | null; problem: string | null }
export interface ParsedFile { format: "daily" | "punch_log"; columns: { field: string; header: string }[]; records: ParsedRecord[] }
export interface CompensationRecord { line: number; code: string; name: string | null; effectiveFrom: string | null; ctc: number | null; basic: number | null; hra: number | null; special: number | null; reason: string | null; problem: string | null }
export interface CompensationFile { records: CompensationRecord[]; hasEffectiveColumn: boolean; columns: { field: string; header: string }[] }
