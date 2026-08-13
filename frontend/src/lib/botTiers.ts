import type { Settings } from '@/lib/schemas/settingsSchemas';

/**
 * The selectable bot tiers, in ladder order.
 *
 * The ids are storage keys: they are written to `games.ai_difficulty` and to saved games in
 * localStorage, so they stay put while the labels move. Two consequences worth knowing:
 *
 * - 'bot0' is absent. It never placed a wall, which made Easy a give-me, so it was retired from
 *   selection and every other tier shifted down a name. Games recorded against it still need a
 *   label, which is why the label maps in `gameReducer` and `GameCard` still carry it.
 * - 'mcts' is members-only. It costs the backend about a second of CPU per move, where every
 *   other tier is free, and the API enforces that independently (403 for a guest).
 *
 * Kept out of PlayPanel so it can be imported without pulling in React and the router.
 */
export interface BotTier {
  readonly id: Settings['difficulty'];
  readonly label: string;
  readonly desc: string;
  readonly membersOnly?: boolean;
}

export const BOT_TIERS: readonly BotTier[] = [
  { id: 'bot1', label: 'Easy', desc: 'Basic strategy' },
  { id: 'bot2', label: 'Medium', desc: 'Advantage focused' },
  { id: 'extreme', label: 'Hard', desc: 'Trained neural net' },
  { id: 'mcts', label: 'Extreme', desc: 'Tree search engine', membersOnly: true },
];

export const DEFAULT_DIFFICULTY: Settings['difficulty'] = 'bot2';

/**
 * The tier to show selected, given what the player last chose and whether they are signed in.
 * A saved value can be unpickable in two ways, a retired tier or a members-only one, and both
 * have to resolve to something playable so Play is never a dead end.
 */
export function selectableDifficulty(
  saved: Settings['difficulty'],
  isGuest: boolean,
): Settings['difficulty'] {
  const tier = BOT_TIERS.find((t) => t.id === saved);
  if (!tier) return DEFAULT_DIFFICULTY;
  if (tier.membersOnly === true && isGuest) return DEFAULT_DIFFICULTY;
  return saved;
}
