// @vitest-environment jsdom
import { cleanup, screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("is labelled by its title and renders nothing inside while closed", () => {
    const { rerender } = render(
      <Modal open={false} title="Add tag" onClose={() => {}}>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    rerender(
      <Modal open title="Add tag" onClose={() => {}}>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Add tag" })).toBeInTheDocument();
  });

  it("does not focus any form field when it opens", () => {
    render(
      <Modal open title="Edit" onClose={() => {}}>
        <input type="hidden" name="id" />
        <input aria-label="Hidden radio" type="radio" className="sr-only" />
        <input aria-label="Name" />
        <input aria-label="Other" />
      </Modal>,
    );
    expect(screen.getByLabelText("Name")).not.toHaveFocus();
    expect(screen.getByRole("dialog", { hidden: true })).toHaveFocus();
  });

  it("prefers an element marked data-autofocus", () => {
    render(
      <Modal open title="Confirm" onClose={() => {}}>
        <input aria-label="Name" />
        <button data-autofocus>Safe choice</button>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Safe choice" })).toHaveFocus();
  });

  it("closes from the close button and from a click on the backdrop, not from clicks inside", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Edit" onClose={onClose}>
        <p>Inside</p>
      </Modal>,
    );
    await user.click(screen.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes the native dialog again when open turns false", () => {
    const { rerender } = render(
      <Modal open title="Edit" onClose={() => {}}>
        <p>Body</p>
      </Modal>,
    );
    expect(document.querySelector("dialog")).toHaveAttribute("open");
    rerender(
      <Modal open={false} title="Edit" onClose={() => {}}>
        <p>Body</p>
      </Modal>,
    );
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });
});

describe("ConfirmDialog", () => {
  it("starts on Cancel so a stray Enter never confirms a deletion", () => {
    render(
      <ConfirmDialog open title="Delete tag" description="Sure?" confirmLabel="Delete tag" onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("shows the description and a failure message, and disables both buttons while working", () => {
    render(
      <ConfirmDialog
        open
        title="Delete tag"
        description="This removes the tag."
        confirmLabel="Delete tag"
        pending
        error="Could not delete."
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("This removes the tag.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not delete.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });

  it("calls onConfirm and onClose", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Delete" description="x" confirmLabel="Delete it" onConfirm={onConfirm} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Delete it" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
