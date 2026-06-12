import { decode as atob, encode as btoa } from "base-64";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function base64ToUint8Array(base64) {
  const clean = String(base64 || "").includes(",") ? String(base64).split(",").pop() : String(base64 || "");
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Safe Uint8Array -> base64 converter (chunked to avoid call-stack issues)
export function uint8ToBase64Safe(u8) {
  const uint8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const sub = uint8.subarray(i, i + CHUNK_SIZE);
    for (let j = 0; j < sub.length; j++) binary += String.fromCharCode(sub[j]);
  }
  return btoa(binary);
}

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const isCompleted = (status) => ["completed", "closed"].includes(status);
const isPending = (status) => ["pending", "open", "assigned"].includes(status);

const getCaseTimestamp = (c) => {
  const v = c?.completedAt || c?.assignedAt || c?.updatedAt || c?.dateInitiated || c?.createdAt || null;
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

function formatDate(d) {
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return String(d);
  }
}

function safeText(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

function caseRef(c) {
  return safeText(c?.matrixRefNo || c?.refNo || c?.referenceNo || c?.id || "");
}

export function buildMemberReportModel({ member, cases, anchorDate = new Date() }) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
  const monthLabel = anchorDate.toLocaleString(undefined, { month: "long", year: "numeric" });
  const monthKey = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, "0")}`;

  const uid = String(member?.id || member?.uid || "").trim();
  const inRange = (d) => d && d >= monthStart && d < monthEnd;

  const memberCases = (Array.isArray(cases) ? cases : []).filter((c) => {
    const assignedTo = String(c?.assignedTo || c?.assigneeId || c?.userId || "").trim();
    if (!uid || !assignedTo) return false;
    if (assignedTo !== uid) return false;
    return inRange(getCaseTimestamp(c));
  });

  const counts = { completed: 0, pending: 0, reverted: 0, fired: 0, other: 0, total: memberCases.length };
  for (const c of memberCases) {
    const st = normalizeStatus(c?.status);
    if (isCompleted(st)) counts.completed++;
    else if (isPending(st)) counts.pending++;
    else if (st === "reverted") counts.reverted++;
    else if (st === "fired") counts.fired++;
    else counts.other++;
  }

  const completionRate = counts.total === 0 ? 0 : Math.round((counts.completed / counts.total) * 100);

  const districtCounts = {};
  for (const c of memberCases) {
    const d = safeText(c?.district || c?.city || c?.state || "");
    if (!d) continue;
    districtCounts[d] = (districtCounts[d] || 0) + 1;
  }
  const topDistricts = Object.entries(districtCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const recentCases = memberCases
    .slice()
    .sort((a, b) => (getCaseTimestamp(b)?.getTime() || 0) - (getCaseTimestamp(a)?.getTime() || 0))
    .slice(0, 25)
    .map((c) => ({
      ref: caseRef(c) || safeText(c?.id || ""),
      name: safeText(c?.candidateName || c?.name || c?.fullName || c?.personName || ""),
      status: safeText(c?.status || ""),
      date: getCaseTimestamp(c) ? formatDate(getCaseTimestamp(c)) : "",
      district: safeText(c?.district || c?.city || c?.state || ""),
    }));

  const memberName = safeText(member?.name || member?.fullName || member?.displayName || member?.email || uid || "Member");

  return {
    memberName,
    uid,
    memberEmail: safeText(member?.email || member?.mail || member?.emailId || ""),
    monthLabel,
    monthKey,
    generatedAt: anchorDate,
    counts,
    completionRate,
    topDistricts,
    recentCases,
  };
}

export async function buildMemberReportPdfBytes({ member, cases, anchorDate = new Date() }) {
  const model = buildMemberReportModel({ member, cases, anchorDate });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 44;
  const line = 16;
  const muted = rgb(0.35, 0.4, 0.47);
  const dark = rgb(0.06, 0.1, 0.17);
  const blue = rgb(0.15, 0.39, 0.92);

  const drawTitle = (page, text, y) => {
    page.drawText(text, { x: margin, y, size: 22, font: fontBold, color: dark });
  };

  const drawSub = (page, text, y) => {
    page.drawText(text, { x: margin, y, size: 12, font, color: muted });
  };

  const drawKvp = (page, label, value, x, y) => {
    page.drawText(label, { x, y, size: 10, font, color: muted });
    page.drawText(value, { x, y: y - 14, size: 14, font: fontBold, color: dark });
  };

  const tryFetchBytes = async (uri) => {
    if (!uri) return null;
    try {
      const res = await fetch(uri);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  };

  const logoUri = member?.__logoUri || null;
  const photoUri = member?.photoURL || member?.photoUrl || member?.avatar || member?.profilePhoto || null;

  const logoBytes = await tryFetchBytes(logoUri);
  let logoImg = null;
  if (logoBytes) {
    try {
      logoImg = await pdfDoc.embedPng(logoBytes);
    } catch {
      logoImg = null;
    }
  }

  const photoBytes = await tryFetchBytes(photoUri);
  let photoImg = null;
  if (photoBytes) {
    try {
      // try png first, then jpg
      photoImg = await pdfDoc.embedPng(photoBytes);
    } catch {
      try {
        photoImg = await pdfDoc.embedJpg(photoBytes);
      } catch {
        photoImg = null;
      }
    }
  }

  // --- Page 1: Cover ---
  {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: rgb(0.96, 0.98, 1) });
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 130, width: A4_WIDTH, height: 130, color: rgb(0.93, 0.96, 1) });
    page.drawText("Space Solutions", { x: margin, y: A4_HEIGHT - 72, size: 18, font: fontBold, color: blue });
    page.drawText("Individual Member Report", { x: margin, y: A4_HEIGHT - 98, size: 12, font, color: muted });

    if (logoImg) {
      const maxW = 96;
      const maxH = 96;
      const dims = logoImg.scaleToFit(maxW, maxH);
      page.drawImage(logoImg, {
        x: A4_WIDTH - margin - dims.width,
        y: A4_HEIGHT - 110,
        width: dims.width,
        height: dims.height,
      });
    }

    drawTitle(page, model.memberName, A4_HEIGHT - 210);
    drawSub(page, `Month: ${model.monthLabel}`, A4_HEIGHT - 232);
    drawSub(page, `Generated: ${model.generatedAt.toLocaleString()}`, A4_HEIGHT - 250);

    page.drawRectangle({ x: margin, y: 120, width: A4_WIDTH - margin * 2, height: 1, color: rgb(0.82, 0.86, 0.92) });
    page.drawText("Operational KPIs • Case Summary • Recent Activity", { x: margin, y: 92, size: 11, font, color: muted });
  }

  // --- Page 2: Summary ---
  {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    // Colorful header
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 160, width: A4_WIDTH, height: 160, color: rgb(0.06, 0.1, 0.17) });
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 160, width: A4_WIDTH, height: 6, color: rgb(0.15, 0.39, 0.92) });
    page.drawText("Member Snapshot", { x: margin, y: A4_HEIGHT - 62, size: 18, font: fontBold, color: rgb(0.92, 0.96, 1) });
    page.drawText(model.memberName, { x: margin, y: A4_HEIGHT - 88, size: 12, font, color: rgb(0.75, 0.82, 0.9) });
    page.drawText(model.monthLabel, { x: margin, y: A4_HEIGHT - 108, size: 12, font, color: rgb(0.75, 0.82, 0.9) });

    if (photoImg) {
      const dims = photoImg.scaleToFit(86, 86);
      page.drawRectangle({
        x: A4_WIDTH - margin - 96,
        y: A4_HEIGHT - 128,
        width: 96,
        height: 96,
        color: rgb(0.1, 0.16, 0.25),
      });
      page.drawImage(photoImg, {
        x: A4_WIDTH - margin - 96 + (96 - dims.width) / 2,
        y: A4_HEIGHT - 128 + (96 - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }

    const y0 = A4_HEIGHT - 220;
    const colW = (A4_WIDTH - margin * 2) / 3;
    drawKvp(page, "Total Cases", String(model.counts.total), margin, y0);
    drawKvp(page, "Completed", String(model.counts.completed), margin + colW, y0);
    drawKvp(page, "Pending", String(model.counts.pending), margin + colW * 2, y0);

    drawKvp(page, "Reverted", String(model.counts.reverted), margin, y0 - 60);
    drawKvp(page, "Fired", String(model.counts.fired), margin + colW, y0 - 60);
    drawKvp(page, "Completion Rate", `${model.completionRate}%`, margin + colW * 2, y0 - 60);

    // Bar + "pie" style legend (visual summary)
    const barX = margin;
    const barY = y0 - 118;
    const barW = A4_WIDTH - margin * 2;
    const barH = 14;
    const total = Math.max(1, model.counts.total);
    const seg = [
      { k: "completed", v: model.counts.completed, c: rgb(0.13, 0.77, 0.36) },
      { k: "pending", v: model.counts.pending, c: rgb(0.96, 0.62, 0.14) },
      { k: "reverted", v: model.counts.reverted, c: rgb(0.94, 0.27, 0.27) },
      { k: "fired", v: model.counts.fired, c: rgb(0.66, 0.33, 0.97) },
      { k: "other", v: model.counts.other, c: rgb(0.39, 0.45, 0.55) },
    ].filter((s) => s.v > 0);

    page.drawRectangle({ x: barX, y: barY, width: barW, height: barH, color: rgb(0.93, 0.95, 0.98) });
    let cursor = barX;
    for (const s of seg) {
      const w = Math.max(2, Math.round((s.v / total) * barW));
      page.drawRectangle({ x: cursor, y: barY, width: w, height: barH, color: s.c });
      cursor += w;
    }

    let legendY = barY - 26;
    page.drawText("Status split (bar + legend)", { x: margin, y: legendY + 12, size: 11, font: fontBold, color: dark });
    legendY -= 10;
    const legend = [
      { t: "Completed", v: model.counts.completed, c: rgb(0.13, 0.77, 0.36) },
      { t: "Pending", v: model.counts.pending, c: rgb(0.96, 0.62, 0.14) },
      { t: "Reverted", v: model.counts.reverted, c: rgb(0.94, 0.27, 0.27) },
      { t: "Fired", v: model.counts.fired, c: rgb(0.66, 0.33, 0.97) },
      { t: "Other", v: model.counts.other, c: rgb(0.39, 0.45, 0.55) },
    ];
    let lx = margin;
    for (const item of legend) {
      if (item.v <= 0) continue;
      page.drawRectangle({ x: lx, y: legendY, width: 10, height: 10, color: item.c });
      const pct = Math.round((item.v / total) * 100);
      page.drawText(`${item.t}: ${item.v} (${pct}%)`, { x: lx + 14, y: legendY + 1, size: 10, font, color: muted });
      legendY -= 14;
      if (legendY < 480) {
        legendY = barY - 36;
        lx = margin + 260;
      }
    }

    page.drawText("Top Districts (this month)", { x: margin, y: y0 - 142, size: 12, font: fontBold, color: dark });
    const districts = model.topDistricts.length ? model.topDistricts : [{ name: "N/A", count: 0 }];
    let y = y0 - 168;
    for (const row of districts.slice(0, 10)) {
      page.drawText(`• ${safeText(row.name)}`, { x: margin, y, size: 11, font, color: dark });
      if (row.count) page.drawText(String(row.count), { x: A4_WIDTH - margin - 20, y, size: 11, font: fontBold, color: muted });
      y -= line;
      if (y < 120) break;
    }
  }

  // --- Page 3: Recent cases ---
  {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawTitle(page, "Cases", A4_HEIGHT - margin - 10);
    drawSub(page, `Total cases this month: ${model.counts.total}`, A4_HEIGHT - margin - 32);

    const tableTop = A4_HEIGHT - 110;
    page.drawRectangle({ x: margin, y: tableTop, width: A4_WIDTH - margin * 2, height: 26, color: rgb(0.93, 0.96, 1) });
    page.drawText("#", { x: margin + 8, y: tableTop + 8, size: 10, font: fontBold, color: dark });
    page.drawText("Ref", { x: margin + 30, y: tableTop + 8, size: 10, font: fontBold, color: dark });
    page.drawText("Name", { x: margin + 190, y: tableTop + 8, size: 10, font: fontBold, color: dark });
    page.drawText("Status", { x: margin + 360, y: tableTop + 8, size: 10, font: fontBold, color: dark });
    page.drawText("Date", { x: A4_WIDTH - margin - 70, y: tableTop + 8, size: 10, font: fontBold, color: dark });

    let y = tableTop - 18;
    const rows = model.recentCases.length
      ? model.recentCases
      : [{ ref: "N/A", status: "", district: "", date: "" }];

    let idx = 1;
    for (const r of rows) {
      if (y < 80) break;
      page.drawText(String(idx), { x: margin + 8, y, size: 10, font, color: muted });
      page.drawText(safeText(r.ref).slice(0, 24), { x: margin + 30, y, size: 10, font, color: dark });
      page.drawText(safeText(r.name || "—").slice(0, 22), { x: margin + 190, y, size: 10, font, color: muted });
      page.drawText(safeText(r.status).slice(0, 16), { x: margin + 360, y, size: 10, font, color: muted });
      page.drawText(safeText(r.date).slice(0, 12), { x: A4_WIDTH - margin - 70, y, size: 10, font, color: muted });
      page.drawRectangle({ x: margin, y: y - 6, width: A4_WIDTH - margin * 2, height: 1, color: rgb(0.92, 0.93, 0.95) });
      y -= 18;
      idx++;
    }

    page.drawText(`Member UID: ${safeText(model.uid)}`, { x: margin, y: 44, size: 9, font, color: muted });
  }

  return { pdfBytes: await pdfDoc.save(), model };
}

export function embedPngFromDataUrl(pdfDoc, dataUrl) {
  const bytes = base64ToUint8Array(dataUrl);
  return pdfDoc.embedPng(bytes);
}
