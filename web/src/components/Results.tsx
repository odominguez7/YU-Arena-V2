import { useEffect, useState } from "react";
import { api } from "../api";
import StatCard from "./StatCard";

interface DayStats {
  day: string;
  drops_launched: number;
  drops_filled: number;
  recovered_revenue_cents: number;
}

export default function Results() {
  const [history, setHistory] = useState<DayStats[]>([]);
  const [days, setDays] = useState(7);

  useEffect(() => {
    api<DayStats[]>(`/stats/history?days=${days}`).then(setHistory);
  }, [days]);

  const totals = history.reduce(
    (acc, d) => ({
      revenue: acc.revenue + Number(d.recovered_revenue_cents),
      launched: acc.launched + Number(d.drops_launched),
      filled: acc.filled + Number(d.drops_filled),
    }),
    { revenue: 0, launched: 0, filled: 0 }
  );

  const fillRate = totals.launched > 0 ? Math.round((totals.filled / totals.launched) * 100) : 0;
  const maxRevenue = Math.max(...history.map((d) => Number(d.recovered_revenue_cents)), 1);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2>Results</h2>
        <div className="period-picker">
          {[7, 14, 30].map((d) => (
            <button key={d} className={`btn btn-sm ${days === d ? "btn-primary" : ""}`} onClick={() => setDays(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="stats-bar">
        <StatCard label={`Recovered (${days}d)`} value={`$${(totals.revenue / 100).toFixed(0)}`} color="var(--green)" />
        <StatCard label="Drops Launched" value={totals.launched} />
        <StatCard label="Drops Filled" value={totals.filled} />
        <StatCard label="Fill Rate" value={`${fillRate}%`} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Daily Recovery</h3>
        <div className="bar-chart">
          {history.map((d) => {
            const rev = Number(d.recovered_revenue_cents);
            const pct = Math.max(2, (rev / maxRevenue) * 100);
            const dayLabel = new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
            return (
              <div key={d.day} className="bar-row">
                <span className="bar-label">{dayLabel}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="bar-value">${(rev / 100).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
