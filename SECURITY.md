# Security policy

## Supported versions

The latest version published to the Chrome Web Store is the only one that gets
fixes. Chrome updates installed copies on its own, so the newest version is
what almost everyone is running.

## Reporting a vulnerability

Please report privately rather than in a public issue: use
[**Report a vulnerability**](https://github.com/fullmamasha/plop/security/advisories/new)
on this repository. That opens a private advisory only the maintainer can see.

It helps to include what a page or extension would have to do to trigger it,
what it gets as a result, and the Chrome version you saw it on. A proof of
concept page is ideal but not required.

You can expect an acknowledgement within a week. Once a fix is released to the
Chrome Web Store, the advisory is published with credit, unless you would
rather stay anonymous.

## What is in scope

Plop runs on every http and https page and can read the clipboard, so the
interesting cases are the ones where a page gets something it should not:

- a website reading pinned files, recents, clipboard content or settings;
- a website causing Plop to hand a file somewhere the user did not choose;
- Plop's own interface being spoofed or driven by the page it is running on;
- anything that escapes the extension's isolation, or turns Plop's messaging
  into something a page can call.

## What is not

- The clipboard being readable by Plop itself. That is what it is for, and it
  is asked for at install time.
- A site failing to accept a file Plop delivers. That is a compatibility bug;
  a normal issue is the right place for it.
- Reports produced by a scanner with no explanation of the actual impact.
