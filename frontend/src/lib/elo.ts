// Tier color for an ELO rating. Shared by the leaderboard, profile page,
// profile modal, and friends list so the tiers stay visually consistent.
export function eloColor(elo: number): string {
  if (elo >= 1800) return '#f39c12';
  if (elo >= 1500) return '#3498db';
  if (elo >= 1300) return '#2ecc71';
  return 'rgba(255,255,255,0.6)';
}
