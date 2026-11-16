// Overlay host (port of `@ui-sdk/solid`'s `overlays`).
//
// Renders what `toast()` and `confirm()` open, from anywhere in the app.
// Confirm entries render as alert dialogs, inline where the host sits.
// Toaster entries render the toaster's region, inline where the host sits,
// until the app places a region of its own for that toaster.
import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog";
import type { Toaster } from "@ui-sdk/core/toast";
import {
  overlays as sharedOverlays,
  type OverlayEntry,
  type Overlays,
} from "@ui-sdk/core/overlays";
import { toasterInternals } from "@ui-sdk/core/renderer";
import { atom, untrack, watch } from "ilha";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog.tsx";
import { Region } from "./toast-parts.tsx";

/**
 * Props for `OverlayHost`.
 * @stable
 */
type OverlayHostProps = {
  /**
   * The registry it renders.
   * @defaultValue the shared `overlays`, which `toast()` and `confirm()` open into
   */
  overlays?: Overlays;
  /**
   * Props for the toast regions it renders, like `side` or `maxVisible`.
   * A toaster entry renders nothing while the app places a region of its
   * own for that toaster.
   */
  toast?: Record<string, any>;
};

/**
 * Renders what `toast()` and `confirm()` open, from anywhere in the app.
 * Mount it once, near the root. Confirm entries render as alert dialogs;
 * toaster entries render the toaster's region.
 * @stable
 */
function OverlayHost(props: OverlayHostProps) {
  const registry = () => props.overlays ?? sharedOverlays;
  // Nothing until mounted, as on the server, so the first client render
  // hydrates against the server's and the host counts itself only on the client.
  // Set from the registry's listeners, which fire from core's lifecycle,
  // cleanups and disposals included.
  const entries = atom<readonly OverlayEntry[]>([], { snapshot: false });
  watch.once(() => {
    const current = registry();
    const update = () => {
      entries.set(current.entries());
    };
    update();
    const unsubscribe = current.subscribe(update);
    const release = current.attachHost();
    return () => {
      unsubscribe();
      release();
    };
  });
  return (
    <>
      {entries().map((entry) =>
        entry.type === "toaster" ? (
          <HostedToaster
            key={entry.id}
            toaster={(entry.data as { toaster: Toaster }).toaster}
            region={props.toast}
          />
        ) : entry.type === "confirm" ? (
          <HostedConfirm
            key={entry.id}
            entry={entry.data as ConfirmEntry}
          />
        ) : null
      )}
    </>
  );
}

function HostedToaster(props: { toaster: Toaster; region?: Record<string, any> }) {
  const internals = () => toasterInternals(props.toaster);
  const placed = atom(untrack(() => internals().hasPlacedRegion()), {
    snapshot: false,
  });
  watch.once(() => {
    const update = () => {
      placed.set(internals().hasPlacedRegion());
    };
    update();
    return props.toaster.subscribe(update);
  });
  return !placed() ? (
    <Region {...props.region} toaster={props.toaster} placed={false} />
  ) : null;
}

function HostedConfirm(props: { entry: ConfirmEntry }) {
  // The alert dialog attaches the controller from its own mount, in the same
  // flush as this one, so the question opens once the flush is done. The
  // dialog may paint in a later task (Ilha mounts children after the parent's
  // setup), and opening before it attaches does nothing, so the open waits
  // until the controller is attached. The flag is core's own attached marker.
  const attached = Symbol.for("ui-sdk.controller.attached");
  watch.once(() => {
    let opening = true;
    const open = () => {
      if (!opening) {
        return;
      }
      if (
        (props.entry.controller as unknown as Record<symbol, unknown>)?.[
          attached
        ]
      ) {
        opening = false;
        props.entry.open();
      } else {
        queueMicrotask(open);
      }
    };
    queueMicrotask(open);
    return () => {
      if (!opening) {
        return;
      }
      opening = false;
      props.entry.done();
    };
  });
  const question = () => (props.entry.payload ?? {}) as Partial<ConfirmOptions>;
  return (
    <AlertDialog
      controller={props.entry.controller}
      onOpenChangeComplete={(open) => !open && props.entry.done()}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{question().title}</AlertDialogTitle>
        {question().description ? (
          <AlertDialogDescription>
            {question().description}
          </AlertDialogDescription>
        ) : null}
        <div>
          <AlertDialogClose>
            {question().cancelLabel ?? "Cancel"}
          </AlertDialogClose>
          <AlertDialogClose value="confirm">
            {question().confirmLabel ?? "Continue"}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { createOverlays, overlays } from "@ui-sdk/core/overlays";
export type { OverlayEntry, Overlays } from "@ui-sdk/core/overlays";

export { OverlayHost, type OverlayHostProps };
