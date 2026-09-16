const DEFAULT_MESSAGE_TEMPLATE = (name) =>
  `Hello ${name},\n\nNew toys have arrived at Toys Corner. Visit us for a special discount today!`;

/**
 * Opens a WhatsApp chat with a pre-filled message via the manual wa.me link
 * (per the spec's "Manual WhatsApp Link" approach — no API needed for this).
 * Swappable for WhatsApp Cloud API later without changing call sites.
 *
 * customMessage, if given, is used as-is (with {name} replaced) instead of
 * the default offer text — used by the bulk broadcast queue below.
 *
 * target: window.open's second argument. Defaults to '_blank', which always
 * opens a brand-new tab. Pass a fixed string (e.g. 'toys_corner_whatsapp')
 * to reuse the same tab across repeated calls — browsers route window.open
 * calls sharing a target name to the same window instead of spawning a new
 * one each time. Used by the bulk broadcast queue so WhatsApp Web opens once
 * and subsequent contacts just navigate within that same tab.
 */
export function openWhatsApp(phone, customerName, customMessage, target = '_blank') {
  // Strip anything non-numeric, assume Indian numbers (91 prefix) if not already present
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.startsWith('91') ? digits : `91${digits}`;

  const message = customMessage
    ? customMessage.replaceAll('{name}', customerName)
    : DEFAULT_MESSAGE_TEMPLATE(customerName);

  const url = `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;

  window.open(url, target);
}
