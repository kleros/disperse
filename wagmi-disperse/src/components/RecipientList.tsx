import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { useContractRecipients } from "../hooks/useContractRecipients";
import type { Recipient, TokenInfo } from "../types";
import { getDecimals } from "../utils/balanceCalculations";

interface RecipientListProps {
  sending: "ether" | "token" | null;
  token: TokenInfo;
  amount: string;
  addresses: `0x${string}`[];
  onAddressRemove: (address: string) => void;
  onRecipientsChange: (recipients: Recipient[]) => void;
}

const RecipientList = ({
  sending,
  token,
  amount,
  addresses,
  onAddressRemove,
  onRecipientsChange,
}: RecipientListProps) => {
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Disperse can't send ETH to contract wallets (see useContractRecipients): skip them for ETH only,
  // tokens are unaffected. A failed check skips nothing; the pre-send simulation still catches a revert.
  const isSendingEther = sending === "ether";
  const { contractAddresses, isChecking } = useContractRecipients(addresses, isSendingEther);
  const skipped = useMemo(
    () => (isSendingEther ? contractAddresses : new Set<`0x${string}`>()),
    [isSendingEther, contractAddresses],
  );

  // Update recipients whenever addresses or amount changes
  useEffect(() => {
    if (addresses.length === 0 || !amount || isChecking) {
      onRecipientsChange([]);
      return;
    }

    try {
      const decimals = getDecimals(sending, token);
      const parsedAmount = parseUnits(amount, decimals);

      const recipients: Recipient[] = addresses
        .filter((address) => !skipped.has(address))
        .map((address) => ({
          address,
          value: parsedAmount,
        }));

      onRecipientsChange(recipients);
    } catch (error) {
      // Invalid amount format
      onRecipientsChange([]);
    }
  }, [addresses, amount, sending, token, onRecipientsChange, isChecking, skipped]);

  const handleCopyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setSuccessMessage("Copied to clipboard!");
      setTimeout(() => setSuccessMessage(""), 2000);
    });
  }, []);

  return (
    <section>
      <h2>recipients ({addresses.length})</h2>
      {isChecking && <p className="recipients-note">checking recipients for smart contract wallets...</p>}
      {!isChecking && skipped.size > 0 && (
        <p className="recipients-note warning-note">
          {skipped.size === 1
            ? "1 recipient is a smart contract wallet"
            : `${skipped.size} recipients are smart contract wallets`}{" "}
          (e.g. Safe) and will be skipped: Disperse can't send ETH to them. Send them PNK instead, or ETH in a separate
          transaction.
        </p>
      )}
      {addresses.length === 0 ? (
        <p>no recipients yet. add university court users or scan addresses above.</p>
      ) : (
        <ul className="address-list">
          {addresses.map((address) => (
            <li key={address} className={`address-item${skipped.has(address) ? " skipped" : ""}`}>
              <span className="address-text">{address}</span>
              {skipped.has(address) && <span className="address-tag">smart wallet · skipped</span>}
              <div className="address-actions">
                <button
                  type="button"
                  onClick={() => handleCopyAddress(address)}
                  className="copy-button"
                  title="Copy to clipboard"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => onAddressRemove(address)}
                  className="remove-button"
                  title="Remove address"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {successMessage && <p className="success-message">{successMessage}</p>}
    </section>
  );
};

export default memo(RecipientList);
