export interface ActiveJob {
  shift_id: string; application_id: string; teen_id: string; teen_name: string; job_title: string; employer_name: string;
  starts_at: string; ends_at: string; shift_status: string; arrived_at: string | null; finished_at: string | null;
  window_open: boolean; location_allowed: boolean; session_id: string | null; session_ends_by: string | null;
  open_alert_id: string | null; open_alert_level: string | null;
}
export const timeRange = (a: string, b: string) => {
  const d = new Date(a);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  const t = (x: string) => new Date(x).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  return `${day}, ${t(a)}–${t(b)}`;
};
