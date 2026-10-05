import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AppIcon } from "@/components/ui/app-icon";

/** Plain GET form: the route handler rechecks access and scope on download. */
export function TimesheetExportForm({ from, to, scope }: { from: string; to: string; scope: string }) {
  return (
    <Card labelledBy="ts-export-title">
      <CardHeader id="ts-export-title" title="Export approved hours" description={scope} />
      <CardBody>
        <form method="get" action="/api/timesheets/approved.csv" className="ts-export">
          <div className="toolbar-field">
            <label htmlFor="ts-export-from">From</label>
            <input id="ts-export-from" className="input" type="date" name="from" defaultValue={from} required />
          </div>
          <div className="toolbar-field">
            <label htmlFor="ts-export-to">To</label>
            <input id="ts-export-to" className="input" type="date" name="to" defaultValue={to} required />
          </div>
          <button type="submit" className="button button--secondary">
            <AppIcon name="download" size={20} />
            Download CSV
          </button>
        </form>
        <p className="card-note muted small">Up to 186 days · approved weeks only, clipped to the dates you pick · generated from mock data.</p>
      </CardBody>
    </Card>
  );
}
