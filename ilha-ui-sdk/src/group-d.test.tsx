// Group-D component tests: behavior parity with `@ui-sdk/solid`.
import { describe, expect, test } from "bun:test";
import { context } from "ilha";
import { render } from "ilha/test";
import { renderToString } from "ilha";
import { createToaster } from "@ui-sdk/core/toast";

import { createAgent } from "./agent.ts";
import { parseColor, formatColor } from "./color.ts";
import { EditorContext } from "./editor-context.ts";
import { sectorOf, solveSpring } from "./gesture.ts";
import { createHistory } from "./history.ts";
import { cropImage } from "./image.ts";
import { fuzzyScore, matchRanges, matchSegments } from "./text-match.ts";
import { observe } from "./observe.ts";
import { Rating } from "./rating.tsx";
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "./resizable.tsx";
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "./scroll-area.tsx";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./segmented-control.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";
import { inSheetHeader } from "./sheet-header.tsx";
import { formatShortcut, registerShortcut } from "./shortcuts.ts";
import {
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "./slider.tsx";
import { defaultValueProps } from "./text-control.tsx";
import { Textarea } from "./textarea.tsx";
import { TimeInput } from "./time-input.tsx";
import { Timeline, TimelineItem, TimelineMarker } from "./timeline.tsx";
import { Region, ToastRegion } from "./toast-parts.tsx";
import { OverlayHost } from "./overlays.tsx";
import { TokenInput, TokenInputEditor } from "./token-input.tsx";
import { Toggle } from "./toggle.tsx";
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from "./toolbar.tsx";
import { Tooltip, TooltipTrigger } from "./tooltip.tsx";
import { Tree } from "./tree.tsx";
import { TriggerMenu, TriggerMenuInput } from "./trigger-menu.tsx";
import { Waterfall } from "./waterfall.tsx";

describe("Rating", () => {
  test("renders one radio per star and scores on press", async () => {
    let value: number | null = null;
    const ui = render(() => (
      <Rating
        defaultValue={3}
        onValueChange={(next: number | null) => void (value = next)}
      />
    ));
    await ui.settled();
    const radios = ui.queryAll('[role="radio"]');
    expect(radios.length).toBe(5);
    radios[3]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value === 4).toBe(true);
    ui.unmount();
  });
});

describe("Resizable", () => {
  test("renders panels and a handle in a row", async () => {
    const ui = render(() => (
      <Resizable orientation="horizontal">
        <ResizablePanel id="a" defaultSize={50} />
        <ResizableHandle />
        <ResizablePanel id="b" defaultSize={50} />
      </Resizable>
    ));
    await ui.settled();
    expect(ui.queryAll("div").length).toBeGreaterThan(3);
    expect(ui.text()).not.toContain("undefined");
    ui.unmount();
  });
});

