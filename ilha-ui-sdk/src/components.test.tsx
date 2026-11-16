// Tranche-1 component tests: behavior parity with `@ui-sdk/solid`.
import { describe, expect, test } from "bun:test";
import { render } from "ilha/test";
import { renderToString } from "ilha";

import { Button } from "./button.tsx";
import { Checkbox, CheckboxGroup } from "./checkbox.tsx";
import { Label } from "./label.tsx";
import { Meter } from "./meter.tsx";
import { Progress } from "./progress.tsx";
import { Separator } from "./separator.tsx";
import { Switch } from "./switch.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "./tabs.tsx";
import { Toggle, ToggleGroup } from "./toggle.tsx";

describe("Button", () => {
  test("renders a native button and runs onClick", async () => {
    let presses = 0;
    const ui = render(() => <Button onclick={() => void (presses += 1)}>Save</Button>);
    await ui.settled();
    expect(ui.query("button")?.textContent).toBe("Save");
    await ui.click("button");
    expect(presses).toBe(1);
    ui.unmount();
  });

  test("disabled button ignores presses", async () => {
    let presses = 0;
    const ui = render(() => (
      <Button disabled onclick={() => void (presses += 1)}>
        Save
      </Button>
    ));
    await ui.settled();
    expect(ui.query("button")?.getAttribute("disabled")).not.toBe(null);
    await ui.click("button");
    expect(presses).toBe(0);
    ui.unmount();
  });
});

describe("Checkbox", () => {
  test("toggles checked state on click", async () => {
    const ui = render(() => <Checkbox>Accept</Checkbox>);
    await ui.settled();
    const root = ui.query('[role="checkbox"]');
    expect(root?.getAttribute("aria-checked")).toBe("false");
    await ui.click('[role="checkbox"]');
    expect(ui.query('[role="checkbox"]')?.getAttribute("aria-checked")).toBe("true");
    ui.unmount();
  });

  test("group shares one value", async () => {
    const ui = render(() => (
      <CheckboxGroup>
        <Checkbox value="a">A</Checkbox>
        <Checkbox value="b">B</Checkbox>
      </CheckboxGroup>
    ));
    await ui.settled();
    expect(ui.queryAll('[role="checkbox"]').length).toBe(2);
    await ui.click('[role="checkbox"]');
    expect(ui.queryAll('[role="checkbox"]')[0]?.getAttribute("aria-checked")).toBe("true");
    ui.unmount();
  });
});

describe("Switch", () => {
  test("toggles on click", async () => {
    const ui = render(() => <Switch>Wifi</Switch>);
    await ui.settled();
    expect(ui.query('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    await ui.click('[role="switch"]');
    expect(ui.query('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    ui.unmount();
  });
});

describe("Toggle", () => {
  test("stays pressed after click", async () => {
    const ui = render(() => <Toggle>Bold</Toggle>);
    await ui.settled();
    expect(ui.query("button")?.getAttribute("aria-pressed")).toBe("false");
    await ui.click("button");
    expect(ui.query("button")?.getAttribute("aria-pressed")).toBe("true");
    ui.unmount();
  });

  test("group selects one value", async () => {
    const ui = render(() => (
      <ToggleGroup>
        <Toggle value="a">A</Toggle>
        <Toggle value="b">B</Toggle>
      </ToggleGroup>
    ));
    await ui.settled();
    await ui.click("button");
    expect(ui.queryAll("button")[0]?.getAttribute("aria-pressed")).toBe("true");
    ui.unmount();
  });
});

describe("Tabs", () => {
  test("selecting a tab shows its panel", async () => {
    const ui = render(() => (
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTab value="one">One</TabsTab>
          <TabsTab value="two">Two</TabsTab>
        </TabsList>
        <TabsPanel value="one">First</TabsPanel>
        <TabsPanel value="two">Second</TabsPanel>
      </Tabs>
    ));
    await ui.settled();
    expect(ui.query('[role="tablist"]') !== null).toBe(true);
    expect(ui.text()).toContain("First");
    // NB: happy-dom does not honor `:last-child` here, so address the tab
    // by index instead of dispatching to the wrong target.
    const tabs = ui.queryAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    tabs[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await ui.settled();
    expect(ui.text()).toContain("Second");
    expect(ui.queryAll('[role="tab"]')[1]?.getAttribute("aria-selected")).toBe("true");
    ui.unmount();
  });
});

describe("SSR", () => {
  test("button renders to string with its label", async () => {
    const html = await renderToString(() => <Button>Save</Button>);
    expect(html).toContain("Save");
    expect(html).toContain("<button");
  });
});

describe("Label, Separator, Meter, Progress", () => {
  test("label renders a native label", async () => {
    const ui = render(() => <Label for="name">Name</Label>);
    await ui.settled();
    expect(ui.query("label")?.textContent).toBe("Name");
    ui.unmount();
  });

  test("separator renders with role", async () => {
    const ui = render(() => <Separator />);
    await ui.settled();
    expect(ui.query('[role="separator"]') !== null).toBe(true);
    ui.unmount();
  });

  test("meter exposes its value", async () => {
    const ui = render(() => <Meter value={0.4} />);
    await ui.settled();
    expect(ui.query('[role="meter"]') !== null).toBe(true);
    ui.unmount();
  });

  test("progress exposes its value", async () => {
    const ui = render(() => <Progress value={40} />);
    await ui.settled();
    expect(ui.query('[role="progressbar"]') !== null).toBe(true);
    ui.unmount();
  });
});
