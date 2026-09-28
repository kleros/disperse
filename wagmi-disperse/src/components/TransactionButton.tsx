import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { EXPECTED_CHAIN_ID } from "../constants";
import { erc20 } from "../contracts";
import { disperseAbi } from "../generated";
import { explorerTx } from "../networks";
import type { Recipient, TokenInfo } from "../types";
import { formatError } from "../utils/errors";

interface TransactionButtonProps {
  show?: boolean;
  disabled?: boolean;
  title: string;
  action: "disperseEther" | "disperseToken" | "approve" | "deny";
  message?: string;
  chainId?: number;
  recipients: Recipient[];
  token: TokenInfo;
  contractAddress?: `0x${string}`; // Optional contract address override
  isContractDeployed: boolean;
  isBytecodeLoading: boolean;
  className?: string; // Additional class names for styling
  account?: `0x${string}`; // User account for query invalidation
}

const MAX_UINT256 = 2n ** 256n - 1n;

type TransactionAction = TransactionButtonProps["action"];

// Build the contract call for an action; null when the action needs a token address that is missing.
function buildWriteParams(
  action: TransactionAction,
  contractAddress: `0x${string}`,
  recipients: Recipient[],
  tokenAddress: `0x${string}` | undefined,
) {
  const addresses = recipients.map((r) => r.address);
  const values = recipients.map((r) => r.value);
  if (action === "disperseEther") {
    return {
      address: contractAddress,
      abi: disperseAbi,
      functionName: "disperseEther",
      args: [addresses, values],
      value: values.reduce((sum, v) => sum + v, 0n),
    } as const;
  }
  if (!tokenAddress) return null;
  if (action === "disperseToken") {
    return {
      address: contractAddress,
      abi: disperseAbi,
      functionName: "disperseToken",
      args: [tokenAddress, addresses, values],
    } as const;
  }
  return {
    address: tokenAddress,
    abi: erc20.abi,
    functionName: "approve",
    args: [contractAddress, action === "approve" ? MAX_UINT256 : 0n],
  } as const;
}

// Turn a simulation failure into a concise, user-facing message.
function formatSimulationError(error: unknown, action: TransactionAction): string {
  const reverted =
    error && typeof (error as BaseError).walk === "function"
      ? (error as BaseError).walk((e) => e instanceof ContractFunctionRevertedError)
      : null;
  const hasDecodedReason =
    reverted instanceof ContractFunctionRevertedError &&
    Boolean((reverted.reason && reverted.reason !== "execution reverted") || reverted.data);
  let message = `transaction would revert: ${formatError(error)
    .replace(/\s*\n\s*/g, " ")
    .trim()}`;
  if (action === "disperseEther" && !hasDecodedReason) {
    message += " — a recipient may be a contract wallet that can't receive ETH via Disperse";
  }
  return message;
}

