/**
 * The Plop settings surface: 360px, the same glass family as the widget, shown
 * as an internal view rather than a second floating popover.
 *
 * Presentational only — it reports intent through callbacks and never writes
 * to storage itself.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icon";
import { ScrollBar } from "./scrollbar";
import { useDismiss } from "./presence";
import {
  formatSize,
  glyphFor,
  splitName,
  type PlopItem,
  type PlopSettings,
  type PlopTheme,
} from "../types";

/** What the manual "Check for updates" action is currently reporting. */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "throttled" }
  | { kind: "available"; version: string };

export type SettingsProps = {
  version: string;
  /** Result of the last explicit update check. */
  update?: UpdateState;
  /** The update is being applied: the CTA becomes a progress state. */
  installing?: boolean;
  onCheckUpdate?: () => void;
  settings: PlopSettings;
  /** Host shown in the per-site row, e.g. "figma.com". */
  site?: string;
  pinned: PlopItem[];
  pinnedLimit: number;
  /** Resolved theme, so the segmented control can show what is actually on. */
  theme: PlopTheme;
  onToggleGlobal: (on: boolean) => void;
  onToggleSite: (on: boolean) => void;
  onSetTheme: (theme: PlopTheme) => void;
  onAddPin: () => void;
  onRemovePin: (item: PlopItem) => void;
  onUpdate: () => void;
  onClose: () => void;
  /** Plays the dismissal animation instead of the reveal. */
  exiting?: boolean;
};

export function SettingsPanel({
  version,
  update = { kind: "idle" },
  installing = false,
  onCheckUpdate,
  settings,
  site,
  pinned,
  pinnedLimit,
  theme,
  onToggleGlobal,
  onToggleSite,
  onSetTheme,
  onAddPin,
  onRemovePin,
  onUpdate,
  onClose,
  exiting = false,
}: SettingsProps) {
  const siteEnabled = site ? settings.siteRules[site] !== false : true;
  const scroll = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  // The bar must not run behind the sticky edges, and the footer changes
  // height when the update CTA appears, so both are measured rather than
  // guessed.
  const edges = useStickyEdges(header, footer);
  useDismiss(surface, onClose, !exiting);
  // Rows stay mounted for the length of their exit animation, so the list
  // collapses in the same motion rather than snapping shut first.
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());

  const removePin = (item: PlopItem) => {
    setRemoving((current) => new Set(current).add(item.id));
    setTimeout(() => {
      onRemovePin(item);
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }, ROW_EXIT_MS);
  };

  return (
    <div
      class={`plop-surface plop-panel${exiting ? " plop-surface--exit" : ""}`}
      ref={surface}
      role="dialog"
      aria-label="Plop settings"
    >
      <div class="plop-panel__scrollarea">
      <div class="plop-panel__scroll" ref={scroll}>
      <div class="plop-panel__header" ref={header}>
        <div class="plop-brand">
          <Icon name="logo" size={40} class="plop-brand__logo" />
          <div class="plop-brand__text">
            <span class="plop-brand__name">Plop</span>
            <span class="plop-brand__kicker">SETTINGS</span>
          </div>
        </div>

        <div class="plop-pill plop-pill--group plop-edge plop-edge--always">
          <button
            type="button"
            class="plop-iconbtn plop-iconbtn--danger"
            aria-label="Close settings"
            onClick={onClose}
          >
            <Icon name="close" size={22} />
          </button>
        </div>
      </div>

      <div class="plop-group plop-group--settings">
        <div class="plop-group__head">
          <span class="plop-group__title">Version</span>
          <span class="plop-version">
            <span
              class={
                update.kind === "available"
                  ? "plop-version__dot plop-version__dot--stale"
                  : "plop-version__dot"
              }
            />
            {version}
          </span>
        </div>

        {update.kind === "available" && (
          <div class="plop-group__head">
            <span class="plop-group__title">New version</span>
            <span class="plop-version">{update.version}</span>
          </div>
        )}

        {/* Chrome checks for updates on its own schedule. This is only ever
            run from an explicit press, never on open and never on a timer. */}
        <button
          type="button"
          class="plop-check"
          disabled={update.kind === "checking" || !onCheckUpdate}
          onClick={onCheckUpdate}
        >
          {update.kind === "checking"
            ? "Checking..."
            : update.kind === "current"
              ? "Up to date"
              : update.kind === "throttled"
                ? "Checked recently. Updates install automatically."
                : "Check for updates"}
        </button>

        <ToggleRow
          title="Enable Plop"
          description="Turn Plop on or off everywhere."
          checked={settings.enabledGlobally}
          onChange={onToggleGlobal}
        />

        <ToggleRow
          title={site ? `Enable on ${site}` : "Enable on this site"}
          description={
            site
              ? `Allow Plop to work on ${site}.`
              : "Allow Plop to work on this website."
          }
          checked={siteEnabled}
          // No site means a page Plop does not run on: nothing to switch.
          disabled={!settings.enabledGlobally || !site}
          onChange={onToggleSite}
        />

        <div
          class="plop-segmented"
          role="radiogroup"
          aria-label="Theme"
          style={{ "--index": theme === "light" ? 1 : 0 }}
        >
          <span class="plop-segmented__indicator" aria-hidden="true" />
          <ThemeOption
            icon="moon"
            label="Dark"
            value="dark"
            current={theme}
            onSelect={onSetTheme}
          />
          <ThemeOption
            icon="sun"
            label="Light"
            value="light"
            current={theme}
            onSelect={onSetTheme}
          />
        </div>
      </div>

      <div class="plop-group plop-group--pinned">
        <div class="plop-group__head">
          <span class="plop-group__title">
            Pinned files
            <span class="plop-group__count">
              ({pinned.length}/{pinnedLimit})
            </span>
          </span>
          <button
            type="button"
            class="plop-btn-add plop-edge plop-edge--always"
            onClick={onAddPin}
            disabled={pinned.length >= pinnedLimit}
          >
            <Icon name="plus" size={16} />
            Add
          </button>
        </div>

        {pinned.map((item) => (
          <PinnedRow
            key={item.id}
            item={item}
            removing={removing.has(item.id)}
            onRemove={removePin}
          />
        ))}
      </div>

      {/* Sticks to the bottom of the scrollport, so the update CTA is always
          reachable while the list scrolls underneath it. */}
      <div class="plop-group plop-group--footer" ref={footer}>
        {/* Only ever shown when a real update is waiting to be applied. */}
        {update.kind === "available" && (
          <button
            type="button"
            class="plop-btn-primary plop-edge plop-edge--always plop-edge--on-accent"
            aria-busy={installing || undefined}
            disabled={installing}
            onClick={onUpdate}
          >
            {installing ? (
              <>
                <span class="plop-spinner" aria-hidden="true" />
                Installing Update
              </>
            ) : (
              "Update Plop"
            )}
          </button>
        )}
        <p class="plop-byline">
          {"by "}
          <a href="https://artems.design" target="_blank" rel="noreferrer">
            Artem Udovichenko
          </a>
        </p>
      </div>
      </div>
      <ScrollBar
        target={scroll}
        axis="y"
        watch={pinned.length}
        inset={edges}
        label="Scroll settings"
      />
      </div>
    </div>
  );
}

