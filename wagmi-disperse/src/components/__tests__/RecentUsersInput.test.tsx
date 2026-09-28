import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecentUsersInput, { formatAge, QUICK_RANGES, toDateTimeLocal } from "../RecentUsersInput";

const ADDR_A = "0xd378C2A4DE3f1c7AF1BA8d9C5b6E7f8091a298c7";
const ADDR_B = "0x314ab97b76e39d63c78d5c86c2daf8eaa306b182";
const ADDR_C = "0x1111111111111111111111111111111111111111";
const A = ADDR_A.toLowerCase() as `0x${string}`;
const B = ADDR_B as `0x${string}`;
const C = ADDR_C as `0x${string}`;

// Frozen local "now" (only Date is faked, timers stay real) so the "today" default range is deterministic
const NOW = new Date(2026, 5, 15, 14, 0, 0);

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

// A: 10 min ago (twice, mixed case), B: 3h ago, C: 2 days ago, one invalid 5 min ago, one out of range.
// With the default "today" range (since 00:00, now 14:00): A, B and the invalid one are in range.
const connections = () => [
  { address: ADDR_A, timestamp: minutesAgo(10) },
  { address: ADDR_A.toLowerCase(), timestamp: minutesAgo(5) },
  { address: ADDR_B, timestamp: minutesAgo(3 * 60) },
  { address: ADDR_C, timestamp: minutesAgo(2 * 24 * 60) },
  { address: "0xnotanaddress", timestamp: minutesAgo(5) },
  { address: "0xoutofrange", timestamp: minutesAgo(30 * 24 * 60) },
];

const summaryText = () => document.querySelector(".recent-users-summary [aria-live]")?.textContent ?? "";
const addButton = () => document.querySelector("button.qr-scan-button") as HTMLButtonElement;
const fromInput = () => screen.getByLabelText("from") as HTMLInputElement;
const chip = (label: string) => screen.getByRole("button", { name: label });