const TransactionButton = ({
  show = true,
  disabled = false,
  title,
  action,
  message,
  chainId,
  recipients,
  token,
  contractAddress: customAddress,
  isContractDeployed,
  isBytecodeLoading,
  className = "",
  account,
}: TransactionButtonProps) => {
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();
  const currentChainId = useChainId();
  const publicClient = usePublicClient();
  const { address: connectedAddress } = useAccount();
  const [isSimulating, setIsSimulating] = useState(false);

  // Use the contract address from props only; do not fall back to legacy implicitly.
  const contractAddress = customAddress;

  // Use generic writeContract for all operations so we can explicitly set the chainId and address
  const { writeContract, isPending: isWritePending, isError: isWriteError, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: {
      enabled: !!txHash,
    },
  });

  // Update error message when write fails with user-friendly error format
  useEffect(() => {
    if (isWriteError && writeError) {
      setErrorMessage((writeError as BaseError).shortMessage || writeError.message || "Transaction failed");
    }
  }, [isWriteError, writeError]);

  // Invalidate queries after successful transactions
  useEffect(() => {
    if (isConfirmed && account) {
      if (action === "approve" || action === "deny") {
        // Invalidate allowance queries to refetch fresh data
        if (token.address && contractAddress) {
          queryClient.invalidateQueries({
            queryKey: [
              "readContract",
              {
                address: token.address,
                functionName: "allowance",
                args: [account, contractAddress],
                chainId,
              },
            ],
          });
          console.log(`[TransactionButton] Invalidated allowance queries for ${action} transaction`);
        }
      }

      if (action === "disperseToken" || action === "approve" || action === "deny") {
        // Invalidate balance queries for token transactions
        if (token.address) {
          queryClient.invalidateQueries({
            queryKey: [
              "readContract",
              {
                address: token.address,
                functionName: "balanceOf",
                args: [account],
                chainId,
              },
            ],
          });
          console.log(`[TransactionButton] Invalidated token balance queries for ${action} transaction`);
        }
      }

      if (action === "disperseEther") {
        // Invalidate ETH balance queries for ether transactions
        queryClient.invalidateQueries({
          queryKey: ["balance", { address: account, chainId }],
        });
        console.log(`[TransactionButton] Invalidated ETH balance queries for ${action} transaction`);
      }
    }
  }, [isConfirmed, action, token.address, account, contractAddress, chainId, queryClient]);

  const handleClick = async () => {
    setTxHash(null);
    setErrorMessage("");

    // CRITICAL: Verify we're on the correct network before ANY transaction
    if (currentChainId !== EXPECTED_CHAIN_ID) {
      setErrorMessage(
        `Wrong network! Please switch to Arbitrum Sepolia (chain ID ${EXPECTED_CHAIN_ID}). Currently on chain ${currentChainId}.`,
      );
      return;
    }

    if (!contractAddress) {
      setErrorMessage("Disperse contract address not available for this network");
      return;
    }

    if (isBytecodeLoading) {
      setErrorMessage("Checking if Disperse contract is deployed...");
      return;
    }

    if (!isContractDeployed) {
      setErrorMessage("Disperse contract not deployed at the expected address");
      return;
    }

    const params = buildWriteParams(action, contractAddress, recipients, token.address);
    if (!params) {
      setErrorMessage("Token address not available");
      return;
    }

    const sender = account ?? connectedAddress;
    if (!publicClient || !sender) {
      setErrorMessage("Wallet not connected");
      return;
    }

    // Simulate first so reverts surface here instead of on-chain
    setIsSimulating(true);
    try {
      await publicClient.simulateContract({ ...params, account: sender } as Parameters<
        typeof publicClient.simulateContract
      >[0]);
    } catch (error: unknown) {
      console.error("Transaction simulation failed:", error);
      setErrorMessage(formatSimulationError(error, action));
      return;
    } finally {
      setIsSimulating(false);
    }

    try {
      writeContract(params as Parameters<typeof writeContract>[0], {
        onSuccess(hash) {
          setTxHash(hash);
        },
        onError(error) {
          setErrorMessage(formatError(error));
        },
      });
    } catch (error: unknown) {
      console.error("Transaction error:", error);
      setErrorMessage((error as BaseError)?.shortMessage || (error as Error)?.message || "Transaction failed");
    }
  };

  if (!show) {
    return null;
  }

  return (
    <div className={`transaction-button ${className}`}>
      <input
        type="submit"
        value={title}
        onClick={handleClick}
        disabled={
          disabled ||
          isSimulating ||
          isWritePending ||
          isConfirming ||
          isBytecodeLoading ||
          !isContractDeployed ||
          !contractAddress
        }
      />
      <div className="status">
        {message && <div>{message}</div>}
        {isBytecodeLoading && <div className="pending">checking if disperse contract is deployed...</div>}
        {!isBytecodeLoading && !contractAddress && !errorMessage && (
          <div className="failed">disperse contract address not available</div>
        )}
        {contractAddress && !isBytecodeLoading && !isContractDeployed && !errorMessage && (
          <div className="failed">disperse contract not deployed</div>
        )}
        {isSimulating && <div className="pending">simulating transaction...</div>}
        {isWritePending && <div className="pending">sign transaction with wallet</div>}
        {isConfirming && <div className="pending">transaction pending</div>}
        {isConfirmed && <div className="success">transaction success</div>}
        {errorMessage && <div className="failed">{errorMessage}</div>}
        {txHash && (
          <a className="hash" href={explorerTx(txHash, chainId)} target="_blank" rel="noopener noreferrer">
            {txHash}
          </a>
        )}
      </div>
    </div>
  );
};

export default TransactionButton;
