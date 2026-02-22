const BOSTON_TIME_ZONE = "America/New_York";

function parseServerTimestamp(input: string): Date {
  // SQLite timestamps come as "YYYY-MM-DD HH:mm:ss" (UTC without zone).
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)) {
    return new Date(input.replace(" ", "T") + "Z");
  }
  return new Date(input);
}

export function formatBostonTime(input: string): string {
  try {
    const date = parseServerTimestamp(input);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: BOSTON_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return "";
  }
}

export function formatBostonDateTime(input: string): string {
  try {
    const date = parseServerTimestamp(input);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: BOSTON_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "";
  }
}
