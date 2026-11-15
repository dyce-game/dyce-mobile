/** "Sent 2 days ago" style relative time. Pure so the wording is tested. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/** "3 mutual friends", "1 mutual friend", or null when there are none (so nothing is shown). */
export function mutualLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} mutual ${count === 1 ? 'friend' : 'friends'}`;
}

/** Tab title with a count, e.g. "All · 24"; no count when zero for the requests tab to stay quiet. */
export function tabLabel(name: string, count: number, hideZero = false): string {
  return hideZero && count === 0 ? name : `${name} · ${count}`;
}
