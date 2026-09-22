/**
 * The main Plop surface: the popover that replaces the moment a site asks for
 * a file. 440px wide, three labelled sections on one horizontal rail —
 * Clipboard, Pinned Files, Recents — plus the handoff to the native picker.
 *
 * This module is presentational. It receives items and callbacks; it does not
 * read the clipboard, touch storage, or know a host page exists.
 */

import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "./icon";
import { ScrollBar } from "./scrollbar";
import { DragGhost, useCardDrag, type DropHandler } from "./drag";
import { useDismiss } from "./presence";
import { glyphFor, splitName, type PlopItem } from "../types";

/** The paste chord, as the platform writes it. */
function pasteShortcut(): string {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? "⌘V" : "Ctrl+V";
}

/**
 * Focuses an element once, when it mounts. A module-level function on
 * purpose: Preact re-runs a ref whenever its identity changes, so an inline
 * arrow would grab focus again on every render, including the one that closes
 * Plop after it has put the caret back in the page's field.
 */
const focusOnMount = (el: HTMLElement | null) => el?.focus({ preventScroll: true });

/** Collapse timing, kept in step with the `plop-fold` keyframes in plop.css. */
const FOLD_MS = 220;
const FOLD_STAGGER_MS = 24;

export type WidgetProps = {
  clipboard: PlopItem[];
  pinned: PlopItem[];
  recents: PlopItem[];
  onPick: (item: PlopItem) => void;
  /** The item was carried out of the widget and released on a drop target. */
  onDrop?: DropHandler;
  onTogglePin: (item: PlopItem) => void;
  onBrowse: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  /** Ids currently pinned, so a card can show the filled pin. */
  pinnedIds?: ReadonlySet<string>;
  /** Plays the dismissal animation instead of the reveal. */
  exiting?: boolean;
  /**
   * Plop could not read anything from the clipboard. The section still shows,
   * with a slot inviting a paste — the one route that reaches file types the
   * clipboard API cannot see.
   */
  clipboardEmpty?: boolean;
  /** Shown under the paste hint, e.g. a permission refusal. */
  clipboardNote?: string;
  /** Why the last pick did not go through, shown over the foot of the rail. */
  note?: string;
};