describe("RecentUsersInput", () => {
  const onAddressesAdd = vi.fn((addrs: `0x${string}`[]) => addrs.length);

  beforeEach(() => {
    onAddressesAdd.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderInput = (existingAddresses: `0x${string}`[] = []) =>
    render(<RecentUsersInput existingAddresses={existingAddresses} onAddressesAdd={onAddressesAdd} />);

  it("renders a datetime input defaulting to today's local midnight", async () => {
    mockFetchJson([]);
    renderInput();

    expect(screen.getByText("add university court users")).toBeInTheDocument();
    const input = fromInput();
    expect(input.type).toBe("datetime-local");
    expect(input.value).toBe("2026-06-15T00:00");
    expect(input.max).toBe("2026-06-15T14:00");
    await waitFor(() => expect(summaryText()).toContain("0 users connected"));
  });

  it("fetches on mount and shows the summary counts", async () => {
    const fetchMock = mockFetchJson(connections());
    renderInput();

    await waitFor(() => expect(summaryText()).toContain("2 users connected"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(summaryText()).toContain("1 invalid");
    expect(summaryText()).not.toContain("already in recipients");
    expect(onAddressesAdd).not.toHaveBeenCalled();
  });

  it("updates the preview when the date changes without refetching", async () => {
    const fetchMock = mockFetchJson(connections());
    renderInput();
    await waitFor(() => expect(summaryText()).toContain("2 users connected"));

    fireEvent.change(fromInput(), { target: { value: "2026-06-12T00:00" } });
    expect(summaryText()).toContain("3 users connected");

    fireEvent.change(fromInput(), { target: { value: "2026-06-15T13:00" } });
    expect(summaryText()).toContain("1 user connected");
    expect(screen.getByRole("button", { name: "Add 1 user" })).toBeEnabled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a hint when the date is invalid and disables add", async () => {
    mockFetchJson(connections());
    renderInput();
    await waitFor(() => expect(summaryText()).toContain("2 users connected"));

    fireEvent.change(fromInput(), { target: { value: "" } });
    expect(summaryText()).toContain("pick a valid start date and time");
    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveTextContent("Pick a start date");
    for (const { label } of QUICK_RANGES) {
      expect(chip(label)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("keeps the clicked chip pressed and moves the range with the clock", async () => {
    vi.useRealTimers(); // re-install to also fake the 30s clock interval
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    const fetchMock = mockFetchJson([
      { address: ADDR_A, timestamp: new Date(2026, 5, 15, 13, 2).toISOString() },
      { address: ADDR_B, timestamp: new Date(2026, 5, 15, 13, 50).toISOString() },
    ]);
    renderInput();
    await act(async () => {});
    expect(summaryText()).toContain("2 users connected");

    fireEvent.click(chip("last hour"));
    expect(fromInput().value).toBe("2026-06-15T13:00");

    // 5 minutes later (10 clock ticks): A (13:02) has left the last hour
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(chip("last hour")).toHaveAttribute("aria-pressed", "true");
    expect(fromInput().value).toBe("2026-06-15T13:05");
    expect(fromInput().max).toBe("2026-06-15T14:05");
    expect(summaryText()).toContain("1 user connected");
    expect(screen.getByTitle("Refresh the list of users")).toHaveTextContent("updated 5 min ago");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["last hour", "2026-06-15T13:00", "1 user connected"],
    ["last 4 hours", "2026-06-15T10:00", "2 users connected"],
    ["today", "2026-06-15T00:00", "2 users connected"],
    ["last 7 days", "2026-06-08T14:00", "3 users connected"],
  ])("chip '%s' sets the input to %s and is pressed", async (label, value, summary) => {
    const user = userEvent.setup();
    mockFetchJson(connections());
    renderInput();
    await waitFor(() => expect(summaryText()).toContain("users connected"));

    // start from a custom date so the default "today" chip isn't already pressed
    fireEvent.change(fromInput(), { target: { value: "2020-01-01T00:00" } });
    await user.click(chip(label));

    expect(fromInput().value).toBe(value);
    expect(summaryText()).toContain(summary);
    expect(chip(label)).toHaveAttribute("aria-pressed", "true");
    for (const other of QUICK_RANGES.filter((r) => r.label !== label)) {
      expect(chip(other.label)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("marks the 'today' chip pressed by default and unpresses all chips on a custom date", async () => {
    mockFetchJson([]);
    renderInput();
    expect(chip("today")).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(fromInput(), { target: { value: "2020-01-01T00:00" } });
    for (const { label } of QUICK_RANGES) {
      expect(chip(label)).toHaveAttribute("aria-pressed", "false");
    }
    await waitFor(() => expect(summaryText()).toContain("0 users connected"));
  });

  it("'today' starts at local midnight", async () => {
    const user = userEvent.setup();
    mockFetchJson([]);
    renderInput();

    fireEvent.change(fromInput(), { target: { value: "2020-01-01T00:00" } });
    await user.click(chip("today"));
    expect(fromInput().value).toBe("2026-06-15T00:00");

    const start = QUICK_RANGES.find((r) => r.label === "today")?.getStart(new Date(2026, 5, 15, 17, 42, 9));
    expect(start).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
  });

  it("flags addresses already in the recipients and excludes them from the count", async () => {
    mockFetchJson(connections());
    renderInput([A]);

    await waitFor(() => expect(summaryText()).toContain("2 users connected · 1 already in recipients · 1 invalid"));
    expect(screen.getByRole("button", { name: "Add 1 user" })).toBeEnabled();

    const alreadyItem = screen.getByText(A).closest("li");
    expect(alreadyItem).toHaveTextContent("already added");
    expect(screen.getByText(B).closest("li")).not.toHaveTextContent("already added");
  });

  it("matches existing addresses case-insensitively", async () => {
    mockFetchJson(connections());
    renderInput([ADDR_A as `0x${string}`]);

    await waitFor(() => expect(summaryText()).toContain("1 already in recipients"));
  });

  it("shows 'Nothing new to add' (disabled) when every user is already added", async () => {
    mockFetchJson(connections());
    renderInput([A, B]);

    const button = await screen.findByRole("button", { name: "Nothing new to add" });
    expect(button).toBeDisabled();
  });

  it("shows 'Nothing new to add' (disabled) when nobody connected in the range", async () => {
    mockFetchJson([{ address: ADDR_A, timestamp: minutesAgo(3 * 24 * 60) }]);
    renderInput();

    const button = await screen.findByRole("button", { name: "Nothing new to add" });
    expect(button).toBeDisabled();
    expect(summaryText()).toContain("0 users connected");
  });

  it("labels the button with the fresh count, pluralized", async () => {
    mockFetchJson(connections());
    renderInput();

    expect(await screen.findByRole("button", { name: "Add 2 users" })).toBeEnabled();
  });

  it("adds only the fresh addresses and shows the success message", async () => {
    const user = userEvent.setup();
    mockFetchJson(connections());
    renderInput([B]);

    await user.click(await screen.findByRole("button", { name: "Add 1 user" }));

    expect(onAddressesAdd).toHaveBeenCalledTimes(1);
    expect(onAddressesAdd).toHaveBeenCalledWith([A]);
    expect(screen.getByText("added 1 address to the recipients")).toBeInTheDocument();
  });

  it("reports the count returned by onAddressesAdd", async () => {
    const user = userEvent.setup();
    mockFetchJson(connections());
    onAddressesAdd.mockImplementationOnce(() => 0);
    renderInput();

    await user.click(await screen.findByRole("button", { name: "Add 2 users" }));

    expect(onAddressesAdd).toHaveBeenCalledWith([A, B]);
    expect(screen.getByText("added 0 addresses to the recipients")).toBeInTheDocument();
  });

  it("clears the success message when the range changes", async () => {
    const user = userEvent.setup();
    mockFetchJson(connections());
    renderInput();

    await user.click(await screen.findByRole("button", { name: "Add 2 users" }));
    expect(screen.getByText("added 2 addresses to the recipients")).toBeInTheDocument();

    await user.click(chip("last 7 days"));
    expect(screen.queryByText(/added .* to the recipients/)).not.toBeInTheDocument();
  });

  it("clears the success message after a successful refetch", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchJson(connections());
    renderInput();

    await user.click(await screen.findByRole("button", { name: "Add 2 users" }));
    expect(screen.getByText("added 2 addresses to the recipients")).toBeInTheDocument();

    await user.click(screen.getByTitle("Refresh the list of users"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/added .* to the recipients/)).not.toBeInTheDocument());
  });

  it("lists invalid addresses with an 'invalid' tag", async () => {
    mockFetchJson(connections());
    renderInput();

    const invalid = await screen.findByText("0xnotanaddress");
    expect(invalid.closest("li")).toHaveTextContent("invalid");
    expect(invalid.closest("li")).toHaveClass("invalid");
    expect(screen.queryByText("0xoutofrange")).not.toBeInTheDocument();
    expect(screen.getByText("show addresses")).toBeInTheDocument();
  });

  it("hides the address list when nothing is in range", async () => {
    mockFetchJson([]);
    renderInput();

    await waitFor(() => expect(summaryText()).toContain("0 users connected"));
    expect(screen.queryByText("show addresses")).not.toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockFetchJson(null, { ok: false, status: 500 });
    renderInput();

    expect(
      await screen.findByText(
        "Failed to load university court users: Failed to fetch connections: 500 Internal Server Error",
      ),
    ).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveTextContent("Add Users");
  });

  it("refetches when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchJson([{ address: ADDR_A, timestamp: minutesAgo(10) }]);
    renderInput();

    await waitFor(() => expect(summaryText()).toContain("1 user connected"));
    const refresh = screen.getByTitle("Refresh the list of users");
    await waitFor(() => expect(refresh).toHaveTextContent("updated just now"));

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => connections(),
    });
    await user.click(refresh);

    await waitFor(() => expect(summaryText()).toContain("2 users connected"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears a previous error after a successful refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchJson(null, { ok: false, status: 500 });
    renderInput();
    expect(await screen.findByText(/Failed to load university court users/)).toBeInTheDocument();

    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: "OK", json: async () => connections() });
    await user.click(screen.getByTitle("Refresh the list of users"));

    await waitFor(() => expect(summaryText()).toContain("2 users connected"));
    expect(screen.queryByText(/Failed to load university court users/)).not.toBeInTheDocument();
  });

  it("refetches when the tab becomes visible again", async () => {
    const fetchMock = mockFetchJson(connections());
    renderInput();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(summaryText()).toContain("2 users connected"));

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTitle("Refresh the list of users")).not.toHaveTextContent("updating"));
  });

  it("formats dates as local datetime-local strings", () => {
    expect(toDateTimeLocal(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
  });

  describe("formatAge", () => {
    it.each([
      [0, "just now"],
      [59_999, "just now"],
      [60_000, "1 min ago"],
      [59 * 60_000 + 59_999, "59 min ago"],
      [60 * 60_000, "1 h ago"],
      [5 * 60 * 60_000 + 30 * 60_000, "5 h ago"],
    ])("formatAge(%i) = %s", (ms, expected) => {
      expect(formatAge(ms)).toBe(expected);
    });
  });
});
