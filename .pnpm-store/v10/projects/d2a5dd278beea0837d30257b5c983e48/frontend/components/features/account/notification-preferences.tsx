"use client";

import { useState } from "react";
import { ConfirmButton, InlineForm } from "@/components/features/admin/form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, Segmented, TextInput, describedBy } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { removePhoneAction, requestPhoneCodeAction, saveChannelPreferencesAction, verifyPhoneCodeAction } from "@/lib/actions/notifications";
import type { PrefsStrings } from "@/lib/i18n";
import type { NotificationTopic } from "@/types/hr-config";
import type { ChannelPreferences } from "@/types/notifications";

const channels = ["email", "push", "sms", "whatsapp"] as const;

/** In-app is always on; email/push/SMS/WhatsApp per topic; SMS and WhatsApp need a verified mobile. */
export function NotificationPreferencesForm({ preferences, topicLabels, strings }: { preferences: ChannelPreferences; topicLabels: Record<NotificationTopic, string>; strings: PrefsStrings }) {
  const [quiet, setQuiet] = useState(preferences.quietHours.enabled);
  const [digest, setDigest] = useState<string>(preferences.digest.mode);
  const phoneReady = preferences.phone.verified;
  return (
    <InlineForm action={saveChannelPreferencesAction} submitLabel={strings.save}>
      {(fieldError) => (
        <>
          <div className="pref-scroll" role="region" aria-label={strings.topic} tabIndex={0}>
            <table className="pref-table">
              <caption className="sr-only">Notification channels by topic</caption>
              <thead>
                <tr>
                  <th scope="col">{strings.topic}</th>
                  <th scope="col">{strings.inApp}</th>
                  {channels.map((channel) => (
                    <th key={channel} scope="col">
                      {strings[channel]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preferences.topics.map((item) => (
                  <tr key={item.topic}>
                    <th scope="row">{topicLabels[item.topic]}</th>
                    <td>
                      <input type="checkbox" checked disabled aria-label={`${topicLabels[item.topic]} ${strings.inApp} (${strings.alwaysOn})`} />
                    </td>
                    {channels.map((channel) => {
                      const needsPhone = channel === "sms" || channel === "whatsapp";
                      return (
                        <td key={channel}>
                          <input
                            type="checkbox"
                            name={`${channel}.${item.topic}`}
                            defaultChecked={item[channel]}
                            disabled={needsPhone && !phoneReady && !item[channel]}
                            aria-label={`${topicLabels[item.topic]} ${strings.by[channel]}`}
                            aria-describedby={needsPhone && !phoneReady ? "pref-phone-needed" : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!phoneReady && (
            <p id="pref-phone-needed" className="field-hint">
              {strings.phoneNeeded}
            </p>
          )}
          {fieldError("phone") && (
            <Alert tone="danger" live>
              {fieldError("phone")}
            </Alert>
          )}
          <Segmented
            name="digest"
            legend={strings.digest}
            value={digest}
            onChange={setDigest}
            options={[
              { value: "instant", label: strings.instant },
              { value: "daily", label: strings.daily },
            ]}
          />
          {digest === "daily" ? (
            <FormField id="digest-time" label={strings.digestTime}>
              <TextInput id="digest-time" name="digestTime" type="time" defaultValue={preferences.digest.time} />
            </FormField>
          ) : (
            <input type="hidden" name="digestTime" value={preferences.digest.time} />
          )}
          <label className="check-row">
            <input type="checkbox" name="quietEnabled" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
            <span>{strings.quiet}</span>
          </label>
          {quiet ? (
            <div className="form-row">
              <FormField id="quiet-from" label={strings.from}>
                <TextInput id="quiet-from" name="quietFrom" type="time" defaultValue={preferences.quietHours.from} />
              </FormField>
              <FormField id="quiet-to" label={strings.to} error={fieldError("to")}>
                <TextInput id="quiet-to" name="quietTo" type="time" defaultValue={preferences.quietHours.to} aria-invalid={Boolean(fieldError("to"))} aria-describedby={describedBy("quiet-to", fieldError("to"))} />
              </FormField>
            </div>
          ) : (
            <>
              <input type="hidden" name="quietFrom" value={preferences.quietHours.from} />
              <input type="hidden" name="quietTo" value={preferences.quietHours.to} />
            </>
          )}
          <p className="small muted">{strings.notConnected}</p>
        </>
      )}
    </InlineForm>
  );
}

/** Mobile number with a mock OTP step. The dev note shows the code a gateway would send. */
export function PhoneVerification({ phone, strings }: { phone: ChannelPreferences["phone"]; strings: PrefsStrings }) {
  const [changing, setChanging] = useState(false);
  const request = useCommand(requestPhoneCodeAction);
  const verify = useCommand(verifyPhoneCodeAction, { onSuccess: () => setChanging(false) });
  const showRequest = !phone.pending && (!phone.verified || changing);
  return (
    <div className="phone-verify">
      {phone.verified && phone.masked && (
        <div className="phone-verify-row">
          <span>
            <strong className="num">{phone.masked}</strong> <Badge tone="success">{strings.verified}</Badge>
          </span>
          {!changing && !phone.pending && (
            <span className="row-actions">
              <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
                {strings.change}
              </Button>
              <ConfirmButton label={strings.remove} confirmLabel={strings.confirmRemove} run={removePhoneAction} />
            </span>
          )}
        </div>
      )}
      {showRequest && (
        <form onSubmit={request.submit} className="phone-verify-row" noValidate>
          <FormField id="pv-phone" label={strings.mobile} hint={strings.mobileHint} error={request.fieldError("phone")}>
            <TextInput id="pv-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98XXXXXXXX" aria-invalid={Boolean(request.fieldError("phone"))} aria-describedby={describedBy("pv-phone", request.fieldError("phone"), true)} />
          </FormField>
          <Button type="submit" variant="secondary" pending={request.pending}>
            {strings.sendCode}
          </Button>
        </form>
      )}
      {request.formError && (
        <Alert tone="danger" live>
          {request.formError}
        </Alert>
      )}
      {phone.pending && (
        <>
          <p className="small">{strings.sentTo.replace("{phone}", phone.pending.masked).replace("{n}", String(phone.pending.attemptsLeft))}</p>
          {phone.devCode && (
            <p className="dev-note" role="note">
              {strings.devNote} <code>{phone.devCode}</code>
            </p>
          )}
          <form onSubmit={verify.submit} className="phone-verify-row" noValidate>
            <FormField id="pv-code" label={strings.code} error={verify.fieldError("code")}>
              <TextInput id="pv-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-invalid={Boolean(verify.fieldError("code"))} aria-describedby={describedBy("pv-code", verify.fieldError("code"))} />
            </FormField>
            <Button type="submit" pending={verify.pending}>
              {strings.verify}
            </Button>
          </form>
          {verify.formError && (
            <Alert tone="danger" live>
              {verify.formError}
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
