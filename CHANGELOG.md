# Changelog

All notable changes to Plop are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-09-22

### Fixed

- The widget's background blur did not blur the page behind it.
- A card dragged out of Plop could only be dropped on the button that opened
  it. It can now be dropped on any area of a page that accepts dropped files,
  such as an email body or an attachment zone.
- Uploading the same file or text again added another copy to recents. Plop
  now recognises it by its content and moves the existing one to the front.
  Pinning something already pinned does nothing, and pinned items no longer
  also appear in recents. Copies saved by earlier versions are merged
  automatically.

## [0.1.1] - 2026-09-22

### Fixed

- Clicking anywhere on some pages, LinkedIn among them, opened Plop. Plop now
  opens only for a click that would actually have opened a file dialog.
- Every press inside Plop closed it before the press could act, so nothing
  could be picked, pinned, dragged or opened.
- Plop opened underneath a site's own upload dialog and could not be clicked.
  It now opens above it.
- A site that opens its file dialog from script placed Plop in the corner of
  the screen. It now opens under the button that was pressed.
- The Enable on this site switch did nothing.
- The settings button in Plop did nothing. It now opens the settings.
- Pinned files were kept separately for each website and could not be seen
  from the settings. They are now shared everywhere and kept across updates.

## [0.1.0] - 2026-09-20

First release.

### Added

- Upload popover that opens in place of the system file dialog.
- Clipboard, pinned files and recent uploads on one scrollable rail.
- Paste support for file types the clipboard API cannot read, including SVG,
  PDF and Markdown.
- Drag an item out of the popover and drop it onto an upload field.
- Pinned files, kept between sessions with previews for images and type icons
  for everything else.
- Settings in the extensions menu: Plop on or off everywhere, per site, and a
  dark or light theme.
- Manual update check backed by the Chrome Web Store.
