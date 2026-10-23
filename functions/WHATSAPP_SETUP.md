# WhatsApp case notifications

`sendCaseWhatsappNotifications` sends approved WhatsApp template messages when a case is assigned and when its status changes to `audit`. Message delivery runs from Firebase Functions; the access token and phone-number ID are never placed in the app.

## Candidate opt-in and phone number

The assignment dialog has a consent confirmation. Check it only after the candidate has explicitly agreed to receive WhatsApp messages. The confirmation is saved on the case as `whatsappOptIn: true`; cases without that exact value are skipped and the reason is recorded under `cases/{caseId}/whatsappNotifications`.

The sender uses the case's `contactNumber`. Ten-digit Indian numbers are prefixed with the configured default country code (`91`); other numbers must include their country calling code.

## Create and approve the message templates

Create these templates in WhatsApp Manager and wait for approval. The names and language must match the Firebase parameters below.

**`spacesolutions_assignment_alert`** — utility template, English (`en`), with three body text parameters:

> Hello {{1}}, your verification has been assigned to member {{2}}. They will contact you shortly. Please do not offer or pay any bribe, even if someone asks; this is an offence. Report any bribe request immediately by calling 9962873989 or replying to this WhatsApp message so we can take appropriate legal steps. Case reference: {{3}}.

The parameters are candidate name, field-officer name, and case reference, in that order.

**`spacesolutions_audit_feedback`** — utility template, English (`en`), no parameters:

> Your verification is now under audit. Please reply to these questions: 1. Are you satisfied with the verification process? (Yes/No) 2. Was the member who handled your case professional and helpful? (Yes/No) 3. Did the member ask you for or hint at a bribe? (Yes/No). If you answered Yes to question 3, report it immediately by calling 9962873989 or replying here.

The audit message is sent when a case enters `audit` from another status. The integration sends these messages but does not yet receive or save candidate replies; replies go to the WhatsApp Business inbox. Configure a WhatsApp webhook separately if replies must be stored in the app.

## Configure and deploy

1. Configure the WhatsApp Cloud API sender and approved templates in Meta. Keep the permanent access token private.
2. From the repository root, set the two Firebase secrets (the CLI prompts securely for each value):

   ```powershell
   firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
   firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
   ```

3. Deploy the function (the Functions package uses the supported Node.js 20 runtime):

   ```powershell
   firebase deploy --only functions:sendCaseWhatsappNotifications
   ```

4. Optional `defineString` parameters can be supplied through Firebase CLI prompts or a local `functions/.env.<project-id>` file:

   - `WHATSAPP_GRAPH_API_VERSION` (default `v23.0`; use a Graph API version supported by your Meta app)
   - `WHATSAPP_ASSIGNMENT_TEMPLATE` (default `spacesolutions_assignment_alert`)
   - `WHATSAPP_AUDIT_TEMPLATE` (default `spacesolutions_audit_feedback`)
   - `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`)
   - `WHATSAPP_DEFAULT_COUNTRY_CODE` (default `91`, digits only)

Delivery attempts are visible in the admin WhatsApp Monitor and at `cases/{caseId}/whatsappNotifications/{assignment|auditFeedback}`. A separate server-side claim record prevents duplicate sends if Firebase retries an event.
