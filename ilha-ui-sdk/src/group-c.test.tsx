// Group-C component tests: behavior parity with `@ui-sdk/solid`.
import { describe, expect, test } from "bun:test";
import { render } from "ilha/test";
import { renderToString } from "ilha";
import { confirm } from "@ui-sdk/core/dialog";
import { createPreference } from "@ui-sdk/core";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "./menu.tsx";
import { Menubar } from "./menubar.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu.tsx";
import { formatNumber, parseNumber } from "./number.ts";
import {
  NumberInput,
  NumberInputControl,
  NumberInputIncrement,
} from "./number-input.tsx";
import { OTPInput, OTPInputGroup, OTPInputSlot } from "./otp-input.tsx";
import { OverlayHost } from "./overlays.tsx";
import {
  Pagination,
  PaginationEllipsis,
  PaginationLink,
  PaginationList,
  PaginationNext,
} from "./pagination.tsx";
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "./password-input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover.tsx";
import { renderPopup, usePopupContainer } from "./popup.ts";
import { Preferences, usePreference } from "./preferences.tsx";
import { Radio, RadioGroup } from "./radio.tsx";

describe("number utils", () => {
  test("parse and format round-trip", () => {
    expect(parseNumber("1,234.5", "en-US")).toBe(1234.5);
    expect(formatNumber(1234.5, "en-US")).toBe("1,234.5");
  });
});

describe("Menu", () => {
  test("trigger opens the content inline and item select closes", async () => {
    let selected = false;
    const ui = render(() => (
      <Menu>
        <MenuTrigger>Open</MenuTrigger>
        <MenuContent>
          <MenuItem
            value="apple"
            onSelect={() => void (selected = true)}
          >
            Apple
          </MenuItem>
        </MenuContent>
      </Menu>
    ));
    await ui.settled();
    expect(ui.text()).not.toContain("Apple");
    await ui.click("button");
    expect(ui.query('[role="menu"]') !== null).toBe(true);
    expect(ui.text()).toContain("Apple");
    const item = ui.query('[role="menuitem"]');
    item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(selected).toBe(true);
    expect(ui.query('[role="menu"]')).toBe(null);
    ui.unmount();
  });

  test("data menu renders its own content", async () => {
    const ui = render(() => (
      <Menu items={["new", "open"]}>
        <MenuTrigger>File</MenuTrigger>
      </Menu>
    ));
    await ui.settled();
    await ui.click("button");
    expect(ui.text()).toContain("open");
    ui.unmount();
  });
});

describe("Menubar", () => {
  test("a menu inside joins the menubar", async () => {
    const ui = render(() => (
      <Menubar>
        <Menu>
          <MenuTrigger>File</MenuTrigger>
          <MenuContent>
            <MenuItem value="new">New</MenuItem>
          </MenuContent>
        </Menu>
      </Menubar>
    ));
    await ui.settled();
    expect(ui.query('[role="menubar"]') !== null).toBe(true);
    await ui.click("button");
    expect(ui.text()).toContain("New");
    ui.unmount();
  });
});

describe("NavigationMenu", () => {
  test("trigger opens its item content inline", async () => {
    const ui = render(() => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>Product list</NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ));
    await ui.settled();
    expect(ui.query("nav") !== null).toBe(true);
    expect(ui.text()).not.toContain("Product list");
    await ui.click("button");
    expect(ui.text()).toContain("Product list");
    ui.unmount();
  });

  test("SSR renders without the content", async () => {
    const html = await renderToString(() => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>Product list</NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ));
    expect(html).toContain("Products");
    expect(html.includes("Product list")).toBe(false);
  });
});

