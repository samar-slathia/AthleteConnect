export const CUSTOMER_QUICK_MESSAGES: readonly string[] = [
  'Are you on your way?',
  'Are we still on for today?',
  'I’m on my way.',
  'I’ve arrived.',
  'Can we adjust the timing?',
  'Please share the exact meeting point.',
  'We may be a little late.',
  'Thank you!',
];

export const COACH_QUICK_MESSAGES: readonly string[] = [
  'I’m on my way.',
  'I’ve arrived.',
  'I’ll be there in 10 minutes.',
  'Please confirm the meeting point.',
  'Could you please wait a few minutes?',
  'I’m running a little late.',
  'I’m ready to start.',
  'Thank you!',
];

export function getQuickMessagesForRole(role: string): readonly string[] {
  if (role === 'coach') {
    return COACH_QUICK_MESSAGES;
  }
  return CUSTOMER_QUICK_MESSAGES;
}
