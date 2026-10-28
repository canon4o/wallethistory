import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Opens the custom dropdown with this label and clicks the option with this name. */
export async function pickOption(user: UserEvent, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(within(screen.getByRole("listbox", { name: label })).getByRole("option", { name: option }));
}

/** The option names of the custom dropdown with this label (opens and closes it). */
export async function optionNames(user: UserEvent, label: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await user.click(trigger);
  const names = within(screen.getByRole("listbox", { name: label }))
    .getAllByRole("option")
    .map((o) => o.textContent);
  await user.click(trigger);
  return names;
}
