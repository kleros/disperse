import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, getAbiItem, toFunctionSelector } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_CHAIN_ID } from "../../constants";
import { multicall3 } from "../../contracts";
import { disperseAbi } from "../../generated";
import TransactionButton from "../TransactionButton";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  usePublicClient: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { getBalanceQueryKey } from "wagmi/query";

const mockWriteContract = vi.fn();
const mockSimulateContract = vi.fn();

const account = "0x1234567890123456789012345678901234567890" as const;
const contractAddress = "0xD152f549545093347A162Dce210e7293f1452150" as const;
const recipients = [
  { address: "0x1111111111111111111111111111111111111111" as const, value: 500000000000000n },
  { address: "0x2222222222222222222222222222222222222222" as const, value: 250000000000000n },
];

const defaultProps = {
  title: "disperse ETH",
  action: "disperseEther" as const,
  chainId: EXPECTED_CHAIN_ID,
  recipients,
  token: {},
  contractAddress,
  isContractDeployed: true,
  isBytecodeLoading: false,
  account,
};

function revertError(functionName: string, args: readonly unknown[]) {
  return new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi: disperseAbi, functionName }), {
    abi: disperseAbi,
    functionName,
    args,
    contractAddress,
    sender: account,
  });
}

describe("TransactionButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChainId).mockReturnValue(EXPECTED_CHAIN_ID);
    vi.mocked(useAccount).mockReturnValue({ address: account } as any);
    vi.mocked(usePublicClient).mockReturnValue({ simulateContract: mockSimulateContract } as any);
    vi.mocked(useWaitForTransactionReceipt).mockReturnValue({ isLoading: false, isSuccess: false } as any);
    vi.mocked(useWriteContract).mockReturnValue({
      writeContract: mockWriteContract,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("simulates then sends ETH via Multicall3 aggregate3Value with the summed value", async () => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} />);

    await user.click(screen.getByDisplayValue("disperse ETH"));

    const expectedParams = {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      abi: multicall3.abi,
      functionName: "aggregate3Value",
      args: [
        [
          { target: recipients[0].address, allowFailure: false, value: 500000000000000n, callData: "0x" },
          { target: recipients[1].address, allowFailure: false, value: 250000000000000n, callData: "0x" },
        ],
      ],
      value: 750000000000000n,
    };
    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    expect(mockSimulateContract).toHaveBeenCalledWith({ ...expectedParams, account });
    expect(mockWriteContract).toHaveBeenCalledWith(expectedParams, expect.any(Object));
    expect(mockSimulateContract.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteContract.mock.invocationCallOrder[0],
    );
  });

  it("never sets allowFailure and always sends exactly the sum of values", async () => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const many = Array.from({ length: 7 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
      value: BigInt(i + 1) * 123456789n,
    }));
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} recipients={many} />);

    await user.click(screen.getByDisplayValue("disperse ETH"));

    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    for (const params of [mockSimulateContract.mock.calls[0][0], mockWriteContract.mock.calls[0][0]]) {
      const [calls] = params.args as [{ allowFailure: boolean; value: bigint }[]];
      expect(calls).toHaveLength(many.length);
      expect(calls.every((c) => c.allowFailure === false)).toBe(true);
      expect(params.value).toBe(calls.reduce((sum, c) => sum + c.value, 0n));
      expect(params.value).toBe(many.reduce((sum, r) => sum + r.value, 0n));
    }
  });

  it("uses the canonical aggregate3Value selector", () => {
    const item = getAbiItem({ abi: multicall3.abi, name: "aggregate3Value" });
    expect(toFunctionSelector(item)).toBe("0x174dea71");
  });

  it.each([
    { name: "Disperse not deployed", props: { isContractDeployed: false } },
    { name: "no Disperse address", props: { contractAddress: undefined } },
    { name: "bytecode still loading", props: { isBytecodeLoading: true } },
  ])("disperses ETH via Multicall3 regardless of Disperse state ($name)", async ({ props }) => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} {...props} />);

    const button = screen.getByDisplayValue("disperse ETH");
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/disperse contract/i)).not.toBeInTheDocument();

    await user.click(button);

    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    expect(mockSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: multicall3.address, functionName: "aggregate3Value" }),
    );
  });

  it.each([
    { name: "Disperse not deployed", props: { isContractDeployed: false }, text: "disperse contract not deployed" },
    {
      name: "no Disperse address",
      props: { contractAddress: undefined },
      text: "disperse contract address not available",
    },
  ])("blocks token dispersal when $name", async ({ props, text }) => {
    const user = userEvent.setup();
    render(
      <TransactionButton
        {...defaultProps}
        {...props}
        title="disperse token"
        action="disperseToken"
        token={{ address: "0x3333333333333333333333333333333333333333" }}
      />,
    );

    const button = screen.getByDisplayValue("disperse token");
    expect(button).toBeDisabled();
    expect(screen.getByText(text)).toHaveClass("failed");

    await user.click(button);

    expect(mockSimulateContract).not.toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("keeps dispersing tokens through the Disperse contract", async () => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const tokenAddress = "0x3333333333333333333333333333333333333333" as const;
    const user = userEvent.setup();
    render(
      <TransactionButton
        {...defaultProps}
        title="disperse token"
        action="disperseToken"
        token={{ address: tokenAddress }}
      />,
    );

    await user.click(screen.getByDisplayValue("disperse token"));

    const expectedParams = {
      address: contractAddress,
      abi: disperseAbi,
      functionName: "disperseToken",
      args: [tokenAddress, recipients.map((r) => r.address), recipients.map((r) => r.value)],
    };
    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    expect(mockSimulateContract).toHaveBeenCalledWith({ ...expectedParams, account });
    expect(mockWriteContract).toHaveBeenCalledWith(expectedParams, expect.any(Object));
  });

  it("builds approve params for the token", async () => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const tokenAddress = "0x3333333333333333333333333333333333333333" as const;
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} title="approve" action="approve" token={{ address: tokenAddress }} />);

    await user.click(screen.getByDisplayValue("approve"));

    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: tokenAddress,
        functionName: "approve",
        args: [contractAddress, 2n ** 256n - 1n],
      }),
      expect.any(Object),
    );
  });

  it("does not send and shows the revert when simulation fails", async () => {
    mockSimulateContract.mockRejectedValue(
      new ContractFunctionExecutionError(
        new ContractFunctionRevertedError({ abi: multicall3.abi, functionName: "aggregate3Value" }),
        {
          abi: multicall3.abi,
          functionName: "aggregate3Value",
          args: [[]],
          contractAddress: multicall3.address,
          sender: account,
        },
      ),
    );
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} />);

    await user.click(screen.getByDisplayValue("disperse ETH"));

    const error = await screen.findByText(
      'transaction would revert: The contract function "aggregate3Value" reverted.',
    );
    expect(error).toHaveClass("failed");
    expect(error.textContent).not.toMatch(/contract wallet/);
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("shows the plain revert message for token actions", async () => {
    mockSimulateContract.mockRejectedValue(
      revertError("disperseToken", [
        "0x3333333333333333333333333333333333333333",
        recipients.map((r) => r.address),
        recipients.map((r) => r.value),
      ]),
    );
    const user = userEvent.setup();
    render(
      <TransactionButton
        {...defaultProps}
        title="disperse token"
        action="disperseToken"
        token={{ address: "0x3333333333333333333333333333333333333333" }}
      />,
    );

    await user.click(screen.getByDisplayValue("disperse token"));

    expect(
      await screen.findByText('transaction would revert: The contract function "disperseToken" reverted.'),
    ).toBeInTheDocument();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("disables the button and shows status while simulating", async () => {
    let resolveSimulation: (v: unknown) => void = () => {};
    mockSimulateContract.mockReturnValue(
      new Promise((resolve) => {
        resolveSimulation = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} />);

    const button = screen.getByDisplayValue("disperse ETH");
    await user.click(button);

    expect(await screen.findByText("simulating transaction...")).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(mockWriteContract).not.toHaveBeenCalled();

    resolveSimulation({ request: {} });

    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.queryByText("simulating transaction...")).not.toBeInTheDocument();
    expect(mockWriteContract).toHaveBeenCalledTimes(1);
  });
  it("refreshes the useBalance({ token }) balance after a confirmed disperseToken", () => {
    const tokenAddress = "0x3333333333333333333333333333333333333333" as const;
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getBalanceQueryKey({ address: account, token: tokenAddress, chainId: EXPECTED_CHAIN_ID }),
      { value: 1n },
    );
    vi.mocked(useQueryClient).mockReturnValue(queryClient);
    vi.mocked(useWaitForTransactionReceipt).mockReturnValue({ isLoading: false, isSuccess: true } as any);
    render(
      <TransactionButton
        {...defaultProps}
        title="disperse token"
        action="disperseToken"
        token={{ address: tokenAddress }}
      />,
    );

    // Same key App's useBalance({ address, token, chainId }) caches under
    const tokenBalanceKey = getBalanceQueryKey({ address: account, token: tokenAddress, chainId: EXPECTED_CHAIN_ID });
    expect(queryClient.getQueryState(tokenBalanceKey)?.isInvalidated).toBe(true);
  });
});
