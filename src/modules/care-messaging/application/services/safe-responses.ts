/** Fixed safe responses — no LLM, no retrieval (ADR-0017 safety matrix). */

export const CHAT_NOTICE =
  "Please don't share personal or pet-specific details in this chat. If your pet is having an emergency, call the clinic now.";

export function emergencyResponse(phone: string): string {
  return `This sounds like an emergency. Please call the clinic immediately at ${phone}. If you can safely transport your pet, come in right away — do not wait for this chat.`;
}

export function privateDataResponse(
  phone: string,
  contactUrl: string,
  bookingUrl: string,
): string {
  return `I can't access personal records, appointments, prescriptions, or billing in this chat. Please call the clinic at ${phone}, use the contact form at ${contactUrl}, or book an appointment at ${bookingUrl}.`;
}

export function handoffConfirmation(phone: string): string {
  return `I've let the clinic team know you'd like to speak with someone. A staff member will reply here as soon as they're available. For anything urgent, please call ${phone} now.`;
}
