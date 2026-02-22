import { api } from "../api";
import { useState } from "react";

interface Claim {
  id: string;
  claimant_name: string;
  claimant_phone: string;
  status: string;
  claimed_at: string;
  confirmed_at: string | null;
}

interface ClaimRowProps {
  claim: Claim;
  onUpdate: () => void;
}

export default function ClaimRow({ claim, onUpdate }: ClaimRowProps) {
  const [loading, setLoading] = useState(false);

  const act = async (action: "confirm" | "reject") => {
    setLoading(true);
    try {
      await api(`/claims/${claim.id}/${action}`, { method: "PATCH" });
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`claim-row status-${claim.status}`}>
      <div className="claim-info">
        <span className="claim-name">{claim.claimant_name}</span>
        <span className="claim-phone">{claim.claimant_phone}</span>
      </div>
      <div className="claim-actions">
        <span className={`status-tag ${claim.status}`}>{claim.status}</span>
        {claim.status === "pending" && (
          <>
            <button className="btn btn-sm btn-confirm" disabled={loading} onClick={() => act("confirm")}>
              Confirm
            </button>
            <button className="btn btn-sm" disabled={loading} onClick={() => act("reject")}>
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