describe("NumberInput", () => {
  test("control shows the default and the increment button steps", async () => {
    const ui = render(() => (
      <NumberInput defaultValue={3}>
        <NumberInputControl aria-label="Qty" />
        <NumberInputIncrement aria-label="More" />
      </NumberInput>
    ));
    await ui.settled();
    const input = ui.query("input") as HTMLInputElement | null;
    expect(input?.value).toBe("3");
    expect(ui.query('input[type="hidden"]') !== null).toBe(true);
    const buttons = ui.queryAll("button");
    buttons[buttons.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await ui.settled();
    expect((ui.query("input") as HTMLInputElement | null)?.value).toBe("4");
    ui.unmount();
  });
});

describe("OTPInput", () => {
  test("slots show a controlled value's characters", async () => {
    const ui = render(() => (
      <OTPInput value="12" maxLength={4} aria-label="Code">
        <OTPInputGroup>
          <OTPInputSlot index={0} />
          <OTPInputSlot index={1} />
          <OTPInputSlot index={2} />
          <OTPInputSlot index={3} />
        </OTPInputGroup>
      </OTPInput>
    ));
    await ui.settled();
    // The default pattern only takes digits, so the code is numeric.
    expect(ui.text()).toContain("1");
    expect(ui.text()).toContain("2");
    expect(ui.query("input") !== null).toBe(true);
    ui.unmount();
  });
});

describe("OverlayHost", () => {
  test("confirm renders a dialog and resolves through it", async () => {
    const ui = render(() => <OverlayHost />);
    await ui.settled();
    let result: boolean | undefined;
    void confirm({ title: "Delete?", description: "Gone forever" }).then(
      (value) => void (result = value),
    );
    await ui.settled();
    expect(ui.query('[role="alertdialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("Delete?");
    const buttons = ui.queryAll("button");
    buttons[buttons.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await ui.settled();
    expect(result).toBe(true);
    expect(ui.query('[role="alertdialog"]')).toBe(null);
    ui.unmount();
  });
});

describe("Pagination", () => {
  test("range links and an ellipsis render", async () => {
    const ui = render(() => (
      <Pagination pageCount={10} aria-label="Pages">
        <PaginationList>
          {(state) => (
            <>
              {state.items.map((item) =>
                typeof item === "number" ? (
                  <PaginationLink key={item} page={item} />
                ) : (
                  <PaginationEllipsis key={item} />
                )
              )}
            </>
          )}
        </PaginationList>
      </Pagination>
    ));
    await ui.settled();
    expect(ui.query("nav") !== null).toBe(true);
    expect(ui.text()).toContain("…");
    expect(ui.text()).toContain("10");
    ui.unmount();
  });

  test("next step moves one page", async () => {
    let page: unknown;
    const ui = render(() => (
      <Pagination
        pageCount={5}
        onPageChange={(next) => void (page = next)}
        aria-label="Pages"
      >
        <PaginationNext aria-label="Next" />
      </Pagination>
    ));
    await ui.settled();
    await ui.click("button");
    expect(page).toBe(2);
    ui.unmount();
  });
});

describe("PasswordInput", () => {
  test("toggle shows the password text", async () => {
    const ui = render(() => (
      <PasswordInput defaultValue="secret">
        <PasswordInputControl aria-label="Password" />
        <PasswordInputToggle aria-label="Show">Show</PasswordInputToggle>
      </PasswordInput>
    ));
    await ui.settled();
    expect(ui.query("input")?.getAttribute("type")).toBe("password");
    await ui.click("button");
    expect(ui.query("input")?.getAttribute("type")).toBe("text");
    ui.unmount();
  });
});

describe("Popover", () => {
  test("trigger opens the panel inline and Escape closes it", async () => {
    const ui = render(() => (
      <Popover>
        <PopoverTrigger>Info</PopoverTrigger>
        <PopoverContent>Details</PopoverContent>
      </Popover>
    ));
    await ui.settled();
    expect(ui.text()).not.toContain("Details");
    await ui.click("button");
    expect(ui.query('[role="dialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("Details");
    ui.query('[role="dialog"]')?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    ui.unmount();
  });
});

describe("popup helpers", () => {
  test("renderPopup renders in place and containers pass through", async () => {
    let seen: unknown;
    function Probe() {
      const target = usePopupContainer(() => undefined);
      seen = target();
      return <>{renderPopup(() => <div>inline</div>, target)}</>;
    }
    const ui = render(() => <Probe />);
    await ui.settled();
    expect(ui.text()).toContain("inline");
    expect(seen).toBe(undefined);
    ui.unmount();
  });
});

describe("Preferences", () => {
  test("writes the value on its own element", async () => {
    const preference = createPreference({
      values: ["a", "b"] as const,
      defaultValue: "a",
      attribute: "data-test-pref",
    });
    const ui = render(() => (
      <Preferences preferences={[preference]}>
        <span>kid</span>
      </Preferences>
    ));
    await ui.settled();
    const div = ui.query("div");
    expect(div?.getAttribute("data-slot")).toBe("preferences");
    expect(div?.getAttribute("data-test-pref")).toBe("a");
    expect(ui.query("script")).toBe(null);
    ui.unmount();
  });

  test("usePreference reads the default", async () => {
    const preference = createPreference({
      values: ["a", "b"] as const,
      defaultValue: "b",
      attribute: "data-test-pref-2",
    });
    function Reader() {
      const state = usePreference(preference);
      return <span>{state().value}</span>;
    }
    const ui = render(() => <Reader />);
    await ui.settled();
    expect(ui.text()).toContain("b");
    ui.unmount();
  });
});

describe("Radio", () => {
  test("clicking a radio checks it", async () => {
    let value: unknown;
    const ui = render(() => (
      <RadioGroup
        aria-label="Size"
        onValueChange={(next) => void (value = next)}
      >
        <Radio value="s">S</Radio>
        <Radio value="m">M</Radio>
      </RadioGroup>
    ));
    await ui.settled();
    const radios = ui.queryAll("button");
    expect(radios.length).toBe(2);
    radios[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value).toBe("m");
    expect(ui.query('[aria-checked="true"]') !== null).toBe(true);
    ui.unmount();
  });
});
