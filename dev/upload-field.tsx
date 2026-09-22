/**
 * Stands in for a host page's upload control, so the widget can be tested
 * against something that behaves like the real thing.
 *
 * It is a genuine `<input type="file">` driven by a link-style button — the
 * hidden-input-behind-a-button pattern Plop has to cope with in the wild —
 * and it accepts a dragged Plop card. Dropping only works for an item that
 * carries a real `File`; that is the constraint the extension will live with
 * too, so the field says so rather than pretending.
 */

import { useRef, useState } from "preact/hooks";
import { fillFileInput, type PlopItem } from "../src/types";

export function UploadField() {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const report = () => {
    const files = input.current?.files;
    setValue(files?.length ? [...files].map((f) => f.name).join(", ") : null);
  };

  /** Called by the page when a Plop card is released over this field. */
  const accept = (item: PlopItem) => {
    if (item.kind === "file" && item.file && input.current) {
      fillFileInput(input.current, [item.file]);
      report();
      setNote(null);
      return;
    }
    setNote(
      item.kind === "text"
        ? "That item is clipboard text — it has no file to hand over."
        : "That item is a fixture with no real file behind it. Pick one from your PC first, then drag that."
    );
  };

  return (
    <div
      class="upload"
      data-plop-dropzone
      ref={(el) => {
        // The drag layer finds the drop target by DOM, so the handler is
        // parked on the element rather than passed through props.
        if (el) (el as HTMLElement & { plopAccept?: typeof accept }).plopAccept = accept;
      }}
    >
      <p class="upload__label">Upload a file</p>

      <input
        ref={input}
        id="test-upload"
        class="upload__input"
        type="file"
        onChange={report}
      />

      <p class="upload__row">
        <button
          type="button"
          class="upload__link"
          onClick={() => input.current?.click()}
        >
          Choose a file
        </button>
        <span class="upload__value">{value ?? "No file selected"}</span>
      </p>

      {note && <p class="upload__note">{note}</p>}
    </div>
  );
}
