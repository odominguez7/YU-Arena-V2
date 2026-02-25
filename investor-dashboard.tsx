// app/investors/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { RevenueCounter } from '@/components/metrics/RevenueCounter';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricsData {
  revenue: {
    total: number;
    today: number;
    week: number;
    growth_rate: number;
  };
  liquidity: {
    fill_rate: number;
    avg_time_to_fill: number;
    active_operators: number;
    active_demand: number;
  };
  unit_economics: {
    avg_recovery_value: number;
    take_rate: number;
    spots_filled_today: number;
  };
  traction: {
    total_spots_filled: number;
    repeat_usage_rate: number;
    cities: string[];
  };
}

export default function InvestorDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [revenueHistory, setRevenueHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const [metricsRes, historyRes] = await Promise.all([
          fetch('/api/metrics/investor'),
          fetch('/api/revenue/history?days=30'),
        ]);

        const metricsData = await metricsRes.json();
        const historyData = await historyRes.json();

        setMetrics(metricsData);
        setRevenueHistory(historyData);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
        setLoading(false);
      }
    }

    fetchMetrics();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="investor-dashboard loading">
        <div className="spinner">Loading investor metrics...</div>
      </div>
    );
  }

  const revenueChartData = {
    labels: revenueHistory.map(d => d.date),
    datasets: [
      {
        label: 'Revenue Recovered',
        data: revenueHistory.map(d => d.revenue),
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `$${value}`,
        },
      },
    },
  };

  return (
    <div className="investor-dashboard">
      <header className="dashboard-header">
        <div className="title-section">
          <h1>YU Arena: Investor Metrics</h1>
          <p className="subtitle">Revenue Recovery Platform - Pre-Seed</p>
        </div>
        <div className="tagline">
          The Last-Minute Demand Recovery Platform Built on AI Agents + Network Effects
        </div>
      </header>

      {/* North Star Metric */}
      <section className="north-star">
        <div className="section-header">
          <h2>North Star: Revenue Recovered</h2>
          <div className="growth-badge">
            {metrics?.revenue.growth_rate > 0 ? '↑' : '↓'} {Math.abs(metrics?.revenue.growth_rate || 0).toFixed(1)}% WoW
          </div>
        </div>
        
        <div className="revenue-grid">
          <RevenueCounter period="today" />
          <RevenueCounter period="all" />
        </div>

        <div className="chart-container">
          <h3>30-Day Revenue Trend</h3>
          <div className="chart-wrapper">
            <Line data={revenueChartData} options={chartOptions} />
          </div>
        </div>
      </section>

      {/* Network Liquidity */}
      <section className="network-liquidity">
        <h2>Network Liquidity Metrics</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Fill Rate</div>
            <div className="metric-value">{metrics?.liquidity.fill_rate.toFixed(1)}%</div>
            <div className="metric-description">Spots successfully filled</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Time-to-Fill</div>
            <div className="metric-value">{(metrics?.liquidity.avg_time_to_fill / 60).toFixed(1)} hrs</div>
            <div className="metric-description">Average from posted to booked</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Active Operators</div>
            <div className="metric-value">{metrics?.liquidity.active_operators}</div>
            <div className="metric-description">Supply-side participants</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Active Demand</div>
            <div className="metric-value">{metrics?.liquidity.active_demand}</div>
            <div className="metric-description">Users seeking spots</div>
          </div>
        </div>
      </section>

      {/* Unit Economics */}
      <section className="unit-economics">
        <h2>Unit Economics</h2>
        <div className="metrics-grid">
          <div className="metric-card highlighted">
            <div className="metric-label">Avg Recovery Value</div>
            <div className="metric-value">${metrics?.unit_economics.avg_recovery_value.toFixed(2)}</div>
            <div className="metric-description">Per successful booking</div>
          </div>
          
          <div className="metric-card highlighted">
            <div className="metric-label">Take Rate</div>
            <div className="metric-value">{metrics?.unit_economics.take_rate}%</div>
            <div className="metric-description">Revenue share model</div>
          </div>
          
          <div className="metric-card highlighted">
            <div className="metric-label">Spots Filled Today</div>
            <div className="metric-value">{metrics?.unit_economics.spots_filled_today}</div>
            <div className="metric-description">Real-time conversions</div>
          </div>
        </div>
      </section>

      {/* The Moat */}
      <section className="moat">
        <h2>The Moat: Network Effects</h2>
        <div className="moat-content">
          <div className="moat-visual">
            <div className="network-diagram">
              <div className="network-node supply">
                <div className="node-count">{metrics?.liquidity.active_operators}</div>
                <div className="node-label">Operators</div>
              </div>
              
              <div className="network-connections">
                <div className="connection-line"></div>
                <div className="connection-metric">
                  {metrics?.liquidity.fill_rate.toFixed(0)}% Fill Rate
                </div>
              </div>
              
              <div className="network-node demand">
                <div className="node-count">{metrics?.liquidity.active_demand}</div>
                <div className="node-label">Users</div>
              </div>
            </div>
          </div>
          
          <div className="moat-principles">
            <div className="principle">
              <div className="principle-icon">→</div>
              <div className="principle-text">
                <strong>More operators</strong> → Better selection for users
              </div>
            </div>
            
            <div className="principle">
              <div className="principle-icon">→</div>
              <div className="principle-text">
                <strong>More users</strong> → Higher fill rates for operators
              </div>
            </div>
            
            <div className="principle">
              <div className="principle-icon">→</div>
              <div className="principle-text">
                <strong>Liquidity creates switching costs</strong> - The network becomes the value
              </div>
            </div>
            
            <div className="principle highlight">
              <div className="principle-icon">🔒</div>
              <div className="principle-text">
                <strong>Mint position:</strong> We own the recovery transaction layer
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Now */}
      <section className="why-now">
        <h2>Why Now?</h2>
        <div className="why-now-grid">
          <div className="why-card">
            <div className="why-number">1</div>
            <div className="why-title">AI agents enable real-time matching at scale</div>
            <div className="why-description">
              Multi-agent systems can now coordinate supply-demand matching faster than humans
            </div>
          </div>
          
          <div className="why-card">
            <div className="why-number">2</div>
            <div className="why-title">Post-pandemic: Operators need revenue recovery</div>
            <div className="why-description">
              Service businesses face sustained capacity challenges and revenue pressure
            </div>
          </div>
          
          <div className="why-card">
            <div className="why-number">3</div>
            <div className="why-title">Consumers trained on last-minute apps</div>
            <div className="why-description">
              Users comfortable with dynamic pricing and instant booking experiences
            </div>
          </div>
          
          <div className="why-card">
            <div className="why-number">4</div>
            <div className="why-title">Calendar APIs now ubiquitous</div>
            <div className="why-description">
              Integration infrastructure exists across booking platforms
            </div>
          </div>
          
          <div className="why-card">
            <div className="why-number">5</div>
            <div className="why-title">Trust infrastructure exists</div>
            <div className="why-description">
              Payments, identity verification, and reputation systems are mature
            </div>
          </div>
        </div>
      </section>

      {/* Traction */}
      <section className="traction">
        <h2>Traction</h2>
        <div className="traction-grid">
          <div className="traction-card">
            <div className="traction-label">Total Revenue Recovered</div>
            <div className="traction-value">${metrics?.revenue.total.toLocaleString()}</div>
          </div>
          
          <div className="traction-card">
            <div className="traction-label">Total Spots Filled</div>
            <div className="traction-value">{metrics?.traction.total_spots_filled.toLocaleString()}</div>
          </div>
          
          <div className="traction-card">
            <div className="traction-label">Repeat Usage Rate</div>
            <div className="traction-value">{metrics?.traction.repeat_usage_rate}%</div>
          </div>
          
          <div className="traction-card">
            <div className="traction-label">Markets</div>
            <div className="traction-value">{metrics?.traction.cities.join(', ')}</div>
          </div>
        </div>
      </section>

      <style jsx>{`
        .investor-dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 3rem 2rem;
          background: #f8f9fa;
        }

        .dashboard-header {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .title-section h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          color: #1a1a1a;
        }

        .subtitle {
          font-size: 1.125rem;
          color: #667eea;
          font-weight: 600;
          margin: 0;
        }

        .tagline {
          margin-top: 1rem;
          font-size: 1.125rem;
          color: #666;
          font-weight: 500;
        }

        section {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        section h2 {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 0 0 1.5rem 0;
          color: #1a1a1a;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .growth-badge {
          background: #10b981;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
        }

        .revenue-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .chart-container {
          margin-top: 2rem;
        }

        .chart-container h3 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: #666;
        }

        .chart-wrapper {
          height: 300px;
          max-width: 100%;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .metric-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1.5rem;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .metric-card:hover {
          border-color: #667eea;
          transform: translateY(-2px);
        }

        .metric-card.highlighted {
          background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
        }

        .metric-label {
          font-size: 0.875rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.5rem;
        }

        .metric-value {
          font-size: 2.5rem;
          font-weight: 800;
          color: #1a1a1a;
          line-height: 1.2;
          margin-bottom: 0.25rem;
        }

        .metric-description {
          font-size: 0.875rem;
          color: #888;
        }

        .moat-content {
          display: grid;
          grid-template-columns: 1fr 1.5fr;
          gap: 3rem;
        }

        .network-diagram {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .network-node {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .network-node.supply {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .network-node.demand {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
        }

        .node-count {
          font-size: 3rem;
          font-weight: 800;
        }

        .node-label {
          font-size: 0.875rem;
          opacity: 0.9;
        }

        .network-connections {
          text-align: center;
        }

        .connection-line {
          width: 4px;
          height: 60px;
          background: linear-gradient(to bottom, #667eea, #f5576c);
          margin: 0 auto 0.5rem;
        }

        .connection-metric {
          font-weight: 700;
          color: #667eea;
        }

        .moat-principles {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .principle {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .principle.highlight {
          background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
          border: 2px solid #667eea;
        }

        .principle-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .principle-text {
          font-size: 1rem;
          line-height: 1.6;
        }

        .why-now-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .why-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1.5rem;
          border-left: 4px solid #667eea;
        }

        .why-number {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #667eea;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.25rem;
          margin-bottom: 1rem;
        }

        .why-title {
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 0.5rem;
          font-size: 1.125rem;
        }

        .why-description {
          font-size: 0.875rem;
          color: #666;
          line-height: 1.5;
        }

        .traction-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .traction-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 12px;
          padding: 1.5rem;
        }

        .traction-label {
          font-size: 0.875rem;
          opacity: 0.9;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .traction-value {
          font-size: 2rem;
          font-weight: 800;
        }

        @media (max-width: 768px) {
          .investor-dashboard {
            padding: 2rem 1rem;
          }

          .title-section h1 {
            font-size: 1.75rem;
          }

          .moat-content {
            grid-template-columns: 1fr;
          }

          .network-node {
            width: 120px;
            height: 120px;
          }

          .node-count {
            font-size: 2.5rem;
          }
        }
      `}</style>
    </div>
  );
}