/** Kept in step with the `plop-row-out` keyframes in plop.css. */
const ROW_EXIT_MS = 220;

/** Heights of the two sticky edges, so the scrollbar can sit between them. */
function useStickyEdges(
  top: { current: HTMLElement | null },
  bottom: { current: HTMLElement | null }
): [number, number] {
  const [edges, setEdges] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    const measure = () =>
      setEdges([
        top.current?.offsetHeight ?? 0,
        bottom.current?.offsetHeight ?? 0,
      ]);
    measure();
    const observer = new ResizeObserver(measure);
    if (top.current) observer.observe(top.current);
    if (bottom.current) observer.observe(bottom.current);
    return () => observer.disconnect();
  });

  return edges;
}

/* ---------------------------------------------------------------------- */

/**
 * Keeps the press alive if the pointer slides off the control. Throws for a
 * pointer id the element never saw, which is not worth failing the press over.
 */
function capturePointer(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* no capture: the press still works, it just ends if the pointer leaves */
  }
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div class="plop-row plop-row--setting" aria-disabled={disabled || undefined}>
      <div class="plop-row__copy">
        <span class="plop-row__title">{title}</span>
        <span class="plop-row__desc">{description}</span>
      </div>
      <Switch checked={checked} disabled={disabled} label={title} onChange={onChange} />
    </div>
  );
}

/**
 * iOS-style switch: holding it stretches the knob toward the end it is about
 * to travel to and turns it glassy; releasing snaps it across. The hold state
 * lives here rather than in `:active` so it also survives the pointer leaving
 * the track mid-press.
 */
function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  const [holding, setHolding] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      class={holding ? "plop-switch is-holding" : "plop-switch"}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        capturePointer(event.currentTarget, event.pointerId);
        setHolding(true);
      }}
      onPointerUp={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setHolding(true);
      }}
      onKeyUp={() => setHolding(false)}
      onBlur={() => setHolding(false)}
      onClick={() => onChange(!checked)}
    >
      <span class="plop-switch__knob" />
    </button>
  );
}

function ThemeOption({
  icon,
  label,
  value,
  current,
  onSelect,
}: {
  icon: "moon" | "sun";
  label: string;
  value: PlopTheme;
  current: PlopTheme;
  onSelect: (theme: PlopTheme) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      class="plop-segmented__option"
      aria-checked={current === value}
      onClick={() => onSelect(value)}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}

function PinnedRow({
  item,
  removing,
  onRemove,
}: {
  item: PlopItem;
  removing: boolean;
  onRemove: (item: PlopItem) => void;
}) {
  const isText = item.kind === "text";
  const [stem, ext] = item.kind === "file" ? splitName(item.name) : ["", ""];
  const classes = [
    "plop-row",
    "plop-row--file",
    isText && "plop-row--text",
    removing && "plop-row--removing",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={classes}>
      {/* Every row keeps a preview slot: an image when there is one, a glyph
          when there is not. An empty square reads as a broken image. */}
      <span class="plop-row__thumb">
        {item.kind === "file" && item.preview ? (
          <img src={item.preview} alt="" />
        ) : (
          <Icon name={glyphFor(item)} size={22} class="plop-row__thumb-glyph" />
        )}
      </span>

      <div class="plop-row__copy">
        {item.kind === "file" ? (
          <>
            <span class="plop-row__title plop-row__title--file">
              {stem}
              <span class="plop-row__ext">{ext}</span>
            </span>
            <span class="plop-row__meta">{formatSize(item.size)}</span>
          </>
        ) : (
          <>
            <span class="plop-row__excerpt">{item.content}</span>
            <span class="plop-row__meta">
              Copied text | {item.content.length} symbols
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        class="plop-row__delete"
        aria-label="Remove from pinned files"
        onClick={() => onRemove(item)}
      >
        <Icon name="trash" size={28} />
      </button>
    </div>
  );
}
