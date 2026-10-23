const crypto = require("crypto");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { defineSecret, defineString } = require("firebase-functions/params");

admin.initializeApp();

const whatsappAccessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const whatsappGraphApiVersion = defineString("WHATSAPP_GRAPH_API_VERSION", { default: "v23.0" });
const whatsappAssignmentTemplate = defineString("WHATSAPP_ASSIGNMENT_TEMPLATE", {
  default: "spacesolutions_assignment_alert",
});
const whatsappAuditTemplate = defineString("WHATSAPP_AUDIT_TEMPLATE", {
  default: "spacesolutions_audit_feedback",
});
const whatsappTemplateLanguage = defineString("WHATSAPP_TEMPLATE_LANGUAGE", { default: "en" });
const whatsappDefaultCountryCode = defineString("WHATSAPP_DEFAULT_COUNTRY_CODE", { default: "91" });

function normalizeWhatsappNumber(value, defaultCountryCode) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Candidate contact number is not a valid international phone number.");
  }
  return digits;
}

function whatsappTemplateParameters(values) {
  return values.length
    ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text: String(text) })) }]
    : [];
}

async function sendWhatsappTemplate({
  caseId,
  caseData,
  notificationType,
  notificationKey,
  templateName,
  parameters,
}) {
  const caseRef = admin.database().ref(`cases/${caseId}`);
  const notificationRef = caseRef.child(`whatsappNotifications/${notificationType}/${notificationKey}`);
  const claimRef = admin.database().ref(`whatsappMessageClaims/${caseId}/${notificationType}/${notificationKey}`);
  const timestamp = Date.now();
  let recipient = null;
  let recipientError = "";
  try {
    recipient = normalizeWhatsappNumber(caseData.contactNumber, whatsappDefaultCountryCode.value());
  } catch (error) {
    recipientError = String(error?.message || error);
  }
  const hasOptIn = caseData.whatsappOptIn === true;
  const skipReason = !hasOptIn
    ? "Candidate WhatsApp opt-in is not recorded for this case."
    : !recipient
      ? recipientError || "Candidate contact number is missing or invalid."
      : "";

  const claim = await claimRef.transaction((current) => (
    current ? undefined : { status: "sending", createdAt: timestamp }
  ));
  if (!claim.committed) return;

  if (skipReason) {
    const result = {
      status: "skipped",
      reason: skipReason,
      updatedAt: timestamp,
      recipientLastFour: recipient ? recipient.slice(-4) : null,
    };
    await Promise.all([notificationRef.set(result), claimRef.update(result)]);
    console.warn(`[WhatsApp] Skipped ${notificationType} for case ${caseId}: ${skipReason}`);
    return;
  }

  try {
    const accessToken = whatsappAccessToken.value();
    const phoneNumberId = whatsappPhoneNumberId.value();
    const apiVersion = whatsappGraphApiVersion.value();
    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp credentials are not configured in Firebase Secret Manager.");
    }
    if (!/^v\d+\.\d+$/.test(apiVersion)) {
      throw new Error("WHATSAPP_GRAPH_API_VERSION must look like vXX.X.");
    }

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: whatsappTemplateLanguage.value() },
            ...(parameters.length ? { components: whatsappTemplateParameters(parameters) } : {}),
          },
        }),
      }
    );
    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`WhatsApp API returned invalid JSON (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(responseData.error?.message || `WhatsApp API request failed (HTTP ${response.status}).`);
    }

    const result = {
      status: "sent",
      templateName,
      messageId: responseData.messages?.[0]?.id || null,
      recipientLastFour: recipient.slice(-4),
      sentAt: Date.now(),
    };
    await Promise.all([notificationRef.set(result), claimRef.update(result)]);
  } catch (error) {
    const result = {
      status: "failed",
      templateName,
      error: String(error?.message || error).slice(0, 500),
      recipientLastFour: recipient.slice(-4),
      updatedAt: Date.now(),
    };
    console.error(`[WhatsApp] ${notificationType} send failed for case ${caseId}:`, error);
    await Promise.all([notificationRef.set(result), claimRef.update(result)]);
  }
}

exports.sendCaseWhatsappNotifications = onValueWritten(
  {
    ref: "/cases/{caseId}",
    instance: "spacesolutions2-89738-default-rtdb",
    region: "us-central1",
    secrets: [whatsappAccessToken, whatsappPhoneNumberId],
  },
  async (event) => {
    const before = event.data.before.val() || {};
    const after = event.data.after.val();
    if (!after) return;

    const caseId = event.params.caseId;
    const beforeStatus = String(before.status || "").toLowerCase();
    const afterStatus = String(after.status || "").toLowerCase();
    const assignmentChanged = afterStatus === "assigned"
      && (
        beforeStatus !== "assigned"
        || String(before.assignedTo || "") !== String(after.assignedTo || "")
        || String(before.assignedAt || "") !== String(after.assignedAt || "")
      );
    const enteredAudit = afterStatus === "audit" && beforeStatus !== "audit";

    if (assignmentChanged) {
      const assignmentKey = crypto
        .createHash("sha256")
        .update(`${after.assignedTo || ""}|${after.assignedAt || ""}`)
        .digest("hex")
        .slice(0, 24);
      await sendWhatsappTemplate({
        caseId,
        caseData: after,
        notificationType: "assignment",
        notificationKey: assignmentKey,
        templateName: whatsappAssignmentTemplate.value(),
        parameters: [
          after.candidateName || after.name || "Candidate",
          after.assigneeName || after.assignedToName || "your assigned field officer",
          after.matrixRefNo || after.refNo || caseId,
        ],
      });
    }

    if (enteredAudit) {
      const auditKey = crypto
        .createHash("sha256")
        .update(String(event.id || `${caseId}|${after.completedAt || after.updatedAt || "audit"}`))
        .digest("hex")
        .slice(0, 24);
      await sendWhatsappTemplate({
        caseId,
        caseData: after,
        notificationType: "auditFeedback",
        notificationKey: auditKey,
        templateName: whatsappAuditTemplate.value(),
        parameters: [],
      });
    }
  }
);

function mustGetConfig(path, hint) {
  // v2 functions still exposes runtime config via process.env for params,
  // but functions.config() remains supported for legacy config.
  // We stick with functions.config()-style to match firebase functions:config:set.
  // eslint-disable-next-line global-require
  const functionsV1 = require("firebase-functions");
  const val = path
    .split(".")
    .reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), functionsV1.config());
  if (!val) throw new HttpsError("failed-precondition", hint);
  return String(val);
}

async function assertCallerIsAdminOrDev(uid) {
  const snap = await admin.database().ref(`users/${uid}/role`).get();
  const role = String(snap.val() || "").trim().toLowerCase();
  if (role !== "admin" && role !== "dev") {
    throw new HttpsError("permission-denied", "Admin/dev access required.");
  }
}

function buildTransport() {
  const email = mustGetConfig(
    "gmail.email",
    "Missing config gmail.email. Set via: firebase functions:config:set gmail.email=\"spacesolutions2016@gmail.com\""
  );
  const pass = mustGetConfig(
    "gmail.pass",
    "Missing config gmail.pass (Gmail App Password). Set via: firebase functions:config:set gmail.pass=\"xxxx xxxx xxxx xxxx\""
  );

  // For Gmail SMTP, an App Password is required (not your normal login password).
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass },
  });
}

function randomToken() {
  // 64 hex chars. We store only the hash server-side.
  return crypto.randomBytes(32).toString("hex");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

exports.sendDigitalVerificationEmail = onCall(
  {
    region: "us-central1",
    cors: [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "https://yourdomain.com",
    ],
  },
  async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Login required.");
  }
  await assertCallerIsAdminOrDev(request.auth.uid);

  const baseUrl = String(
    (request.data && request.data.baseUrl) || mustGetConfig(
      "candidate.base_url",
      "Missing config candidate.base_url. Set via: firebase functions:config:set candidate.base_url=\"https://yourdomain.com\""
    )
  ).replace(/\/+$/, "");

  const caseIds = Array.isArray(request.data?.caseIds) ? request.data.caseIds.map(String).filter(Boolean) : [];
  if (caseIds.length === 0) {
    throw new HttpsError("invalid-argument", "caseIds[] is required.");
  }

  const gmailFrom = mustGetConfig("gmail.email", "Missing config gmail.email.");
  const transport = buildTransport();

  const results = [];
  const now = Date.now();
  const expiresAt = now + 72 * 60 * 60 * 1000; // 72 hours

  for (const caseId of caseIds) {
    const caseRef = admin.database().ref(`cases/${caseId}`);
    const snap = await caseRef.get();
    const c = snap.val();
    if (!c) {
      results.push({ caseId, ok: false, error: "Case not found" });
      continue;
    }

    const verificationMode = String(c.verificationMode || "").toLowerCase();
    const status = String(c.status || "").toLowerCase();
    const isDigital = verificationMode === "digital" || status === "awaiting_candidate";
    if (!isDigital) {
      results.push({ caseId, ok: false, error: "Case is not marked digital verification" });
      continue;
    }

    const to = String(c.candidateEmail || "").trim();
    if (!to) {
      results.push({ caseId, ok: false, error: "Missing candidateEmail on case" });
      continue;
    }

    const token = randomToken();
    const hash = tokenHash(token);
    const link = `${baseUrl}/verify/${token}`;

    const tokenRecord = {
      caseId,
      createdAt: now,
      expiresAt,
      usedAt: null,
      status: "active",
    };

    await admin.database().ref(`digitalVerificationTokens/${hash}`).set(tokenRecord);
    await caseRef.update({
      verificationMode: "digital",
      status: "awaiting_candidate",
      digitalRequestedAt: c.digitalRequestedAt || new Date(now).toISOString(),
      candidateLinkSentAt: new Date(now).toISOString(),
      candidateLinkSentTo: to,
      digitalVerification: {
        tokenHash: hash,
        expiresAt,
        linkSentAt: now,
        channel: "email",
      },
    });

    const candidateName = String(c.candidateName || "Candidate");
    const refNo = String(c.matrixRefNo || "");

    const subject = refNo
      ? `Verification required: ${refNo}`
      : "Verification required";

    const text =
      `Hi ${candidateName},\n\n` +
      `Please complete your digital verification using the link below:\n` +
      `${link}\n\n` +
      `This link will expire in 72 hours.\n\n` +
      `Thanks,\n` +
      `Space Solutions`;

    try {
      await transport.sendMail({
        from: gmailFrom,
        to,
        subject,
        text,
      });
      results.push({ caseId, ok: true, sentTo: to });
    } catch (e) {
      await caseRef.update({
        candidateLinkSendError: String(e?.message || e),
        candidateLinkSendErrorAt: new Date().toISOString(),
      });
      results.push({ caseId, ok: false, error: String(e?.message || e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return { ok: failCount === 0, okCount, failCount, results };
});

exports.sendMonthEndReportEmail = onCall(
  {
    region: "us-central1",
    cors: [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "https://yourdomain.com",
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Login required.");
    }
    await assertCallerIsAdminOrDev(request.auth.uid);

    const gmailFrom = mustGetConfig("gmail.email", "Missing config gmail.email.");
    const transport = buildTransport();

    const recipientsRaw = request.data?.recipients;
    const recipients = Array.isArray(recipientsRaw)
      ? recipientsRaw.map(String).map((s) => s.trim()).filter(Boolean)
      : String(recipientsRaw || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (recipients.length === 0) {
      throw new HttpsError("invalid-argument", "recipients is required.");
    }

    const filename = String(request.data?.filename || "MonthEndReport.pdf").slice(0, 140);
    const pdfBase64 = String(request.data?.pdfBase64 || "");
    if (!pdfBase64) {
      throw new HttpsError("invalid-argument", "pdfBase64 is required.");
    }

    // Keep a conservative limit to avoid callable payload issues.
    // Base64 expands by ~33%; 6.5MB base64 ≈ 4.8MB binary.
    if (pdfBase64.length > 6_500_000) {
      throw new HttpsError("invalid-argument", "pdfBase64 too large for callable request.");
    }

    const subject = String(request.data?.subject || "Space Solutions - Month End Report").slice(0, 200);
    const text = String(request.data?.body || "Hi,\n\nPlease find the month end report attached.\n\nRegards,\nSpace Solutions");

    try {
      const info = await transport.sendMail({
        from: gmailFrom,
        to: recipients.join(","),
        subject,
        text,
        attachments: [
          {
            filename,
            content: pdfBase64,
            encoding: "base64",
            contentType: "application/pdf",
          },
        ],
      });
      return { ok: true, messageId: info?.messageId || null };
    } catch (e) {
      throw new HttpsError("internal", String(e?.message || e));
    }
  }
);

exports.sendMemberReportEmail = onCall(
  {
    region: "us-central1",
    cors: [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "https://yourdomain.com",
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Login required.");
    }
    await assertCallerIsAdminOrDev(request.auth.uid);

    const gmailFrom = mustGetConfig("gmail.email", "Missing config gmail.email.");
    const transport = buildTransport();

    const recipient = String(request.data?.recipient || "").trim();
    if (!recipient || !recipient.includes("@")) {
      throw new HttpsError("invalid-argument", "recipient is required.");
    }

    const filename = String(request.data?.filename || "IndividualReport.pdf").slice(0, 140);
    const pdfBase64 = String(request.data?.pdfBase64 || "");
    if (!pdfBase64) {
      throw new HttpsError("invalid-argument", "pdfBase64 is required.");
    }
    if (pdfBase64.length > 6_500_000) {
      throw new HttpsError("invalid-argument", "pdfBase64 too large for callable request.");
    }

    const subject = String(request.data?.subject || "Space Solutions - Individual Report").slice(0, 200);
    const text = String(request.data?.body || "Hi,\n\nPlease find your individual report attached.\n\nRegards,\nSpace Solutions");

    try {
      const info = await transport.sendMail({
        from: gmailFrom,
        to: recipient,
        subject,
        text,
        attachments: [
          {
            filename,
            content: pdfBase64,
            encoding: "base64",
            contentType: "application/pdf",
          },
        ],
      });

      // Lightweight audit trail (best-effort).
      try {
        const now = Date.now();
        const entry = {
          type: "member_report",
          recipient,
          subject,
          filename,
          memberUid: String(request.data?.memberUid || ""),
          monthKey: String(request.data?.monthKey || ""),
          sentBy: request.auth.uid,
          sentAt: now,
          messageId: info?.messageId || null,
        };
        await admin.database().ref("mailLogs/memberReports").push(entry);
      } catch (e) {
        // ignore audit log failures
      }

      return { ok: true, messageId: info?.messageId || null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }
);
