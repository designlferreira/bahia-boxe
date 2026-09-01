import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[70] bg-black/62 backdrop-blur-[3px] data-[state=open]:animate-bb-up", className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

// None of this app's Sheet openers are Radix <Dialog.Trigger>s (they're plain buttons driving
// external open/onOpenChange state), so Radix has nothing to auto-restore focus to on close.
// A global pointerdown listener tracks "whatever was most recently pressed to open something" —
// read inside onOpenAutoFocus (fires exactly once per real open, unlike the component's own
// render, which can run many times while closed as parents re-render).
let lastPointerDownTarget: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[role="dialog"]')) return; // clicks inside an already-open panel aren't a new trigger
      lastPointerDownTarget = el.closest("button, a, [tabindex]") as HTMLElement | null;
    },
    true,
  );
}

// Drag tuning — matches the spec's acceptance criteria.
const CLOSE_DISTANCE_RATIO = 0.25; // drag past 25% of panel height closes it
const CLOSE_VELOCITY = 0.55; // px/ms flick speed that closes regardless of distance
const DRAG_START_SLOP = 4; // px of downward movement before a content-area drag "takes over"
const SPRING_MS = 220;
const THROW_MS = 180;

/** Nearest scrollable ancestor of `el`, up to (and including) `root`. */
function findScrollParent(el: Element | null, root: Element | null): Element | null {
  let node = el;
  while (node && node !== root?.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) return node;
    if (node === root) break;
    node = node.parentElement;
  }
  return root;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, forwardedRef) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // Re-captured on every real open via onOpenAutoFocus — this component instance persists
  // across many open/close cycles (Radix's Presence only unmounts the *Content DOM node*
  // while closed, not this wrapper), so a plain useRef(initialValue) would only ever see
  // whatever was focused the very first time this sheet ever opened.
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const drag = React.useRef({
    active: false, // currently translating the panel
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    panelHeight: 0,
    pointerId: null as number | null,
  });

  React.useImperativeHandle(forwardedRef, () => panelRef.current as HTMLDivElement);

  // !important: CSS animations (the bb-toast/bb-up entrance) outrank plain inline styles in the
  // cascade for as long as their fill-mode holds the final keyframe — a plain style.transform
  // update here would be silently overridden by the animation's own `transform: none`/`opacity: 1`.
  // !important inline styles are the one thing that still wins.
  function setDragOffset(y: number, withTransition: boolean) {
    const panel = panelRef.current;
    if (!panel) return;
    if (y > 0) {
      panel.style.setProperty("transition", withTransition ? `transform ${SPRING_MS}ms cubic-bezier(.22,1,.36,1)` : "none", "important");
      panel.style.setProperty("transform", `translateY(${y}px)`, "important");
    } else {
      panel.style.removeProperty("transition");
      panel.style.removeProperty("transform");
    }
    const overlay = overlayRef.current;
    if (overlay) {
      if (y > 0) {
        const ratio = Math.min(1, y / Math.max(1, drag.current.panelHeight));
        overlay.style.setProperty("transition", withTransition ? `opacity ${SPRING_MS}ms ease` : "none", "important");
        overlay.style.setProperty("opacity", String(1 - ratio), "important");
      } else {
        overlay.style.removeProperty("transition");
        overlay.style.removeProperty("opacity");
      }
    }
  }

  function resetDrag() {
    drag.current.active = false;
    drag.current.pointerId = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const handle = (e.target as Element).closest("[data-sheet-handle]");
    drag.current.startY = e.clientY;
    drag.current.lastY = e.clientY;
    drag.current.lastT = performance.now();
    drag.current.velocity = 0;
    drag.current.panelHeight = panelRef.current?.offsetHeight ?? 1;
    drag.current.pointerId = e.pointerId;
    drag.current.active = !!handle;
    if (handle) {
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (drag.current.pointerId !== e.pointerId) return;
    const dy = e.clientY - drag.current.startY;

    if (!drag.current.active) {
      // Only a content-area drag can still "take over" — and only once the
      // scrollable region under the pointer is already at its top edge.
      if (dy <= DRAG_START_SLOP) return;
      const scrollParent = findScrollParent(e.target as Element, panelRef.current);
      if (scrollParent && scrollParent.scrollTop > 0) return;
      drag.current.active = true;
      panelRef.current?.setPointerCapture(e.pointerId);
    }

    e.preventDefault();
    setDragOffset(Math.max(0, dy), false);

    const now = performance.now();
    const dt = now - drag.current.lastT;
    if (dt > 0) drag.current.velocity = (e.clientY - drag.current.lastY) / dt;
    drag.current.lastY = e.clientY;
    drag.current.lastT = now;
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current.pointerId !== e.pointerId) return;
    if (!drag.current.active) {
      resetDrag();
      return;
    }
    const dy = Math.max(0, e.clientY - drag.current.startY);
    const ratio = dy / Math.max(1, drag.current.panelHeight);
    const shouldClose = ratio > CLOSE_DISTANCE_RATIO || drag.current.velocity > CLOSE_VELOCITY;

    if (shouldClose) {
      setDragOffset(drag.current.panelHeight, true);
      if (overlayRef.current) {
        overlayRef.current.style.setProperty("transition", `opacity ${THROW_MS}ms ease`, "important");
        overlayRef.current.style.setProperty("opacity", "0", "important");
      }
      window.setTimeout(() => closeRef.current?.click(), THROW_MS);
    } else {
      setDragOffset(0, true);
    }
    resetDrag();
  }

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay ref={overlayRef} />
      <DialogPrimitive.Content
        ref={panelRef}
        aria-modal="true"
        onOpenAutoFocus={() => {
          triggerRef.current = lastPointerDownTarget;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef.current?.focus();
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[74] max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-border bg-[#161616] px-5 pt-2 pb-8 data-[state=open]:animate-bb-toast",
          className,
        )}
        {...props}
      >
        <div
          data-sheet-handle
          role="presentation"
          aria-hidden
          className="mx-auto mb-2 flex h-11 w-16 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="h-1 w-[38px] rounded-full bg-muted" />
        </div>
        {children}
        <DialogPrimitive.Close ref={closeRef} className="hidden" tabIndex={-1} aria-hidden />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("font-display text-2xl tracking-wide text-foreground", className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle };
