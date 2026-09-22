/**
 * Icons are the vectors exported from the Figma source, normalised to
 * `fill="currentColor"` so a single file serves both themes and every state.
 * They are inlined at build time — no network, no sprite sheet, no runtime
 * fetch inside a content script.
 */

import caretLeft from "../assets/icons/caret-left.svg?raw";
import clipboard from "../assets/icons/clipboard.svg?raw";
import close from "../assets/icons/close.svg?raw";
import file from "../assets/icons/file.svg?raw";
import fileImage from "../assets/icons/file-image.svg?raw";
import fileSound from "../assets/icons/file-sound.svg?raw";
import fileVideo from "../assets/icons/file-video.svg?raw";
import history from "../assets/icons/history.svg?raw";
import moon from "../assets/icons/moon.svg?raw";
import pin from "../assets/icons/pin.svg?raw";
import pinOff from "../assets/icons/pin-off.svg?raw";
import pinOn from "../assets/icons/pin-on.svg?raw";
import plus from "../assets/icons/plus.svg?raw";
import settings from "../assets/icons/settings.svg?raw";
import sun from "../assets/icons/sun.svg?raw";
import text from "../assets/icons/text.svg?raw";
import trash from "../assets/icons/trash.svg?raw";
import upload from "../assets/icons/upload-laptop.svg?raw";
import logo from "../assets/logo.svg?raw";

export const icons = {
  caretLeft,
  clipboard,
  close,
  file,
  fileImage,
  fileSound,
  fileVideo,
  history,
  logo,
  moon,
  pin,
  pinOff,
  pinOn,
  plus,
  settings,
  sun,
  text,
  trash,
  upload,
} as const;

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  /** Rendered box in px; icons are square. */
  size: number;
  class?: string;
};

export function Icon({ name, size, class: className }: IconProps) {
  return (
    <span
      class={className ? `plop-icon ${className}` : "plop-icon"}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
