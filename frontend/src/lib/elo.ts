// Every new player starts here. Mirrors ELO_START in the backend elo_service, and is
// the fallback wherever a rating is missing from an API payload or a URL param.
export const STARTING_ELO = 1000;

// Tier color for an ELO rating. Shared by the leaderboard, profile page,
// profile modal, and friends list so the tiers stay visually consistent.
// Thresholds are on the 1000-start rating scale (see backend elo_service).
export function eloColor(elo: number): string {
  if (elo >= 3600) return '#f39c12';
  if (elo >= 3000) return '#3498db';
  if (elo >= 2600) return '#2ecc71';
  return 'rgba(255,255,255,0.6)';
}
