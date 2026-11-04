// Public business contact only. Verified from the CIPS Dropbox website source
// CIPS/site/index.html, fetched 2026-09-20 (file modified 2026-09-18).
// Also listed against Simon Porritt by British Superyacht. This is the CIPS
// duty contact, not a claim about who is currently answering the phone.
export const SIMON_CONTACT = Object.freeze({
  label: 'Simon / CIPS duty contact',
  display: '+44 7797 720 723',
  phone: '+447797720723',
  whatsapp: '447797720723',
  verifiedOn: '2026-09-20',
  source: 'CIPS/site/index.html (Dropbox Website 2026)',
});
export function contactLinks(contact = SIMON_CONTACT) {
  if (!/^\+[1-9]\d{6,14}$/.test(contact.phone) || !/^[1-9]\d{6,14}$/.test(contact.whatsapp)) {
    throw new Error('Use verified international business numbers');
  }
  return Object.freeze({phone: 'tel:' + contact.phone, whatsapp: 'https://wa.me/' + contact.whatsapp});
}
// No pre-filled order, coordinates, score, tracking identifier, microphone or
// network request. The player chooses the external app and sends any message.
