import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractFunctionExecutionError, ContractFunctionRevertedError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_CHAIN_ID } from "../../constants";
import { disperseAbi } from "../../generated";
import TransactionButton from "../TransactionButton";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  usePublicClient: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

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

  it("simulates then sends disperseEther with the summed value", async () => {
    mockSimulateContract.mockResolvedValue({ request: {} });
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} />);

    await user.click(screen.getByDisplayValue("disperse ETH"));

    const expectedParams = {
      address: contractAddress,
      abi: disperseAbi,
      functionName: "disperseEther",
      args: [recipients.map((r) => r.address), recipients.map((r) => r.value)],
      value: 750000000000000n,
    };
    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1));
    expect(mockSimulateContract).toHaveBeenCalledWith({ ...expectedParams, account });
    expect(mockWriteContract).toHaveBeenCalledWith(expectedParams, expect.any(Object));
    expect(mockSimulateContract.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteContract.mock.invocationCallOrder[0],
    );
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
      revertError("disperseEther", [recipients.map((r) => r.address), recipients.map((r) => r.value)]),
    );
    const user = userEvent.setup();
    render(<TransactionButton {...defaultProps} />);

    await user.click(screen.getByDisplayValue("disperse ETH"));

    expect(
      await screen.findByText(
        'transaction would revert: The contract function "disperseEther" reverted. — a recipient may be a contract wallet that can\'t receive ETH via Disperse',
      ),
    ).toHaveClass("failed");
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("omits the contract-wallet hint for non-ether actions", async () => {
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
});
