import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "./shell/AppShell";
import { ProgressDots, Sheet } from "./components";
import { fakeApi, testNav, Wrap } from "./test-utils";

describe("Sheet", () => {
  it("shows its title and content only while open, and Escape asks to close", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet open={false} onClose={onClose} title="Invoice">Body text</Sheet>);
    expect(screen.queryByText("Body text")).toBeNull();

    rerender(<Sheet open onClose={onClose} title="Invoice">Body text</Sheet>);
    const dialog = screen.getByRole("dialog", { name: "Invoice" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(within(dialog).getByText("Body text")).toBeTruthy();

    // The browser turns Escape into a cancelable `cancel` event on the dialog.
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true); // the parent decides whether it closes
  });

  it("closes on a backdrop click and returns focus to the opener", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open it</button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Details">Inside</Sheet>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Open it" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Details" });

    fireEvent.click(within(dialog).getByText("Inside")); // inside clicks keep it open
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.click(dialog); // the backdrop is the dialog element itself
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("ProgressDots", () => {
  it("labels the 1-based step from a 0-based index", () => {
    render(<ProgressDots index={1} total={4} />);
    expect(screen.getByRole("img", { name: "Step 2 of 4" })).toBeTruthy();
  });
});

describe("AppShell", () => {
  const shell = (current?: "home" | "months" | "settings") => render(
    <Wrap api={fakeApi()}><AppShell current={current} banners={<p>A banner</p>} belowMain={<p>Small print</p>} footer={<p>Footer</p>}>Page</AppShell></Wrap>,
  );

  it("renders three tabs with the nav hrefs, in the top bar and the bottom bar", () => {
    shell("months");
    for (const name of ["Main", "Main tabs"]) {
      const links = within(screen.getByRole("navigation", { name })).getAllByRole("link");
      expect(links.map((l) => l.textContent?.replace(/^\P{L}+/u, ""))).toEqual(["Home", "Months", "Settings"]);
      expect(links.map((l) => l.getAttribute("href"))).toEqual([testNav.hrefs.home(), testNav.hrefs.months(), testNav.hrefs.settings()]);
    }
  });

  it("marks only the current tab with aria-current", () => {
    shell("months");
    for (const name of ["Main", "Main tabs"]) {
      const current = within(screen.getByRole("navigation", { name })).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
      expect(current.map((l) => l.getAttribute("href"))).toEqual(["/months"]);
    }
  });

  it("marks nothing when there is no current tab, links the brand home, and renders the slots", () => {
    const { container } = shell();
    expect(container.querySelector("[aria-current]")).toBeNull();
    expect(screen.getByRole("link", { name: "Korra" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(within(container.querySelector("main#main")!).getByText("Page")).toBeTruthy();
    for (const t of ["A banner", "Small print", "Footer"]) expect(screen.getByText(t)).toBeTruthy();
  });
});
