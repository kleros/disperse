import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransactionSection from "../TransactionSection";

vi.mock("../TransactionButton", () => ({
  default: ({ title, disabled }: { title: string; disabled?: boolean }) => (
    <input type="submit" value={title} disabled={disabled} readOnly />
  ),
}));

vi.mock("../DisperseAddresses", () => ({ default: () => null }));

const recipients = [{ address: "0x1111111111111111111111111111111111111111" as const, value: 1n }];

const baseProps = {
  recipients,
  token: { address: "0x3333333333333333333333333333333333333333" as const },
  symbol: "ETH",
  decimals: 18,
  balance: 10n,
  leftAmount: 9n,
  totalAmount: 1n,
  chainId: 421614,
  isContractDeployed: true,
  isBytecodeLoading: false,
  effectiveAllowance: 10n,
};

describe("TransactionSection", () => {
  it.each(["ether", "token"] as const)("enables disperse %s with recipients and a non-zero total", (sending) => {
    render(<TransactionSection {...baseProps} sending={sending} />);
    const title = sending === "ether" ? "disperse ETH" : "disperse token";
    expect(screen.getByDisplayValue(title)).not.toBeDisabled();
  });

  it.each([
    ["ether", "no recipients", { recipients: [], totalAmount: 0n }],
    ["ether", "zero total", { totalAmount: 0n }],
    ["token", "no recipients", { recipients: [], totalAmount: 0n }],
    ["token", "zero total", { totalAmount: 0n }],
  ] as const)("disables disperse %s with %s", (sending, _label, overrides) => {
    render(<TransactionSection {...baseProps} {...overrides} sending={sending} />);
    const title = sending === "ether" ? "disperse ETH" : "disperse token";
    expect(screen.getByDisplayValue(title)).toBeDisabled();
  });
});
