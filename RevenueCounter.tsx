// components/metrics/RevenueCounter.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RevenueCounterProps {
  initialRevenue?: number;
  period?: 'today' | 'all';
}

export function RevenueCounter({ initialRevenue = 0, period = 'today' }: RevenueCounterProps) {
  const [revenue, setRevenue] = useState(initialRevenue);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [recentAmount, setRecentAmount] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial revenue on mount
  useEffect(() => {
    async function fetchInitialRevenue() {
      try {
        const response = await fetch(`/api/revenue/recovered?period=${period}`);
        const data = await response.json();
        setRevenue(data.total_revenue);
      } catch (error) {
        console.error('Failed to fetch initial revenue:', error);
      }
    }

    fetchInitialRevenue();
  }, [period]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'REVENUE_RECOVERED') {
          // Update revenue based on period
          const newRevenue = period === 'today' ? data.total_today : data.total_all_time;
          setRevenue(newRevenue);
          setRecentAmount(data.amount);
          setLastUpdate(new Date().toLocaleTimeString());

          // Clear recent amount after animation
          setTimeout(() => setRecentAmount(null), 3000);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    // Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [period]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="revenue-counter">
      <div className="header">
        <h2>Revenue Recovered {period === 'today' ? 'Today' : 'All Time'}</h2>
        <div className="status">
          <div className={`indicator ${isConnected ? 'connected' : 'disconnected'}`} />
          <span>{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div className="amount-container">
        <motion.div
          className="amount"
          key={revenue}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 0.3 }}
        >
          {formatCurrency(revenue)}
        </motion.div>

        <AnimatePresence>
          {recentAmount && (
            <motion.div
              className="recent-update"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              +{formatCurrency(recentAmount)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {lastUpdate && (
        <div className="last-update">
          Last update: {lastUpdate}
        </div>
      )}

      <style jsx>{`
        .revenue-counter {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          padding: 2rem;
          color: white;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .header h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          opacity: 0.9;
        }

        .indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .indicator.connected {
          background-color: #10b981;
        }

        .indicator.disconnected {
          background-color: #ef4444;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .amount-container {
          position: relative;
          min-height: 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .amount {
          font-size: 4rem;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.02em;
        }

        .recent-update {
          position: absolute;
          top: -20px;
          right: 0;
          background: rgba(16, 185, 129, 0.2);
          border: 2px solid #10b981;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 1.25rem;
          font-weight: 700;
          color: #10b981;
        }

        .last-update {
          text-align: center;
          font-size: 0.875rem;
          opacity: 0.8;
          margin-top: 1rem;
        }

        @media (max-width: 768px) {
          .revenue-counter {
            padding: 1.5rem;
          }

          .amount {
            font-size: 3rem;
          }

          .recent-update {
            font-size: 1rem;
            padding: 0.375rem 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
