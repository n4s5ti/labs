// Group-B component tests: behavior parity with `@ui-sdk/solid`.
import { describe, expect, test } from "bun:test";
import { render } from "ilha/test";
import { renderToString } from "ilha";

import { addDays, daysInMonth, isISODate, parseDate } from "./date.ts";
import { DateInput } from "./date-input.tsx";
import {
  DatePicker,
  DatePickerContent,
  DatePickerInput,
  DatePickerTrigger,
} from "./date-picker.tsx";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "./dialog.tsx";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer.tsx";
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "./field.tsx";
import {
  FileInput,
  FileInputDropzone,
  FileInputTrigger,
} from "./file-input.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./hover-card.tsx";
import { ImageCropper, ImageCropperSelection } from "./image-cropper.tsx";
import { Input, InputClear, InputGroup } from "./input.tsx";
import { Listbox, ListboxItem } from "./listbox.tsx";

describe("date utils", () => {
  test("addDays and daysInMonth agree on February", () => {
    expect(addDays("2026-02-27", 1)).toBe("2026-02-28");
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("not-a-date")).toBe(false);
    expect(parseDate("1/15/2026", "en-US")).toBe("2026-01-15");
  });
});

describe("DateInput", () => {
  test("renders locale-ordered segments and a hidden input", async () => {
    const ui = render(() => <DateInput aria-label="Birthday" />);
    await ui.settled();
    expect(ui.queryAll("input").length).toBeGreaterThan(1);
    expect(ui.query('input[type="hidden"]') !== null).toBe(true);
    ui.unmount();
  });
});

describe("DatePicker", () => {
  test("trigger opens the calendar inline", async () => {
    const ui = render(() => (
      <DatePicker defaultMonth="2026-11">
        <DatePickerInput aria-label="Date" />
        <DatePickerTrigger>Open</DatePickerTrigger>
        <DatePickerContent />
      </DatePicker>
    ));
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    await ui.click("button");
    expect(ui.query('[role="dialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("November");
    ui.unmount();
  });

  test("SSR renders without the popup", async () => {
    const html = await renderToString(() => (
      <DatePicker defaultMonth="2026-11">
        <DatePickerInput aria-label="Date" />
        <DatePickerTrigger>Open</DatePickerTrigger>
        <DatePickerContent />
      </DatePicker>
    ));
    expect(html).toContain("Open");
    expect(html.includes('role="dialog"')).toBe(false);
  });
});

describe("Dialog", () => {
  test("trigger opens and close dismisses inline", async () => {
    const ui = render(() => (
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogBackdrop />
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
          <DialogClose>Close</DialogClose>
        </DialogContent>
      </Dialog>
    ));
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    await ui.click("button");
    expect(ui.query('[role="dialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("Hello");
    const buttons = ui.queryAll("button");
    buttons[buttons.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    ui.unmount();
  });

  test("Escape closes the dialog", async () => {
    const ui = render(() => (
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
        </DialogContent>
      </Dialog>
    ));
    await ui.settled();
    await ui.click("button");
    expect(ui.query('[role="dialog"]') !== null).toBe(true);
    ui.query('[role="dialog"]')?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    ui.unmount();
  });
});

describe("Drawer", () => {
  test("trigger opens and close dismisses inline", async () => {
    const ui = render(() => (
      <Drawer>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerBackdrop />
        <DrawerContent>
          <DrawerTitle>Panel</DrawerTitle>
          <DrawerClose>Close</DrawerClose>
        </DrawerContent>
      </Drawer>
    ));
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    await ui.click("button");
    expect(ui.query('[role="dialog"]') !== null).toBe(true);
    expect(ui.text()).toContain("Panel");
    const buttons = ui.queryAll("button");
    buttons[buttons.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await ui.settled();
    expect(ui.query('[role="dialog"]')).toBe(null);
    ui.unmount();
  });
});

describe("Field", () => {
  test("label names the control", async () => {
    const ui = render(() => (
      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldControl />
        <FieldDescription>Your full name</FieldDescription>
      </Field>
    ));
    await ui.settled();
    const label = ui.query("label");
    const input = ui.query("input");
    expect(label?.textContent).toBe("Name");
    expect(input?.getAttribute("id")).toBe(label?.getAttribute("for"));
    expect(ui.text()).toContain("Your full name");
    ui.unmount();
  });

  test("invalid field shows its error", async () => {
    const ui = render(() => (
      <Field invalid>
        <FieldControl required />
        <FieldError>Required</FieldError>
      </Field>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Required");
    ui.unmount();
  });
});

describe("FileInput", () => {
  test("renders trigger and dropzone with hidden input", async () => {
    const ui = render(() => (
      <FileInput>
        <FileInputDropzone>
          <FileInputTrigger>Choose</FileInputTrigger>
        </FileInputDropzone>
      </FileInput>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Choose");
    expect(ui.query('input[type="file"]') !== null).toBe(true);
    ui.unmount();
  });
});

describe("HoverCard", () => {
  test("trigger renders as a link with no card until hover", async () => {
    const ui = render(() => (
      <HoverCard>
        <HoverCardTrigger href="https://example.com">Docs</HoverCardTrigger>
        <HoverCardContent>Preview</HoverCardContent>
      </HoverCard>
    ));
    await ui.settled();
    expect(ui.query("a")?.getAttribute("href")).toBe("https://example.com");
    expect(ui.text()).not.toContain("Preview");
    ui.unmount();
  });
});

describe("ImageCropper", () => {
  test("renders viewport and selection shells", async () => {
    const ui = render(() => (
      <ImageCropper src="https://example.com/photo.jpg">
        <ImageCropperSelection />
      </ImageCropper>
    ));
    await ui.settled();
    expect(ui.query("div") !== null).toBe(true);
    expect(ui.text()).not.toContain("undefined");
    ui.unmount();
  });
});

describe("Input", () => {
  test("renders a controlled value in its group", async () => {
    const ui = render(() => (
      <InputGroup>
        <Input aria-label="Name" value="Ada" />
        <InputClear aria-label="Clear" />
      </InputGroup>
    ));
    await ui.settled();
    expect((ui.query("input") as HTMLInputElement)?.value).toBe("Ada");
    ui.unmount();
  });

  test("uncontrolled input takes its default", async () => {
    const ui = render(() => <Input aria-label="Name" defaultValue="Bo" />);
    await ui.settled();
    expect((ui.query("input") as HTMLInputElement)?.value).toBe("Bo");
    ui.unmount();
  });
});

describe("Listbox", () => {
  test("clicking an option selects it", async () => {
    let value: unknown;
    const ui = render(() => (
      <Listbox
        aria-label="Fruit"
        items={["apple", "banana"]}
        onValueChange={(next) => void (value = next)}
      >
        <ListboxItem value="apple">apple</ListboxItem>
        <ListboxItem value="banana">banana</ListboxItem>
      </Listbox>
    ));
    await ui.settled();
    const options = ui.queryAll('[role="option"]');
    expect(options.length).toBe(2);
    options[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value).toBe("banana");
    expect(ui.query('[aria-selected="true"]') !== null).toBe(true);
    ui.unmount();
  });

  test("multiple listbox renders one hidden input per value", async () => {
    const ui = render(() => (
      <Listbox
        aria-label="Fruit"
        multiple
        value={["apple", "banana"]}
        items={["apple", "banana"]}
      />
    ));
    await ui.settled();
    // One text form-input plus one hidden input per value.
    expect(ui.queryAll("input").length).toBe(3);
    expect(ui.queryAll('input[type="hidden"]').length).toBe(2);
    ui.unmount();
  });
});
