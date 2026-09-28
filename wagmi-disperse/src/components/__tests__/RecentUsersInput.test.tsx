import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecentUsersInput, { toDateTimeLocal } from "../RecentUsersInput";

const ADDR_A = "0xd378C2A4DE3f1c7AF1BA8d9C5b6E7f8091a298c7";
const ADDR_B = "0x314ab97b76e39d63c78d5c86c2daf8eaa306b182";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function mockFetchJson(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? "Internal Server Error" : "OK",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RecentUsersInput", () => {
  const onAddressesAdd = vi.fn((addrs: `0x${string}`[]) => addrs.length);

  beforeEach(() => {
    onAddressesAdd.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the section with a datetime input defaulting to 24h ago", () => {
    render(<RecentUsersInput onAddressesAdd={onAddressesAdd} />);

    expect(screen.getByText("add recent users")).toBeInTheDocument();
    const input = screen.getByLabelText("from") as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const diffMs = Date.now() - new Date(input.value).getTime();
    expect(diffMs).toBeGreaterThan(24 * 3600_000 - 2 * 60_000);
    expect(diffMs).toBeLessThan(24 * 3600_000 + 2 * 60_000);
  });

  it("formats dates as local datetime-local strings", () => {
    expect(toDateTimeLocal(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
  });

  it("adds valid, deduped addresses within the range and shows invalid ones", async () => {
    const user = userEvent.setup();
    mockFetchJson([
      { address: ADDR_A, timestamp: minutesAgo(10) },
      { address: ADDR_A.toLowerCase(), timestamp: minutesAgo(5) },
      { address: ADDR_B, timestamp: minutesAgo(60) },
      { address: "0xnotanaddress", timestamp: minutesAgo(3) },
      { address: "0xoutofrange", timestamp: minutesAgo(3 * 24 * 60) },
    ]);

    render(<RecentUsersInput onAddressesAdd={onAddressesAdd} />);
    await user.click(screen.getByRole("button", { name: "Add Recent Users" }));

    await waitFor(() => expect(onAddressesAdd).toHaveBeenCalledTimes(1));
    expect(onAddressesAdd).toHaveBeenCalledWith([ADDR_A.toLowerCase(), ADDR_B]);
    expect(await screen.findByText("added 2 addresses")).toBeInTheDocument();
    expect(screen.getByText("Invalid addresses (1)")).toBeInTheDocument();
    expect(screen.getByText("0xnotanaddress")).toBeInTheDocument();
    expect(screen.queryByText("0xoutofrange")).not.toBeInTheDocument();
  });

  it("reports addresses already in the list", async () => {
    const user = userEvent.setup();
    mockFetchJson([
      { address: ADDR_A, timestamp: minutesAgo(10) },
      { address: ADDR_B, timestamp: minutesAgo(20) },
    ]);
    onAddressesAdd.mockImplementationOnce(() => 1);

    render(<RecentUsersInput onAddressesAdd={onAddressesAdd} />);
    await user.click(screen.getByRole("button", { name: "Add Recent Users" }));

    expect(await screen.findByText("added 1 address (1 already in list)")).toBeInTheDocument();
  });

  it("shows a message when nobody connected in the range", async () => {
    const user = userEvent.setup();
    mockFetchJson([{ address: ADDR_A, timestamp: minutesAgo(3 * 24 * 60) }]);

    render(<RecentUsersInput onAddressesAdd={onAddressesAdd} />);
    await user.click(screen.getByRole("button", { name: "Add Recent Users" }));

    expect(await screen.findByText("no users connected in this range")).toBeInTheDocument();
    expect(onAddressesAdd).not.toHaveBeenCalled();
  });

  it("shows an error when the fetch fails and clears previous invalid addresses", async () => {
    const user = userEvent.setup();
    mockFetchJson([{ address: "0xbroken", timestamp: minutesAgo(1) }]);

    render(<RecentUsersInput onAddressesAdd={onAddressesAdd} />);
    await user.click(screen.getByRole("button", { name: "Add Recent Users" }));
    expect(await screen.findByText("0xbroken")).toBeInTheDocument();

    mockFetchJson(null, { ok: false, status: 500 });
    await user.click(screen.getByRole("button", { name: "Add Recent Users" }));

    expect(await screen.findByText(/Failed to load recent users: .*500/)).toBeInTheDocument();
    expect(screen.queryByText("0xbroken")).not.toBeInTheDocument();
    expect(onAddressesAdd).not.toHaveBeenCalled();
  });
});