describe("ScrollArea", () => {
  test("renders viewport, content and an oriented scrollbar", async () => {
    const ui = render(() => (
      <ScrollArea>
        <ScrollAreaViewport>
          <ScrollAreaContent>Tall content</ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Tall content");
    expect(ui.query('[data-orientation="vertical"]') !== null).toBe(true);
    ui.unmount();
  });
});

describe("SegmentedControl", () => {
  test("pressing a segment chooses its value", async () => {
    let value: string | null = null;
    const ui = render(() => (
      <SegmentedControl
        defaultValue="day"
        onValueChange={(next: string | null) => void (value = next)}
      >
        <SegmentedControlItem value="day">Day</SegmentedControlItem>
        <SegmentedControlItem value="week">Week</SegmentedControlItem>
      </SegmentedControl>
    ));
    await ui.settled();
    const buttons = ui.queryAll("button");
    expect(buttons.length).toBe(2);
    buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value === "week").toBe(true);
    ui.unmount();
  });
});

describe("Select", () => {
  test("trigger opens the list inline and item select closes", async () => {
    let value: string | null = null;
    const ui = render(() => (
      <Select
        items={["apple", "cherry"]}
        placeholder="Pick"
        onValueChange={(next: string | null) => void (value = next)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectContent>
      </Select>
    ));
    await ui.settled();
    expect(ui.query('[role="listbox"]')).toBe(null);
    await ui.click("button");
    expect(ui.query('[role="listbox"]') !== null).toBe(true);
    expect(ui.text()).toContain("Cherry");
    const options = ui.queryAll('[role="option"]');
    options[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await ui.settled();
    expect(value === "cherry").toBe(true);
    // Closed: the trigger collapses and the prepared list hides in place.
    expect(ui.query("button")?.getAttribute("aria-expanded")).toBe("false");
    expect(ui.query('[role="listbox"]')?.hasAttribute("hidden")).toBe(true);
    ui.unmount();
  });

  test("data select renders its own list", async () => {
    const ui = render(() => (
      <Select items={["new", "open"]}>
        <SelectTrigger>File</SelectTrigger>
      </Select>
    ));
    await ui.settled();
    await ui.click("button");
    expect(ui.text()).toContain("open");
    ui.unmount();
  });

  test("SSR renders without the content", async () => {
    const html = await renderToString(() => (
      <Select items={["a"]}>
        <SelectTrigger>Pick</SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    ));
    expect(html).toContain("Pick");
    expect(html.includes('role="listbox"')).toBe(false);
  });
});

describe("shortcuts", () => {
  test("shortcut names format and register round-trip", async () => {
    expect(formatShortcut("mod+k", false)).toContain("Ctrl");
    const release = registerShortcut("ctrl+x", () => {});
    expect(typeof release).toBe("function");
    release();
  });
});

describe("Slider", () => {
  test("renders a thumb and submits its value", async () => {
    const ui = render(() => (
      <Slider defaultValue={30} name="volume" aria-label="Volume">
        <SliderControl>
          <SliderTrack>
            <SliderThumb aria-label="Volume" />
          </SliderTrack>
        </SliderControl>
        <SliderValue />
      </Slider>
    ));
    await ui.settled();
    expect(ui.query('[role="slider"]') !== null).toBe(true);
    expect(ui.query('input[type="hidden"]') !== null).toBe(true);
    expect(ui.text()).toContain("30");
    ui.unmount();
  });
});

describe("text-control", () => {
  test("defaultValueProps moves a controlled value aside on the client", () => {
    const next = defaultValueProps({ value: "typed", name: "q" });
    expect((next as Record<string, unknown>).defaultValue).toBe("typed");
    expect("value" in (next as Record<string, unknown>)).toBe(false);
  });
});

describe("Textarea", () => {
  test("renders its value and submits under its name", async () => {
    const ui = render(() => <Textarea aria-label="Bio" value="Hi" name="bio" />);
    await ui.settled();
    const area = ui.query("textarea") as HTMLTextAreaElement | null;
    expect(area?.value).toBe("Hi");
    expect(area?.getAttribute("name")).toBe("bio");
    ui.unmount();
  });
});

describe("TimeInput", () => {
  test("renders segments and a hidden input", async () => {
    const ui = render(() => <TimeInput aria-label="Alarm" />);
    await ui.settled();
    expect(ui.queryAll("input").length).toBeGreaterThan(1);
    expect(ui.query('input[type="hidden"]') !== null).toBe(true);
    ui.unmount();
  });
});

describe("Timeline", () => {
  test("renders items with markers", async () => {
    const ui = render(() => (
      <Timeline>
        <TimelineItem value="a">
          <TimelineMarker />
          Shipped
        </TimelineItem>
      </Timeline>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Shipped");
    ui.unmount();
  });
});

describe("toast", () => {
  test("region renders toasts and dismisses them", async () => {
    const toaster = createToaster();
    const ui = render(() => <ToastRegion toaster={toaster} />);
    await ui.settled();
    const id = toaster("Hello");
    await ui.settled();
    expect(ui.text()).toContain("Hello");
    toaster.dismiss(id);
    await ui.settled();
    expect(ui.text()).not.toContain("Hello");
    ui.unmount();
  });

  test("overlay host renders a toaster entry inline", async () => {
    const toaster = createToaster();
    const ui = render(() => <OverlayHost />);
    await ui.settled();
    toaster("Pinned");
    await ui.settled();
    expect(ui.text()).toContain("Pinned");
    toaster.dismiss();
    await ui.settled();
    ui.unmount();
  });

  test("placed region wins over the host", async () => {
    const toaster = createToaster();
    const ui = render(() => (
      <>
        <Region toaster={toaster} placed />
        <OverlayHost />
      </>
    ));
    await ui.settled();
    toaster("Once");
    await ui.settled();
    expect(ui.text().split("Once").length - 1).toBe(1);
    toaster.dismiss();
    await ui.settled();
    ui.unmount();
  });
});

describe("TokenInput", () => {
  test("renders its editor", async () => {
    const ui = render(() => (
      <TokenInput>
        <TokenInputEditor placeholder="Add people" />
      </TokenInput>
    ));
    await ui.settled();
    expect(ui.text()).not.toContain("undefined");
    expect(ui.query('[contenteditable]') !== null).toBe(true);
    ui.unmount();
  });
});

describe("Toolbar", () => {
  test("renders buttons and a group", async () => {
    const ui = render(() => (
      <Toolbar aria-label="Edit">
        <ToolbarGroup>
          <ToolbarButton aria-label="Bold">B</ToolbarButton>
        </ToolbarGroup>
      </Toolbar>
    ));
    await ui.settled();
    expect(ui.query('[role="toolbar"]') !== null).toBe(true);
    expect(ui.text()).toContain("B");
    ui.unmount();
  });

  test("a toggle in a group joins the toolbar", async () => {
    let pressed = false;
    const ui = render(() => (
      <Toolbar aria-label="Edit">
        <ToolbarGroup>
          <Toggle aria-label="Bold" onPressedChange={(next) => void (pressed = next)}>
            B
          </Toggle>
        </ToolbarGroup>
      </Toolbar>
    ));
    await ui.settled();
    expect(ui.query('[role="toolbar"]') !== null).toBe(true);
    await ui.click("button");
    expect(pressed).toBe(true);
    ui.unmount();
  });
});

describe("Tooltip", () => {
  test("trigger renders with no content until hover", async () => {
    const ui = render(() => (
      <Tooltip>
        <TooltipTrigger>Save</TooltipTrigger>
      </Tooltip>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Save");
    expect(ui.query('[role="tooltip"]')).toBe(null);
    ui.unmount();
  });

  test("SSR renders without the content", async () => {
    const html = await renderToString(() => (
      <Tooltip>
        <TooltipTrigger>Save</TooltipTrigger>
      </Tooltip>
    ));
    expect(html).toContain("Save");
    expect(html.includes('role="tooltip"')).toBe(false);
  });
});

describe("Tree", () => {
  test("data tree renders its items expanded", async () => {
    const ui = render(() => (
      <Tree
        items={[
          {
            value: "src",
            label: "src",
            children: [{ value: "main", label: "main.ts" }],
          },
        ]}
        defaultExpanded={["src"]}
      />
    ));
    await ui.settled();
    expect(ui.text()).toContain("src");
    expect(ui.text()).toContain("main.ts");
    ui.unmount();
  });
});

describe("TriggerMenu", () => {
  test("renders its input", async () => {
    const ui = render(() => (
      <TriggerMenu
        triggers={[{ char: "@", items: [{ value: "ada", label: "Ada" }] }]}
      >
        <TriggerMenuInput aria-label="Mention" />
      </TriggerMenu>
    ));
    await ui.settled();
    expect(ui.query("textarea") !== null).toBe(true);
    ui.unmount();
  });
});

describe("Waterfall", () => {
  test("renders one row per span", async () => {
    const ui = render(() => (
      <Waterfall
        items={[
          { value: "a", label: "Request", start: 0, duration: 100 },
          { value: "b", label: "Parse", start: 10, duration: 20 },
        ]}
      />
    ));
    await ui.settled();
    expect(ui.text()).toContain("Request");
    expect(ui.text()).toContain("Parse");
    ui.unmount();
  });
});

describe("foundation re-exports", () => {
  test("color parses and formats", () => {
    const red = parseColor("red");
    expect(red && formatColor(red, "hex")).toBe("#ff0000");
  });

  test("gesture springs settle", () => {
    expect(solveSpring(0.5, 1, 1, 0).position(0)).toBe(1);
    expect(typeof sectorOf(1, 0, 4)).toBe("number");
  });

  test("history records entries for an agent", async () => {
    const agent = createAgent();
    const history = createHistory(agent);
    expect(history.entries()).toEqual([]);
  });

  test("image module loads", () => {
    expect(typeof cropImage).toBe("function");
  });

  test("text matching marks a hit", () => {
    expect(fuzzyScore("Ada", "ad")).toBeGreaterThan(0);
    const ranges = matchRanges("Ada Lovelace", "love", "contains");
    const segments = matchSegments("Ada Lovelace", ranges);
    expect(segments.some((part) => part.match)).toBe(true);
  });

  test("observe module loads", () => {
    expect(typeof observe).toBe("function");
  });

  test("editor context defaults to no editor", async () => {
    const ui = render(() => <EditorProbe />);
    await ui.settled();
    expect(ui.text()).toContain("true");
    ui.unmount();
  });

  test("sheet header renders in place", async () => {
    const ui = render(() => <>{inSheetHeader(() => <i>here</i>, () => null)}</>);
    await ui.settled();
    expect(ui.text()).toContain("here");
    ui.unmount();
  });

  test("agent module loads", () => {
    expect(typeof createAgent).toBe("function");
  });
});

function EditorProbe() {
  // Reading a function-valued context calls it, so the default reads as no
  // editor directly.
  const editor = context(EditorContext)();
  return <>{String(editor === undefined)}</>;
}
