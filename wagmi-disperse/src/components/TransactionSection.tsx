import type { Recipient, TokenInfo } from "../types";
import DisperseAddresses from "./DisperseAddresses";
import TransactionButton from "./TransactionButton";

interface TransactionSectionProps {
  sending: "ether" | "token" | null;
  recipients: Recipient[];
  token: TokenInfo;
  symbol: string;
  decimals: number;
  balance: bigint;
  leftAmount: bigint;
  totalAmount: bigint;
  disperseMessage?: string;
  chainId: number | undefined;
  verifiedAddress?: { address: `0x${string}`; label: string } | null;
  isContractDeployed: boolean;
  isBytecodeLoading: boolean;
  account?: `0x${string}`;
  nativeCurrencyName?: string;
  effectiveAllowance?: bigint;
  isWrongNetwork?: boolean;
}

export default function TransactionSection({
  sending,
  recipients,
  token,
  symbol,
  decimals,
  balance,
  leftAmount,
  totalAmount,
  disperseMessage,
  chainId,
  verifiedAddress,
  isContractDeployed,
  isBytecodeLoading,
  account,
  nativeCurrencyName = "ETH",
  effectiveAllowance = 0n,
  isWrongNetwork = false,
}: TransactionSectionProps) {
  return (
    <>
      <section>
        <h2>confirm</h2>
        <DisperseAddresses
          recipients={recipients}
          symbol={symbol}
          decimals={decimals}
          balance={balance}
          left={leftAmount}
          total={totalAmount}
        />
        {sending === "ether" && (
          <TransactionButton
            show={true}
            disabled={leftAmount < 0n || isWrongNetwork || recipients.length === 0 || totalAmount === 0n}
            title={`disperse ${nativeCurrencyName}`}
            action="disperseEther"
            message={isWrongNetwork ? "Wrong network - please switch to Arbitrum Sepolia" : disperseMessage}
            chainId={chainId}
            recipients={recipients}
            token={token}
            contractAddress={verifiedAddress?.address}
            isContractDeployed={isContractDeployed}
            isBytecodeLoading={isBytecodeLoading}
            account={account}
          />
        )}
      </section>

      {sending === "token" && (
        <div>
          <h2>allowance</h2>
          <p>
            {effectiveAllowance < totalAmount
              ? "allow smart contract to transfer tokens on your behalf."
              : "disperse contract has allowance, you can send tokens now."}
          </p>
          <TransactionButton
            title={effectiveAllowance < totalAmount ? "approve" : "revoke"}
            action={effectiveAllowance < totalAmount ? "approve" : "deny"}
            chainId={chainId}
            recipients={recipients}
            token={token}
            contractAddress={verifiedAddress?.address}
            isContractDeployed={isContractDeployed}
            isBytecodeLoading={isBytecodeLoading}
            className={effectiveAllowance >= totalAmount ? "secondary" : ""}
            account={account}
            disabled={isWrongNetwork}
          />
          <TransactionButton
            show={true}
            disabled={
              leftAmount < 0n ||
              effectiveAllowance < totalAmount ||
              isWrongNetwork ||
              recipients.length === 0 ||
              totalAmount === 0n
            }
            title="disperse token"
            action="disperseToken"
            message={isWrongNetwork ? "Wrong network - please switch to Arbitrum Sepolia" : disperseMessage}
            chainId={chainId}
            recipients={recipients}
            token={token}
            contractAddress={verifiedAddress?.address}
            isContractDeployed={isContractDeployed}
            isBytecodeLoading={isBytecodeLoading}
            account={account}
          />
        </div>
      )}
    </>
  );
}
