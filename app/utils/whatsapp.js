export function buildWhatsAppUrl(value, message = "") {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);
  if (phone.length === 10) phone = `91${phone}`;
  if (phone.length < 10 || phone.length > 15) return null;

  const messageQuery = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${messageQuery}`;
}
