import { useEffect, useRef, useState } from "react";
import { useSwitchChain } from "wagmi";
import { EXPECTED_CHAIN_ID } from "../constants";

interface NetworkSwitcherProps {
  currentChainId?: number;
}

export default function NetworkSwitcher({ currentChainId }: NetworkSwitcherProps) {
  const { chains, switchChain, isPending, error } = useSwitchChain();
  const [hasAttemptedSwitch, setHasAttemptedSwitch] = useState(false);
  const switchAttemptRef = useRef(false);

  const isWrongNetwork = currentChainId !== EXPECTED_CHAIN_ID;

  // Debug: Log available chains
  console.log("[NetworkSwitcher] Available chains:", chains?.map(c => ({ id: c.id, name: c.name })));
  console.log("[NetworkSwitcher] Current chain ID:", currentChainId, "Expected:", EXPECTED_CHAIN_ID, "Is wrong?", isWrongNetwork);

  // Automatically attempt to switch network when wrong network is detected
  useEffect(() => {
    if (isWrongNetwork && !switchAttemptRef.current && !isPending && switchChain) {
      console.log(`[NetworkSwitcher] Wrong network detected (${currentChainId}). Will auto-switch to Arbitrum Sepolia (${EXPECTED_CHAIN_ID}) in 1 second...`);
      
      // Add a small delay to ensure wallet is ready
      const timeoutId = setTimeout(() => {
        if (isWrongNetwork && !switchAttemptRef.current) {
          console.log(`[NetworkSwitcher] Attempting auto-switch now...`);
          switchAttemptRef.current = true;
          setHasAttemptedSwitch(true);
          
          // Attempt the switch - use proper wagmi syntax with callbacks as second parameter
          switchChain(
            { chainId: EXPECTED_CHAIN_ID },
            {
              onError: (error: Error) => {
                console.error("[NetworkSwitcher] Auto-switch failed:", error);
                console.error("[NetworkSwitcher] Error details:", error.message, error.name);
                // Allow retry by resetting the ref after a delay
                setTimeout(() => {
                  switchAttemptRef.current = false;
                }, 3000);
              },
              onSuccess: () => {
                console.log("[NetworkSwitcher] Successfully switched to Arbitrum Sepolia!");
              },
              onSettled: () => {
                console.log("[NetworkSwitcher] Switch operation completed");
              }
            }
          );
        }
      }, 1000); // Wait 1 second before auto-switching
      
      return () => clearTimeout(timeoutId);
    }
  }, [isWrongNetwork, currentChainId, switchChain, isPending]);

  // Reset attempt flag when network becomes correct
  useEffect(() => {
    if (!isWrongNetwork) {
      switchAttemptRef.current = false;
      setHasAttemptedSwitch(false);
    }
  }, [isWrongNetwork]);

  if (!isWrongNetwork) return null;

  const handleManualSwitch = () => {
    console.log("[NetworkSwitcher] Manual switch requested to chain", EXPECTED_CHAIN_ID);
    switchChain(
      { chainId: EXPECTED_CHAIN_ID },
      {
        onError: (error: Error) => {
          console.error("[NetworkSwitcher] Manual switch failed:", error);
        },
        onSuccess: () => {
          console.log("[NetworkSwitcher] Manual switch successful");
        }
      }
    );
  };

  return (
    <section className="network-switcher" style={{ 
      backgroundColor: '#fff3cd', 
      border: '2px solid #ff6b6b',
      padding: '20px',
      marginTop: '20px',
      marginBottom: '20px',
      borderRadius: '8px'
    }}>
      <h2 style={{ color: '#dc3545', marginTop: 0 }}>⚠️ Wrong Network Detected</h2>
      <p style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
        This app ONLY works on <strong style={{ color: '#dc3545' }}>Arbitrum Sepolia</strong> (Chain ID: {EXPECTED_CHAIN_ID})
      </p>
      <p>
        You are currently on chain ID: <strong>{currentChainId}</strong>
      </p>
      
      {isPending && (
        <p style={{ color: '#0066cc', fontWeight: 'bold' }}>
          🔄 Switching network... Please approve in your wallet
        </p>
      )}
      
      {error && (
        <div style={{ backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
          <p className="error" style={{ color: '#721c24', margin: 0 }}>
            ❌ Failed to switch: {error.message}
          </p>
        </div>
      )}
      
      <input
        type="submit"
        value={isPending ? "Switching Network..." : hasAttemptedSwitch ? "Retry Switch to Arbitrum Sepolia" : "Switch to Arbitrum Sepolia"}
        onClick={handleManualSwitch}
        disabled={isPending}
        style={{ 
          marginTop: '15px',
          padding: '12px 24px',
          fontSize: '1.1em',
          fontWeight: 'bold',
          backgroundColor: isPending ? '#6c757d' : '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isPending ? 'not-allowed' : 'pointer'
        }}
      />
      
      <p className="mt warning" style={{ 
        marginTop: '15px',
        padding: '10px',
        backgroundColor: '#fff3cd',
        borderLeft: '4px solid #ffc107',
        color: '#856404'
      }}>
        ⚠️ All transaction buttons are DISABLED until you switch to Arbitrum Sepolia.
        {hasAttemptedSwitch && !error && !isPending && " Please check your wallet for the network switch request."}
      </p>
    </section>
  );
}

