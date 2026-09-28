import { memo, useCallback, useEffect, useState } from "react";
import { parseUnits } from "viem";
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

  // Update recipients whenever addresses or amount changes
  useEffect(() => {
    if (addresses.length === 0 || !amount) {
      onRecipientsChange([]);
      return;
    }

    try {
      const decimals = getDecimals(sending, token);
      const parsedAmount = parseUnits(amount, decimals);

      const recipients: Recipient[] = addresses.map((address) => ({
        address,
        value: parsedAmount,
      }));

      onRecipientsChange(recipients);
    } catch (error) {
      // Invalid amount format
      onRecipientsChange([]);
    }
  }, [addresses, amount, sending, token, onRecipientsChange]);

  const handleCopyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setSuccessMessage("Copied to clipboard!");
      setTimeout(() => setSuccessMessage(""), 2000);
    });
  }, []);

  return (
    <section>
      <h2>recipients ({addresses.length})</h2>
      {addresses.length === 0 ? (
        <p>no recipients yet. add university court users or scan addresses above.</p>
      ) : (
        <ul className="address-list">
          {addresses.map((address) => (
            <li key={address} className="address-item">
              <span className="address-text">{address}</span>
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
