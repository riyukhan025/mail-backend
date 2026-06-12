const DAY_MS = 24 * 60 * 60 * 1000;

export const FINE_CONFIG = {
  limitDays: 4,
  currencySymbol: "₹",
};

const safeNumber = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
};

const parseDateMs = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

export const getCaseBaseTimeMs = (caseItem) => {
  // Prefer assignedAt when present (DevDashboard uses it for simulations).
  const assignedAtMs = parseDateMs(caseItem?.assignedAt);
  if (assignedAtMs) return assignedAtMs;
  const initiatedMs = parseDateMs(caseItem?.dateInitiated);
  if (initiatedMs) return initiatedMs;
  const createdMs = parseDateMs(caseItem?.createdAt);
  if (createdMs) return createdMs;
  return 0;
};

export const getCaseFineInfo = (caseItem, nowMs = Date.now(), config = FINE_CONFIG) => {
  const limitDays = safeNumber(config?.limitDays) || FINE_CONFIG.limitDays;

  const baseMs = getCaseBaseTimeMs(caseItem);
  if (!baseMs) {
    return {
      hasBaseTime: false,
      diffDays: 0,
      dueInDays: 0,
      delayDays: 0,
      fineAmount: 0,
      reason: "",
      dueAtMs: 0,
      baseMs: 0,
    };
  }

  const diffDays = Math.max(0, Math.ceil((nowMs - baseMs) / DAY_MS));
  const dueInDays = Math.max(0, limitDays - diffDays);
  const delayDays = Math.max(0, diffDays - limitDays);
  const dueAtMs = baseMs + limitDays * DAY_MS;

  // Penalty tiers (based on delayDays, i.e. "Delayed by X"):
  // delayDays 1–2  -> 10%
  // delayDays 3–4  -> 15%
  // delayDays 5+   -> 25%
  const penaltyPercent =
    delayDays >= 5 ? 25 : delayDays >= 3 ? 15 : delayDays >= 1 ? 10 : 0;

  const reason =
    penaltyPercent > 0
      ? `Penalty applied due to delay (${delayDays} day${delayDays === 1 ? "" : "s"}).`
      : "";

  return {
    hasBaseTime: true,
    diffDays,
    dueInDays,
    delayDays,
    penaltyPercent,
    reason,
    dueAtMs,
    baseMs,
  };
};

export const formatINR = (amount, currencySymbol = FINE_CONFIG.currencySymbol) => {
  const n = safeNumber(amount);
  try {
    return `${currencySymbol}${n.toLocaleString("en-IN")}`;
  } catch {
    return `${currencySymbol}${String(n)}`;
  }
};
