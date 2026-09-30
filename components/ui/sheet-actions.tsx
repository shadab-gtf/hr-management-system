import { Button } from "@/components/ui/button";

/** Standard footer for sheet forms: Cancel + primary submit with pending label. */
export function SheetActions({
  onCancel,
  pending,
  label,
  pendingLabel,
  variant = "primary",
}: {
  onCancel: () => void;
  pending: boolean;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
}) {
  return (
    <div className="sheet-actions">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" variant={variant} pending={pending}>
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}
