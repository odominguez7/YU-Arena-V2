import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useWebSocket, WsEvent } from "../hooks/useWebSocket";
import StatCard from "./StatCard";
import DropCard from "./DropCard";

interface Stats {
  recovered_revenue_cents: number;
  drops_launched: number;
  drops_filled: number;
  claims_count: number;
}

interface ScheduleBlock {
  id: string;
  offering_id: string;
  offering_name: string;
  start_time: string;
  end_time: string;
  default_spots: number;
  capacity_status: string;
}

interface Drop {
  id: string;
  title: string;
  status: string;
  spots_available: number;
  price_cents: number;
  expires_at: string;
  claims_count?: number;
}

interface DashboardProps {
  operatorId: string;
  businessName: string;
}

export default function Dashboard({ operatorId, businessName }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [liveDrops, setLiveDrops] = useState<Drop[]>([]);
  const navigate = useNavigate();
  const { events } = useWebSocket(operatorId);

  const refresh = useCallback(async () => {
    const [s, sch, d] = await Promise.all([
      api<Stats>("/stats/today"),
      api<ScheduleBlock[]>("/schedule/today"),
      api<Drop[]>("/drops?status=live"),
    ]);
    setStats(s);
    setSchedule(sch);
    setLiveDrops(d);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (events.length > 0) refresh();
  }, [events, refresh]);

  const fillRate =
    stats && stats.drops_launched > 0
      ? Math.round((stats.drops_filled / stats.drops_launched) * 100)
      : 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-biz">{businessName}</h2>
          <span className="text-muted">{today}</span>
        </div>
      </div>

      <div className="stats-bar">
        <StatCard
          label="Recovered Today"
          value={stats ? `$${(stats.recovered_revenue_cents / 100).toFixed(0)}` : "—"}
          color="var(--green)"
        />
        <StatCard label="Drops Live" value={liveDrops.length} color="var(--accent-light)" />
        <StatCard label="Claims Today" value={stats?.claims_count ?? "—"} />
        <StatCard label="Fill Rate" value={stats ? `${fillRate}%` : "—"} />
      </div>

      {schedule.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Today's Schedule</h3>
          <div className="schedule-list">
            {schedule.map((block) => (
              <div key={block.id} className="schedule-item" onClick={() => navigate("/drop/new", { state: { block } })}>
                <div className="schedule-info">
                  <span className="schedule-name">{block.offering_name}</span>
                  <span className="text-muted">{block.start_time}–{block.end_time}</span>
                </div>
                <span className={`status-tag ${block.capacity_status}`}>{block.capacity_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveDrops.length > 0 && (
        <div className="card">
          <h3>Active Drops</h3>
          {liveDrops.map((drop) => (
            <DropCard
              key={drop.id}
              drop={drop}
              onClick={() => navigate(`/drop/${drop.id}`)}
              onExpired={refresh}
            />
          ))}
        </div>
      )}

      <button className="fab" onClick={() => navigate("/drop/new")}>+ Create Drop</button>
    </div>
  );
}
