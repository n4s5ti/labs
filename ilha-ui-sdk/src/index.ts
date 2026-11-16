// ilha-ui-sdk: Ilha bindings for vercel-labs/ui headless behaviors.
//
// Tranche 1 ports the `@ui-sdk/solid` adapter (`usePrimitive`, `usePart`,
// `createParts`, …) to Ilha atoms plus these components: button, checkbox
// (and group), switch, toggle (and group), tabs, label, separator, meter
// and progress. Group A adds accordion, alert-dialog, async-options,
// autocomplete, avatar, calendar (and context), carousel, collapsible,
// color-picker, combobox and command, plus the shared controller-target and
// list-text helpers. Group B adds date, date-input, date-picker, dialog (and
// dialog-parts), drawer, field, file-input, form-inputs, hover-card,
// image-cropper, input and listbox. Group C adds menu, menubar (and
// menubar-context), navigation-menu, number, number-input, otp-input,
// overlays, pagination, password-input, popover, popup, preferences and
// radio. Group D adds agent, color, editor-context, gesture, history, image,
// number utils (in `number`), observe, rating, resizable, scroll-area,
// segmented-control (and segmented-input), select, sheet-header, shortcuts,
// slider, text-control, textarea, text-match, time-input, timeline, toast
// (and toast-parts), token-input, toolbar, tooltip, tree, trigger-menu and
// waterfall. Every module re-exports its `@ui-sdk/core` controllers
// and types, so core-driven behavior, tokens (headless — no CSS shipped) and
// aria stay identical to the Solid package; only the reactivity binding
// differs (see `primitive.ts`). Overlays render inline in place (no portal):
// content is conditionally rendered while its slot is present.
export * from "./primitive.ts";
export * from "./field-context.ts";
export * from "./toolbar-context.ts";
export * from "./accordion.tsx";
export * from "./alert-dialog.tsx";
export * from "./async-options.ts";
export * from "./autocomplete.tsx";
export * from "./avatar.tsx";
export * from "./button.tsx";
export * from "./calendar-context.ts";
export * from "./calendar.tsx";
export * from "./carousel.tsx";
export * from "./checkbox.tsx";
export * from "./collapsible.tsx";
export * from "./color-picker.tsx";
export * from "./combobox.tsx";
export * from "./command.tsx";
export * from "./controller-target.ts";
export * from "./date.ts";
export * from "./date-input.tsx";
export * from "./date-picker.tsx";
export * from "./dialog.tsx";
export * from "./dialog-parts.tsx";
export * from "./drawer.tsx";
export * from "./field.tsx";
export * from "./file-input.tsx";
export * from "./form-inputs.tsx";
export * from "./hover-card.tsx";
export * from "./image-cropper.tsx";
export * from "./input.tsx";
export * from "./list-text.tsx";
export * from "./listbox.tsx";
export * from "./label.tsx";
export * from "./menu.tsx";
export * from "./menubar.tsx";
export * from "./menubar-context.ts";
export * from "./meter.tsx";
export * from "./navigation-menu.tsx";
export * from "./number.ts";
export * from "./number-input.tsx";
export * from "./otp-input.tsx";
export * from "./overlays.tsx";
export * from "./pagination.tsx";
export * from "./password-input.tsx";
export * from "./popover.tsx";
export * from "./popup.ts";
export * from "./preferences.tsx";
export * from "./progress.tsx";
export * from "./radio.tsx";
export * from "./rating.tsx";
export * from "./resizable.tsx";
export * from "./scroll-area.tsx";
export * from "./segmented-control.tsx";
export * from "./segmented-input.tsx";
export * from "./select.tsx";
export * from "./separator.tsx";
export * from "./sheet-header.tsx";
export * from "./shortcuts.ts";
export * from "./slider.tsx";
export * from "./switch.tsx";
export * from "./tabs.tsx";
export * from "./text-control.tsx";
export * from "./text-match.ts";
export * from "./textarea.tsx";
export * from "./time-input.tsx";
export * from "./timeline.tsx";
export * from "./toast.tsx";
export * from "./toggle.tsx";
export * from "./token-input.tsx";
export * from "./toolbar.tsx";
export * from "./tooltip.tsx";
export * from "./tree.tsx";
export * from "./trigger-menu.tsx";
export * from "./waterfall.tsx";
export * from "./agent.ts";
export * from "./color.ts";
export * from "./editor-context.ts";
export * from "./gesture.ts";
export * from "./history.ts";
export * from "./image.ts";
export * from "./observe.ts";
