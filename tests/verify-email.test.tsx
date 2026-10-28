// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";
import { renderServer } from "./helpers/server-render";

const mocks = vi.hoisted(() => ({ verifyEmail: vi.fn(), resendVerification: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/actions/auth", () => ({ verifyEmail: mocks.verifyEmail, resendVerification: mocks.resendVerification }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("verify-email page", () => {
  it("only shows a confirm button for a token and does not consume it on load", async () => {
    await renderServer(await VerifyEmailPage({ searchParams: Promise.resolve({ token: "abc" }) } as never));
    expect(screen.getByRole("button", { name: "Confirm email" })).toBeInTheDocument();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("shows the invalid-link message when there is no token", async () => {
    await renderServer(await VerifyEmailPage({ searchParams: Promise.resolve({}) } as never));
    expect(screen.getByText("This link is invalid or has expired.")).toBeInTheDocument();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
});

describe("VerifyEmailForm", () => {
  it("verifies on click and goes to the login page", async () => {
    mocks.verifyEmail.mockResolvedValue({ ok: true });
    render(<VerifyEmailForm token="abc" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/login?verified=1"));
    expect(mocks.verifyEmail).toHaveBeenCalledWith("abc");
  });

  it("shows the error and stays on the page when the token is rejected", async () => {
    mocks.verifyEmail.mockResolvedValue({ ok: false, error: "This link is invalid or has expired." });
    render(<VerifyEmailForm token="abc" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirm email" }));
    expect(await screen.findByText("This link is invalid or has expired.")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm email" })).toBeEnabled();
  });
});

describe("resend from the verify-email page", () => {
  it("offers a resend form when the link is invalid and sends the email address", async () => {
    mocks.resendVerification.mockResolvedValue({ ok: true, message: "Sent." });
    await renderServer(await VerifyEmailPage({ searchParams: Promise.resolve({}) } as never));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByText("Sent.")).toBeInTheDocument();
    expect(mocks.resendVerification).toHaveBeenCalledWith({ email: "a@b.co" });
  });
});
