import { Html5Qrcode } from "html5-qrcode";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { isAddress, parseUnits } from "viem";
import type { Recipient, TokenInfo } from "../types";
import { getDecimals } from "../utils/balanceCalculations";

interface QRRecipientInputProps {
  sending: "ether" | "token" | null;
  token: TokenInfo;
  amount: string;
  onRecipientsChange: (recipients: Recipient[]) => void;
}

const QRRecipientInput = ({ sending, token, amount, onRecipientsChange }: QRRecipientInputProps) => {
  const [scannedAddresses, setScannedAddresses] = useState<`0x${string}`[]>(() => {
    // Load addresses from localStorage on mount
    try {
      const stored = localStorage.getItem("disperse_scanned_addresses");
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error("Failed to load addresses from localStorage:", error);
    }
    return [];
  });
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scannedAddressesRef = useRef<`0x${string}`[]>([]);
  const qrCodeRegionId = "qr-reader";

  // Save addresses to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("disperse_scanned_addresses", JSON.stringify(scannedAddresses));
    } catch (error) {
      console.error("Failed to save addresses to localStorage:", error);
    }
  }, [scannedAddresses]);

  // Update recipients whenever addresses or amount changes
  useEffect(() => {
    // Keep ref in sync with state for use in scan callback
    scannedAddressesRef.current = scannedAddresses;

    if (scannedAddresses.length === 0 || !amount) {
      onRecipientsChange([]);
      return;
    }

    try {
      const decimals = getDecimals(sending, token);
      const parsedAmount = parseUnits(amount, decimals);

      const recipients: Recipient[] = scannedAddresses.map((address) => ({
        address,
        value: parsedAmount,
      }));

      onRecipientsChange(recipients);
    } catch (error) {
      // Invalid amount format
      onRecipientsChange([]);
    }
  }, [scannedAddresses, amount, sending, token, onRecipientsChange]);

  const startScanning = useCallback(async () => {
    try {
      setErrorMessage("");

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(qrCodeRegionId);
      }

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Throttle scans to prevent rapid duplicate scans (0.5 second delay)
          const now = Date.now();
          if (now - lastScanTimeRef.current < 500) {
            return; // Ignore scans within 500ms
          }

          // Validate that the scanned text is an Ethereum address
          if (isAddress(decodedText)) {
            const normalizedAddress = decodedText.toLowerCase() as `0x${string}`;

            // Check for duplicates (case-insensitive) - use ref to get current value
            if (scannedAddressesRef.current.some((addr) => addr.toLowerCase() === normalizedAddress)) {
              // Silently ignore duplicates - don't show message as scanner continuously reads QR
              lastScanTimeRef.current = now; // Update timestamp even for duplicates
              return;
            }

            setScannedAddresses((prev) => [...prev, normalizedAddress]);
            setSuccessMessage(`Address added: ${normalizedAddress.slice(0, 10)}...`);
            setTimeout(() => setSuccessMessage(""), 2000);
            lastScanTimeRef.current = now; // Update timestamp after successful scan
          } else {
            setErrorMessage("Invalid Ethereum address in QR code");
            setTimeout(() => setErrorMessage(""), 3000);
            lastScanTimeRef.current = now; // Update timestamp even for invalid scans
          }
        },
        undefined, // onScanError - we can ignore errors as they're frequent during scanning
      );

      setIsScanning(true);
    } catch (err) {
      const error = err as Error;
      setErrorMessage(
        error.message.includes("Permission")
          ? "Camera permission denied. Please allow camera access."
          : `Failed to start camera: ${error.message}`,
      );
      setIsScanning(false);
    }
  }, []); // Empty deps - callback uses refs which are always current

  const stopScanning = useCallback(async () => {
    try {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop();
      }
      setIsScanning(false);
    } catch (err) {
      console.error("Error stopping scanner:", err);
      setIsScanning(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const handleCopyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setSuccessMessage("Copied to clipboard!");
      setTimeout(() => setSuccessMessage(""), 2000);
    });
  }, []);

  const handleRemoveAddress = useCallback((address: string) => {
    setScannedAddresses((prev) => prev.filter((addr) => addr !== address));
  }, []);

  return (
    <section>
      <h2>scan recipients</h2>
      <p>scan Ethereum addresses as QR codes to add them to the recipient list.</p>

      {/* QR Scanner */}
      <div className="qr-scanner-container">
        <div id={qrCodeRegionId} className={isScanning ? "scanning" : ""} />

        <button type="button" onClick={isScanning ? stopScanning : startScanning} className="qr-scan-button">
          {isScanning ? "Stop Scan" : "Start Scan"}
        </button>

        {errorMessage && <p className="error-message">{errorMessage}</p>}
        {successMessage && <p className="success-message">{successMessage}</p>}
      </div>

      {/* Scanned Addresses List */}
      {scannedAddresses.length > 0 && (
        <div className="scanned-addresses">
          <h3>Scanned Addresses ({scannedAddresses.length})</h3>
          <ul className="address-list">
            {scannedAddresses.map((address) => (
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
                    onClick={() => handleRemoveAddress(address)}
                    className="remove-button"
                    title="Remove address"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default memo(QRRecipientInput);