export function PlopWidget({
  clipboard,
  pinned,
  recents,
  onPick,
  onDrop,
  onTogglePin,
  onBrowse,
  onOpenSettings,
  onClose,
  pinnedIds,
  exiting = false,
  clipboardEmpty = false,
  clipboardNote,
  note,
}: WidgetProps) {
  const surface = useRef<HTMLDivElement>(null);
  // Pressing anywhere off the widget, or Escape, puts it away.
  useDismiss(surface, onClose, !exiting);

  const dragger = useCardDrag(
    (item, target, taken) =>
      onDrop ? onDrop(item, target, taken) : taken || onPick(item)
  );
  // The pinned section shows a 2x2 cluster until it is opened out into the
  // full run of cards. `folding` keeps the run mounted for the length of the
  // collapse animation; `everOpened` stops the cluster animating on first
  // paint, when it has not travelled from anywhere.
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [folding, setFolding] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const openPinned = () => {
    setEverOpened(true);
    setPinnedOpen(true);
  };

  const collapsePinned = () => {
    setFolding(true);
    setTimeout(() => {
      setFolding(false);
      setPinnedOpen(false);
    }, FOLD_MS + pinned.length * FOLD_STAGGER_MS);
  };

  const unfoldClass = folding ? "plop-fold" : "plop-unfold";

  const cardProps = (item: PlopItem) => ({
    item,
    pinned: pinnedIds?.has(item.id) ?? false,
    onPick,
    onTogglePin,
    onDragStart: dragger.start,
    dragging: dragger.isDragging(item),
  });

  return (
    <>
    <div
      class={`plop-surface plop-widget${exiting ? " plop-surface--exit" : ""}`}
      ref={surface}
      role="dialog"
      aria-label="Plop"
    >
      <div class="plop-surface__glass" />

      <div class="plop-widget__header">
        <button
          type="button"
          class="plop-pill plop-pill--action plop-edge plop-edge--always"
          onClick={onBrowse}
        >
          <Icon name="upload" size={22} />
          Select from PC
        </button>

        <div class="plop-pill plop-pill--group plop-edge plop-edge--always">
          <button
            type="button"
            class="plop-iconbtn"
            aria-label="Plop settings"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={22} />
          </button>
          <button
            type="button"
            class="plop-iconbtn plop-iconbtn--danger"
            aria-label="Close Plop"
            onClick={onClose}
          >
            <Icon name="close" size={22} />
          </button>
        </div>
      </div>

      <div class="plop-widget__body">
        <Rail>
          {(clipboard.length > 0 || clipboardEmpty) && (
            <Section icon="clipboard" label="Clipboard">
              {clipboard.length > 0 ? (
                clipboard.map((item) => (
                  <Card key={item.id} {...cardProps(item)} />
                ))
              ) : (
                // A button, not a panel: clicking it moves focus into the
                // page, which is what a paste needs in order to land here at
                // all. Without that the chord can go to the browser chrome.
                <button
                  type="button"
                  class="plop-empty-card"
                  title={clipboardNote}
                  ref={focusOnMount}
                >
                  <span class="plop-empty-card__key">{pasteShortcut()}</span>
                  <span class="plop-empty-card__hint">To paste file</span>
                </button>
              )}
            </Section>
          )}

          {/* A section and the rule before it come and go together: an empty
              heading, or a divider with nothing after it, is just debris. */}
          {(clipboard.length > 0 || clipboardEmpty) && pinned.length > 0 && (
            <Divider />
          )}

          {pinned.length > 0 && (
          <Section icon="pin" label="Pinned Files">
            {pinnedOpen ? (
              <div
                class="plop-section__items"
                style={{ "--fold-count": pinned.length + 1 }}
              >
                <button
                  type="button"
                  class={`plop-collapse ${unfoldClass}`}
                  aria-label="Collapse pinned files"
                  aria-expanded
                  onClick={collapsePinned}
                >
                  <Icon name="caretLeft" size={18} />
                </button>
                {pinned.map((item, i) => (
                  <Card
                    key={item.id}
                    class={unfoldClass}
                    index={i + 1}
                    {...cardProps(item)}
                  />
                ))}
              </div>
            ) : (
              <PinnedCluster
                items={pinned}
                animate={everOpened}
                onOpen={openPinned}
              />
            )}
          </Section>
          )}

          {(clipboard.length > 0 || clipboardEmpty || pinned.length > 0) &&
            recents.length > 0 && <Divider />}

          {recents.length > 0 && (
            <Section icon="history" label="Recents">
              {recents.map((item) => (
                <Card key={item.id} {...cardProps(item)} />
              ))}
            </Section>
          )}

          {!clipboardEmpty &&
            clipboard.length + pinned.length + recents.length === 0 && (
            <p class="plop-rail__empty">
              Nothing to hand over yet — copy something, or use Select from PC.
            </p>
          )}
        </Rail>
      </div>

      {note && (
        <p class="plop-widget__note" role="status">
          {note}
        </p>
      )}
    </div>

    <DragGhost drag={dragger.drag}>
      {dragger.drag && (
        <Card
          item={dragger.drag.item}
          pinned={pinnedIds?.has(dragger.drag.item.id) ?? false}
          onPick={() => {}}
          onTogglePin={() => {}}
        />
      )}
    </DragGhost>
    </>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * The horizontal rail plus its own scrollbar. The native bar is hidden and a
 * token-styled thumb tracks scroll position — and can be grabbed to scroll the
 * rail, which is the whole point of replacing the native one.
 */
function Rail({ children }: { children: ComponentChildren }) {
  const rail = useRef<HTMLDivElement>(null);
  return (
    <>
      <div class="plop-rail" ref={rail}>
        {children}
      </div>
      <div class="plop-rail__bar">
        <ScrollBar target={rail} axis="x" watch={children} label="Scroll items" />
      </div>
    </>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: "clipboard" | "pin" | "history";
  label: string;
  children: ComponentChildren;
}) {
  return (
    <div class="plop-section">
      <div class="plop-section__label">
        <Icon name={icon} size={16} />
        {label}
      </div>
      <div class="plop-section__items">{children}</div>
    </div>
  );
}

function Divider() {
  return <div class="plop-rail__divider" role="separator" />;
}

function Card({
  item,
  pinned,
  onPick,
  onTogglePin,
  onDragStart,
  dragging = false,
  class: className,
  index = 0,
}: {
  item: PlopItem;
  pinned: boolean;
  onPick: (item: PlopItem) => void;
  onTogglePin: (item: PlopItem) => void;
  /** Begins a carry-out gesture; absent on the ghost copy. */
  onDragStart?: (item: PlopItem, event: PointerEvent) => void;
  /** This card is the one currently being carried, so it dims in place. */
  dragging?: boolean;
  /** Extra classes, e.g. the unfold animation when the pinned run opens. */
  class?: string;
  /** Position in a staggered reveal. */
  index?: number;
}) {
  const label = item.kind === "file" ? item.name : item.content;
  // Three shapes of card: a thumbnail, a block of copied text, or a file with
  // no preview to show. They differ in what fills the card above the label.
  const kind: "text" | "image" | "file" =
    item.kind === "text" ? "text" : item.preview ? "image" : "file";
  const [stem, ext] = item.kind === "file" ? splitName(item.name) : ["", ""];

  return (
    <div
      class={`plop-card plop-edge plop-edge--state${
        kind === "image" ? "" : " plop-card--flat"
      }${dragging ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--i": index }}
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      draggable={false}
      onPointerDown={(event) => {
        // The pin is a button inside the card; pressing it must not start a
        // carry-out gesture.
        if ((event.target as HTMLElement).closest(".plop-card__pin")) return;
        onDragStart?.(item, event);
      }}
      onClick={(event) => {
        // The pin sits inside the card; pinning must never also upload.
        if ((event.target as HTMLElement).closest(".plop-card__pin")) return;
        onPick(item);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(item);
        }
      }}
    >
      {item.kind === "file" && item.preview && (
        <img class="plop-card__image" src={item.preview} alt="" />
      )}

      {kind === "text" && (
        <div class="plop-card__body">
          <span class="plop-card__excerpt">{label}</span>
        </div>
      )}

      {kind === "file" && (
        <div class="plop-card__glyph">
          <Icon name={glyphFor(item)} size={36} />
        </div>
      )}

      <div class="plop-card__top">
        <button
          type="button"
          class="plop-card__pin"
          aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          aria-pressed={pinned}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin(item);
          }}
        >
          <Icon name={pinned ? "pinOn" : "pinOff"} size={24} />
        </button>
      </div>

      <div class="plop-card__plate">
        <span class="plop-card__name">
          {item.kind === "text" ? (
            <span class="plop-card__stem">Text</span>
          ) : (
            <>
              <span class="plop-card__stem">{stem}</span>
              {ext && <span class="plop-card__ext">{ext}</span>}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Pinned files collapse into one card-sized 2×2 cluster of the four most
 * recent pins; opening it unfolds the section into the full run of cards.
 */
function PinnedCluster({
  items,
  animate,
  onOpen,
}: {
  items: PlopItem[];
  /** Only animate when the cluster is folding back from the open run. */
  animate: boolean;
  onOpen: () => void;
}) {
  const tiles = items.slice(0, 4);
  return (
    <button
      type="button"
      class={`plop-cluster plop-edge plop-edge--state${animate ? " plop-unfold" : ""}`}
      aria-label={`Pinned files, ${items.length} items`}
      aria-expanded={false}
      onClick={onOpen}
    >
      {tiles.map((item) => (
        <span key={item.id} class="plop-cluster__tile">
          {item.kind === "file" && item.preview ? (
            <img src={item.preview} alt="" />
          ) : (
            // A pin with no thumbnail still needs to read as something: a
            // blank tile looks like a failed image.
            <Icon name={glyphFor(item)} size={20} class="plop-cluster__glyph" />
          )}
        </span>
      ))}
      {Array.from({ length: Math.max(0, 4 - tiles.length) }, (_, i) => (
        <span key={`empty-${i}`} class="plop-cluster__tile" />
      ))}
    </button>
  );
}
