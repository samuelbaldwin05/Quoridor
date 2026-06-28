// Words that are never allowed as usernames or substrings of usernames.
const BLOCKED_WORDS = [
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'fag',
  'bitch', 'cock', 'pussy', 'asshole', 'dick', 'whore', 'slut',
  'prick', 'twat', 'wanker', 'bastard',
];

// Names reserved for the platform itself — prevent impersonation.
const RESERVED_NAMES = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'system',
  'support', 'quoridor', 'staff', 'official',
]);

/**
 * Validates a username string.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateUsername(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length < 3) return 'At least 3 characters.';
  if (trimmed.length > 24) return 'At most 24 characters.';

  // Only ASCII letters, digits, and underscores — no accented/non-latin chars.
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Letters, numbers, and underscores only.';

  const lower = trimmed.toLowerCase();

  if (RESERVED_NAMES.has(lower)) return 'Username not allowed.';
  if (BLOCKED_WORDS.some((w) => lower.includes(w))) return 'Username not allowed.';

  return null;
}
