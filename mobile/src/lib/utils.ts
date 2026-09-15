export function getGreetingName(displayName?: string | null, email?: string | null): string {
  if (displayName && displayName.trim()) {
    const first = displayName.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9'-]/g, '');
    if (first) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  if (email && email.trim()) {
    const prefix = email.split('@')[0].replace(/[._-]/g, ' ').trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9'-]/g, '');
    if (prefix) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
  }
  return 'there';
}
