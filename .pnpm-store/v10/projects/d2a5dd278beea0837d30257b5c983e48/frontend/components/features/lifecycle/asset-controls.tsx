"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { ActionButton } from "@/components/features/lifecycle/action-button";
import {
  acknowledgeAssetAction,
  assignAssetAction,
  rejectAssetRequestAction,
  requestAssetAction,
  returnAssetAction,
  saveAssetAction,
  setAssetStatusAction,
} from "@/lib/actions/lifecycle";
import { assetCategoryOptions, assetConditionOptions } from "@/components/sections/lifecycle/labels";
import type { Asset, AssetRequest } from "@/types/lifecycle";

type Option = { value: string; label: string };

export function AssetFormSheet({ asset, today }: { asset?: Asset; today: string }) {
  const prefix = asset ? `af-${asset.id}` : "af-new";
  const field = (name: string, label: string, fieldError: (name: string) => string | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <FormField id={`${prefix}-${name}`} label={label} required error={fieldError(name)}>
      <TextInput id={`${prefix}-${name}`} name={name} aria-invalid={Boolean(fieldError(name))} aria-describedby={describedBy(`${prefix}-${name}`, fieldError(name))} {...props} />
    </FormField>
  );
  return (
    <FormSheet draftKey={asset ? `asset.edit:${asset.id}` : "asset.new"} action={saveAssetAction} title={asset ? `Edit ${asset.tag}` : "Add asset"} trigger={asset ? "Edit" : "Add asset"} triggerVariant={asset ? "ghost" : "primary"} triggerSize={asset ? "sm" : "md"} icon={asset ? undefined : "add"} submitLabel={asset ? "Save changes" : "Add asset"}>
      {(fieldError) => (
        <>
          {asset && <input type="hidden" name="id" value={asset.id} />}
          <div className="form-row">
            {field("tag", "Asset tag", fieldError, { defaultValue: asset?.tag, placeholder: "LAP-0142", maxLength: 10 })}
            <FormField id={`${prefix}-category`} label="Category" required>
              <SelectInput id={`${prefix}-category`} name="category" defaultValue={asset?.category ?? "laptop"} options={assetCategoryOptions} />
            </FormField>
          </div>
          <div className="form-row">
            {field("make", "Make", fieldError, { defaultValue: asset?.make, maxLength: 40 })}
            {field("model", "Model", fieldError, { defaultValue: asset?.model, maxLength: 60 })}
          </div>
          {field("serial", "Serial number", fieldError, { defaultValue: asset?.serial, maxLength: 40 })}
          <div className="form-row">
            {field("purchasedOn", "Purchase date", fieldError, { type: "date", defaultValue: asset?.purchasedOn ?? today, max: today })}
            {field("cost", "Cost (₹)", fieldError, { inputMode: "decimal", defaultValue: asset ? asset.cost.amount.replace(/\.00$/, "") : "" })}
          </div>
          <FormField id={`${prefix}-condition`} label="Condition" required>
            <SelectInput id={`${prefix}-condition`} name="condition" defaultValue={asset?.condition ?? "new"} options={assetConditionOptions} />
          </FormField>
          <FormField id={`${prefix}-notes`} label="Notes" error={fieldError("notes")}>
            <TextArea id={`${prefix}-notes`} name="notes" rows={2} maxLength={300} defaultValue={asset?.notes} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AssignAssetSheet({ asset, people, request, assets }: { asset?: Asset; people: Option[]; request?: AssetRequest; assets?: Option[] }) {
  const prefix = `as-${asset?.id ?? request?.id ?? "x"}`;
  return (
    <FormSheet draftKey={asset ? `asset.assign:${asset.id}` : `asset.fulfil:${request?.id ?? "new"}`}
      action={assignAssetAction}
      title={asset ? `Assign ${asset.tag}` : `Fulfil ${request?.reference ?? "request"}`}
      description={asset ? `${asset.make} ${asset.model}` : request ? `${request.requester.name} · ${request.reason}` : undefined}
      trigger={asset ? "Assign" : "Assign asset"}
      triggerVariant={asset ? "secondary" : "primary"}
      triggerSize="sm"
      submitLabel="Assign"
    >
      {(fieldError) => (
        <>
          {asset && <input type="hidden" name="assetId" value={asset.id} />}
          {request && <input type="hidden" name="requestId" value={request.id} />}
          {request && <input type="hidden" name="employeeId" value={request.requester.id} />}
          {!asset && (
            <FormField id={`${prefix}-asset`} label="In-stock asset" required error={fieldError("assetId")} hint={assets?.length ? undefined : "Nothing in stock for this category — add an asset first."}>
              <SelectInput id={`${prefix}-asset`} name="assetId" options={assets ?? []} placeholder="Choose…" aria-invalid={Boolean(fieldError("assetId"))} aria-describedby={describedBy(`${prefix}-asset`, fieldError("assetId"), !assets?.length)} />
            </FormField>
          )}
          {!request && (
            <FormField id={`${prefix}-employee`} label="Employee" required error={fieldError("employeeId")}>
              <SelectInput id={`${prefix}-employee`} name="employeeId" options={people} placeholder="Choose…" aria-invalid={Boolean(fieldError("employeeId"))} aria-describedby={describedBy(`${prefix}-employee`, fieldError("employeeId"))} />
            </FormField>
          )}
          <FormField id={`${prefix}-note`} label="Handover note" error={fieldError("note")} hint="e.g. charger and sleeve included. The employee acknowledges receipt in My assets.">
            <TextArea id={`${prefix}-note`} name="note" rows={2} maxLength={300} aria-describedby={describedBy(`${prefix}-note`, fieldError("note"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function ReturnAssetSheet({ asset }: { asset: Asset }) {
  const prefix = `ret-${asset.id}`;
  return (
    <FormSheet draftKey={`asset.return:${asset.id}`} action={returnAssetAction} title={`Check in ${asset.tag}`} description={`From ${asset.assignee?.name ?? "employee"}. Damaged items go to repair.`} trigger="Return" triggerVariant="secondary" triggerSize="sm" submitLabel="Record return">
      {(fieldError) => (
        <>
          <input type="hidden" name="assetId" value={asset.id} />
          <input type="hidden" name="expectedVersion" value={asset.version} />
          <FormField id={`${prefix}-condition`} label="Condition on return" required>
            <SelectInput id={`${prefix}-condition`} name="condition" defaultValue={asset.condition} options={assetConditionOptions} />
          </FormField>
          <FormField id={`${prefix}-note`} label="Condition notes" error={fieldError("note")}>
            <TextArea id={`${prefix}-note`} name="note" rows={2} maxLength={300} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AssetStatusSheet({ asset }: { asset: Asset }) {
  const options = [
    { value: "in_stock", label: "In stock" },
    { value: "in_repair", label: "In repair" },
    { value: "retired", label: "Retired (permanent)" },
  ].filter((option) => option.value !== asset.status);
  const prefix = `st-${asset.id}`;
  return (
    <FormSheet draftKey={`asset.status:${asset.id}`} action={setAssetStatusAction} title={`Change status · ${asset.tag}`} trigger="Status" triggerVariant="ghost" triggerSize="sm" submitLabel="Update status">
      {(fieldError) => (
        <>
          <input type="hidden" name="assetId" value={asset.id} />
          <FormField id={`${prefix}-status`} label="New status" required>
            <SelectInput id={`${prefix}-status`} name="status" options={options} />
          </FormField>
          <FormField id={`${prefix}-note`} label="Note" required error={fieldError("note")}>
            <TextArea id={`${prefix}-note`} name="note" rows={2} maxLength={300} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy(`${prefix}-note`, fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RejectAssetRequestSheet({ request }: { request: AssetRequest }) {
  return (
    <FormSheet draftKey={`asset-request.decline:${request.id}`} action={rejectAssetRequestAction} title={`Decline ${request.reference}`} trigger="Decline" triggerVariant="ghost" triggerSize="sm" submitLabel="Decline request" submitVariant="danger">
      {(fieldError) => (
        <>
          <input type="hidden" name="requestId" value={request.id} />
          <FormField id={`rj-${request.id}`} label="Reason" required error={fieldError("note")}>
            <TextArea id={`rj-${request.id}`} name="note" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy(`rj-${request.id}`, fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AcknowledgeAssetButton({ assetId, tag }: { assetId: string; tag: string }) {
  return <ActionButton label={`Acknowledge ${tag}`} variant="primary" icon="check" run={() => acknowledgeAssetAction(assetId)} />;
}

export function RequestAssetSheet() {
  return (
    <FormSheet draftKey={"asset.request"} action={requestAssetAction} title="Request an asset" description="HR reviews and assigns from stock." trigger="Request asset" icon="add" submitLabel="Send request">
      {(fieldError) => (
        <>
          <FormField id="ra-category" label="What do you need?" required error={fieldError("category")}>
            <SelectInput id="ra-category" name="category" defaultValue="monitor" options={assetCategoryOptions} aria-invalid={Boolean(fieldError("category"))} aria-describedby={describedBy("ra-category", fieldError("category"))} />
          </FormField>
          <FormField id="ra-reason" label="Why do you need it?" required error={fieldError("reason")}>
            <TextArea id="ra-reason" name="reason" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy("ra-reason", fieldError("reason"))} />
          </FormField>
          <p className="small muted">
            <AppIcon name="info" size={16} /> Requests are tracked in your Request hub.
          </p>
        </>
      )}
    </FormSheet>
  );
}
