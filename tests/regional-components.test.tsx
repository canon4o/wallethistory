// @vitest-environment jsdom
import { cleanup, screen, waitFor, within, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRegionalSettings } from "@/components/admin/UserRegionalSettings";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegionProvider, useRegion } from "@/components/layout/RegionProvider";
import { RegionalFields } from "@/components/settings/RegionalFields";
import { RegionalForm } from "@/components/settings/RegionalForm";
import { Amount } from "@/components/transactions/Amount";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { TransactionForm } from "@/components/transactions/TransactionForm";

const mocks = vi.hoisted(() => ({
  updateRegionalSettings: vi.fn(),
  updateUserRegionalSettings: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/actions/users", () => ({ updateRegionalSettings: mocks.updateRegionalSettings }));
vi.mock("@/lib/actions/admin", () => ({ updateUserRegionalSettings: mocks.updateUserRegionalSettings }));
vi.mock("@/lib/actions/auth", () => ({ register: mocks.register }));
vi.mock("@/lib/actions/budgets", () => ({ createBudget: vi.fn(), updateBudget: vi.fn() }));
vi.mock("@/lib/actions/transactions", () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn() }));
vi.mock("@/lib/actions/recurring", () => ({ createRecurringRule: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));

const timezones = ["UTC", "Asia/Tokyo", "Europe/Sofia", "America/New_York"];

/** Opens the searchable Timezone dropdown, searches and clicks the option. */
async function pickTimezone(name: string) {
  const input = screen.getByRole("combobox", { name: "Timezone" });
  await userEvent.click(input);
  await userEvent.type(input, name);
  await userEvent.click(within(screen.getByRole("listbox", { name: "Timezone" })).getByRole("option", { name }));
}

beforeEach(() => {
  mocks.updateRegionalSettings.mockReset().mockResolvedValue({ ok: true });
  mocks.updateUserRegionalSettings.mockReset().mockResolvedValue({ ok: true });
  mocks.register.mockReset().mockResolvedValue({ ok: true, requiresVerification: true, email: "a@b.co" });
  mocks.refresh.mockReset();
});
afterEach(cleanup);

function Probe() {
  const { currency, timezone } = useRegion();
  return <p>{`${currency} ${timezone}`}</p>;
}

describe("RegionProvider", () => {
  it("defaults to USD and UTC without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("USD UTC")).toBeInTheDocument();
  });

  it("gives client components the user's region", () => {
    render(
      <RegionProvider region={{ currency: "EUR", timezone: "Europe/Sofia" }}>
        <Probe />
      </RegionProvider>,
    );
    expect(screen.getByText("EUR Europe/Sofia")).toBeInTheDocument();
  });
});

describe("Amount", () => {
  it("shows a + on income only, with the currency symbol", () => {
    render(<Amount type="income" amount="12.5" currency="EUR" />);
    expect(screen.getByText("+€12.50")).toHaveClass("text-income-text");
    render(<Amount type="expense" amount="7" currency="EUR" />);
    expect(screen.getByText("€7.00")).toHaveClass("text-text");
    expect(screen.getByText("€7.00")).not.toHaveClass("text-expense-text");
  });
});

describe("forms follow the currency", () => {
  const region = (children: React.ReactNode) => (
    <RegionProvider region={{ currency: "EUR", timezone: "Asia/Tokyo" }}>{children}</RegionProvider>
  );

  it("labels money inputs with the symbol", () => {
    render(region(<BudgetForm categories={[]} onDone={() => {}} />));
    expect(screen.getByLabelText("Limit (€)")).toBeInTheDocument();
  });

  it("labels money inputs with $ by default", () => {
    render(<BudgetForm categories={[]} onDone={() => {}} />);
    expect(screen.getByLabelText("Limit ($)")).toBeInTheDocument();
  });

  it("starts a new transaction on the user's local date", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-30T20:00:00Z") });
    try {
      render(region(<TransactionForm accounts={[]} categories={[]} tags={[]} onDone={() => {}} />));
      expect(screen.getByLabelText("Date")).toHaveValue("2026-10-01");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RegionalFields", () => {
  it("previews the amount format and the offset", () => {
    render(
      <RegionalFields
        idPrefix="t"
        currency="EUR"
        timezone="Asia/Tokyo"
        timezones={timezones}
        onCurrencyChange={() => {}}
        onTimezoneChange={() => {}}
      />,
    );
    expect(screen.getByText(/Example: €1,234\.50/)).toBeInTheDocument();
    expect(screen.getByText(/Now UTC\+09:00/)).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /^[A-Z]{3} \(.\)$/ }).map((o) => o.textContent)).toEqual([
      "USD ($)",
      "EUR (€)",
      "GBP (£)",
    ]);
  });

  it("still lists a timezone that is not in the offered names", async () => {
    render(
      <RegionalFields
        idPrefix="t"
        currency="USD"
        timezone="Asia/Calcutta"
        timezones={timezones}
        onCurrencyChange={() => {}}
        onTimezoneChange={() => {}}
        errors={{ currency: "Bad currency", timezone: "Bad zone" }}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("Asia/Calcutta");
    await userEvent.click(screen.getByRole("combobox", { name: "Timezone" }));
    expect(screen.getByRole("option", { name: "Asia/Calcutta" })).toBeInTheDocument();
    expect(screen.getByText("Bad currency")).toBeInTheDocument();
    expect(screen.getByText("Bad zone")).toBeInTheDocument();
  });
});

describe("RegionalForm", () => {
  it("saves the chosen currency and timezone", async () => {
    render(<RegionalForm currency="USD" timezone="UTC" timezones={timezones} />);
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await pickTimezone("Europe/Sofia");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateRegionalSettings).toHaveBeenCalledWith({ currency: "EUR", timezone: "Europe/Sofia" });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("shows the error and field errors when saving fails", async () => {
    mocks.updateRegionalSettings.mockResolvedValue({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { timezone: ["Choose a valid timezone"], currency: ["Choose a currency"] },
    });
    render(<RegionalForm currency="USD" timezone="UTC" timezones={timezones} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByText("Choose a valid timezone")).toBeInTheDocument();
    expect(screen.getByText("Choose a currency")).toBeInTheDocument();
  });

  it("shows a plain failure without field errors", async () => {
    mocks.updateRegionalSettings.mockResolvedValue({ ok: false, error: "Something went wrong." });
    render(<RegionalForm currency="USD" timezone="UTC" timezones={timezones} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });
});

describe("UserRegionalSettings (admin)", () => {
  it("saves for the given user and refreshes the page", async () => {
    render(<UserRegionalSettings userId="u1" currency="USD" timezone="UTC" timezones={timezones} />);
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await pickTimezone("Asia/Tokyo");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.updateUserRegionalSettings).toHaveBeenCalledWith({ userId: "u1", currency: "EUR", timezone: "Asia/Tokyo" }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows why saving failed", async () => {
    mocks.updateUserRegionalSettings.mockResolvedValue({
      ok: false,
      error: "This user no longer exists.",
      fieldErrors: { currency: ["Choose a currency"] },
    });
    render(<UserRegionalSettings userId="u1" currency="USD" timezone="UTC" timezones={timezones} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This user no longer exists.")).toBeInTheDocument();
    expect(screen.getByText("Choose a currency")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("RegisterForm", () => {
  const fill = async () => {
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Confirm password"), "password123");
  };

  it("pre-selects the browser's timezone and sends the choices", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValueOnce({ timeZone: "Asia/Tokyo" } as Intl.ResolvedDateTimeFormatOptions);
    try {
      render(<RegisterForm timezones={timezones} />);
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("Asia/Tokyo"));
      await fill();
      await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
      await userEvent.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() =>
        expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ currency: "EUR", timezone: "Asia/Tokyo" })),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("starts at USD and lets the user pick a timezone", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValueOnce({ timeZone: "" } as Intl.ResolvedDateTimeFormatOptions);
    try {
      render(<RegisterForm timezones={timezones} />);
      expect(screen.getByLabelText("Currency")).toHaveValue("USD");
      await pickTimezone("Europe/Sofia");
      expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("Europe/Sofia");
      await fill();
      await userEvent.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() =>
        expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", timezone: "Europe/Sofia" })),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("works without a list of timezones", () => {
    render(<RegisterForm />);
    expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("UTC");
  });
});
