/**
 * Normalize WhatsApp for storage and lookup: digits only; prepend India 91 when missing.
 * Aligns admin create, bulk create, and auth login lookups.
 */
function normalizeWhatsappDigits (whatsappRaw) {
  if (whatsappRaw === undefined || whatsappRaw === null) return undefined
  const s = String(whatsappRaw).trim()
  if (!s) return undefined
  let digits = s.replace(/\D/g, '')
  if (digits && !digits.startsWith('91')) {
    digits = '91' + digits
  }
  return digits || undefined
}

module.exports = { normalizeWhatsappDigits }
