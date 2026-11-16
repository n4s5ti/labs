// Group-A component tests: behavior parity with `@ui-sdk/solid`.
import { describe, expect, test } from "bun:test";
import { render } from "ilha/test";
import { renderToString } from "ilha";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "./accordion.tsx";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx";
import { useAsyncOptions } from "./async-options.ts";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteList,
  AutocompleteTrigger,
} from "./autocomplete.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar.tsx";
import { Calendar, CalendarGrid, CalendarHeading } from "./calendar.tsx";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "./carousel.tsx";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./collapsible.tsx";
import { ColorPicker, ColorPickerArea, ColorPickerSlider } from "./color-picker.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "./combobox.tsx";
import { Command, CommandInput, CommandItem, CommandList } from "./command.tsx";

describe("Accordion", () => {
  test("trigger opens its panel", async () => {
    const ui = render(() => (
      <Accordion>
        <AccordionItem value="a">
          <AccordionHeader>
            <AccordionTrigger>First</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Panel A</AccordionPanel>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionHeader>
            <AccordionTrigger>Second</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Panel B</AccordionPanel>
        </AccordionItem>
      </Accordion>
    ));
    await ui.settled();
    expect(ui.text()).not.toContain("Panel A");
    const triggers = ui.queryAll("button");
    expect(triggers.length).toBe(2);
    triggers[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(ui.text()).toContain("Panel A");
    expect(ui.query("button")?.getAttribute("aria-expanded")).toBe("true");
    ui.unmount();
  });
});

describe("Avatar", () => {
  test("renders image and fallback shells", async () => {
    const ui = render(() => (
      <Avatar>
        <AvatarImage src="https://example.com/me.png" alt="Me" />
        <AvatarFallback>ME</AvatarFallback>
      </Avatar>
    ));
    await ui.settled();
    expect(ui.query("img")?.getAttribute("src")).toBe("https://example.com/me.png");
    expect(ui.query("span") !== null).toBe(true);
    ui.unmount();
  });
});

describe("Collapsible", () => {
  test("trigger toggles its panel", async () => {
    const ui = render(() => (
      <Collapsible>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsiblePanel>Hidden details</CollapsiblePanel>
      </Collapsible>
    ));
    await ui.settled();
    expect(ui.text()).not.toContain("Hidden details");
    await ui.click("button");
    expect(ui.text()).toContain("Hidden details");
    await ui.click("button");
    expect(ui.text()).not.toContain("Hidden details");
    ui.unmount();
  });
});

describe("Carousel", () => {
  test("renders slides with step buttons", async () => {
    const ui = render(() => (
      <Carousel aria-label="Gallery">
        <CarouselViewport>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
            <CarouselItem>Two</CarouselItem>
          </CarouselContent>
        </CarouselViewport>
        <CarouselPrevious>Back</CarouselPrevious>
        <CarouselNext>Next</CarouselNext>
      </Carousel>
    ));
    await ui.settled();
    expect(ui.text()).toContain("One");
    expect(ui.text()).toContain("Two");
    expect(ui.queryAll("button").length).toBe(2);
    ui.unmount();
  });
});

describe("ColorPicker", () => {
  test("renders area, slider and form input", async () => {
    const ui = render(() => (
      <ColorPicker defaultValue="#ff0000">
        <ColorPickerArea />
        <ColorPickerSlider />
      </ColorPicker>
    ));
    await ui.settled();
    expect(ui.query('input[type="hidden"]') !== null).toBe(true);
    expect(ui.text()).not.toContain("undefined");
    ui.unmount();
  });
});

describe("Command", () => {
  test("data items render and filter as you type", async () => {
    const ui = render(() => (
      <Command items={["apple", "banana"]}>
        <CommandInput aria-label="Search" />
        <CommandList />
      </Command>
    ));
    await ui.settled();
    expect(ui.text()).toContain("apple");
    expect(ui.text()).toContain("banana");
    await ui.input("input", "ban");
    expect(ui.text()).toContain("banana");
    expect(ui.text()).not.toContain("apple");
    ui.unmount();
  });

  test("clicking an item runs onAction", async () => {
    let acted: unknown;
    const ui = render(() => (
      <Command
        items={["apple", "banana"]}
        onAction={(value) => void (acted = value)}
      >
        <CommandInput aria-label="Search" />
        <CommandList>
          <CommandItem value="apple">apple</CommandItem>
          <CommandItem value="banana">banana</CommandItem>
        </CommandList>
      </Command>
    ));
    await ui.settled();
    const items = ui.queryAll('[role="option"]');
    expect(items.length).toBe(2);
    items[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(acted).toBe("apple");
    ui.unmount();
  });
});

describe("Autocomplete", () => {
  test("typing suggests matches inline", async () => {
    const ui = render(() => (
      <Autocomplete items={["apple", "banana"]}>
        <AutocompleteInput aria-label="Fruit" />
        <AutocompleteTrigger>Open</AutocompleteTrigger>
        <AutocompleteContent>
          <AutocompleteList />
        </AutocompleteContent>
      </Autocomplete>
    ));
    await ui.settled();
    expect(ui.query('[role="listbox"]')).toBe(null);
    await ui.input("input", "a");
    await ui.settled();
    expect(ui.query('[role="listbox"]') !== null).toBe(true);
    expect(ui.text()).toContain("apple");
    ui.unmount();
  });
});

describe("Combobox", () => {
  test("trigger opens the listbox inline and choosing closes it", async () => {
    let value: unknown;
    const ui = render(() => (
      <Combobox
        items={["apple", "banana"]}
        onValueChange={(next) => void (value = next)}
      >
        <ComboboxInput aria-label="Fruit" />
        <ComboboxTrigger>Open</ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="apple">apple</ComboboxItem>
            <ComboboxItem value="banana">banana</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ));
    await ui.settled();
    expect(ui.query('[role="listbox"]')).toBe(null);
    const buttons = ui.queryAll("button");
    buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(ui.query('[role="listbox"]') !== null).toBe(true);
    const options = ui.queryAll('[role="option"]');
    expect(options.length).toBe(2);
    options[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value).toBe("banana");
    expect(ui.query('[role="listbox"]')).toBe(null);
    ui.unmount();
  });
});

describe("AlertDialog", () => {
  test("trigger opens the modal and close dismisses it", async () => {
    const ui = render(() => (
      <AlertDialog>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogTitle>Confirm</AlertDialogTitle>
          <AlertDialogClose>Cancel</AlertDialogClose>
        </AlertDialogContent>
      </AlertDialog>
    ));
    await ui.settled();
    expect(ui.query('[role="alertdialog"]')).toBe(null);
    await ui.click("button");
    expect(ui.query('[role="alertdialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("Confirm");
    const buttons = ui.queryAll("button");
    buttons[buttons.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await ui.settled();
    expect(ui.query('[role="alertdialog"]')).toBe(null);
    ui.unmount();
  });

  test("Escape closes the modal", async () => {
    const ui = render(() => (
      <AlertDialog>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    ));
    await ui.settled();
    await ui.click("button");
    expect(ui.query('[role="alertdialog"]') !== null).toBe(true);
    ui.query('[role="alertdialog"]')?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    await ui.settled();
    expect(ui.query('[role="alertdialog"]')).toBe(null);
    ui.unmount();
  });
});

describe("Calendar", () => {
  test("renders a month grid with seven weekday columns", async () => {
    const ui = render(() => (
      <Calendar defaultMonth="2026-11">
        <CalendarHeading />
        <CalendarGrid />
      </Calendar>
    ));
    await ui.settled();
    expect(ui.query("table") !== null).toBe(true);
    expect(ui.queryAll('th[scope="col"]').length).toBe(7);
    expect((ui.query("h2")?.textContent ?? "").length > 0).toBe(true);
    ui.unmount();
  });
});

describe("useAsyncOptions", () => {
  test("immediate load fills items", async () => {
    const ui = render(() => (
      <ProbeList />
    ));
    await ui.settled();
    await ui.settled();
    expect(ui.text()).toContain("a/b");
    ui.unmount();
  });
});

function ProbeList() {
  const async = useAsyncOptions<string>(async () => ["a", "b"], {
    immediate: true,
  });
  return <div>{async.items.length > 0 ? "a/b" : `status:${async.status}`}</div>;
}

describe("SSR", () => {
  test("accordion and command render to string", async () => {
    const html = await renderToString(() => (
      <Accordion>
        <AccordionItem value="a">
          <AccordionHeader>
            <AccordionTrigger>First</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Panel A</AccordionPanel>
        </AccordionItem>
      </Accordion>
    ));
    expect(html).toContain("First");
    const commandHtml = await renderToString(() => (
      <Command items={["apple"]}>
        <CommandInput aria-label="Search" />
        <CommandList />
      </Command>
    ));
    expect(commandHtml).toContain("input");
  });
});
