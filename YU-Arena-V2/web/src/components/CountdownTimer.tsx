import { useState, useEffect } from "react";

interface CountdownTimerProps {
  expiresAt: string;
  onExpired?: () => void;
}

export default function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => calc());

  function calc() {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  }

  useEffect(() => {
    const id = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const urgent = remaining <= 30;

  return (
    <span className={`countdown ${urgent ? "countdown-urgent" : ""}`}>
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}
