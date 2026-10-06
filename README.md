# cc-image-view

English | [繁體中文](/README.zh-TW.md)

A Claude Code mod that lets you see the images you paste, in two places:

- **Above the prompt**: while the draft holds `[Image #n]` tags, a row of numbered thumbnails shows above it. With no tags, nothing is drawn.
- **Under sent prompts**: a prompt you sent with images gets a row of `[ img #n ]` buttons. Hover one and its thumbnail appears right under it; `⤢ Zoom` under the thumbnail, or the button itself, opens the picture in a side pane (Esc closes it). The picture itself can't be clicked: Claude Code's image element takes no presses.

https://github.com/user-attachments/assets/d673f3cf-24d4-43b7-85b0-539b95333d52

The demo is an HTML reconstruction, not a screen recording: the side pane is drawn wider than in a real terminal (about 44% of the window against about 29%), the reveal and slide timings were designed, and terminal glyphs such as `⎿` are redrawn.

### Which tags count

- **Above the prompt** only looks at the tag and the paste cache, so a typed tag whose number is still cached shows that old picture.
- **Under sent prompts** shows only pictures the transcript ties to that prompt: Claude Code stores each prompt's paste numbers in `imagePasteIds`, one per image block. A typed `[Image #1]` has no such record and never shows a picture; in a prompt that mixes a typed old tag with a new paste, only the paste shows. When two prompts read exactly the same but carry different images (say the same line typed again later), the row can't tell them apart and neither shows buttons. A prompt just sent shows its buttons once its transcript line is written, usually within a second; until the transcript confirms it, it shows none, however long that takes. If the transcript can't be read in full (a read error, or more than 4 MiB of matching rows), no sent prompt shows buttons until a read succeeds. A prompt with a missing picture gets no button for it.

### Formats and files

Claude Code's image element draws PNG only, so JPG, GIF and WebP are converted to PNG once, first frame only; other extensions are not converted. Converters are tried in order: `sips` (built into macOS), `ffmpeg` (file input only), `magick`, `convert` (256 MiB memory, 1 GiB disk), 10 seconds each; if none works the picture is not shown, and a failed source is not retried. These are programs on your machine and decode the file their own way, so they are part of what you trust when you install this mod. Only `sips` on macOS has been tested.

Converted PNGs and rescued pictures go to `<temp dir>/cc-image-view/<session id>/`. Before every write the temp dir itself must be yours, not a symlink, writable by no one else, and inside a folder others can't rename things in (closed to them, or sticky like `/tmp`); the two folders under it are then made yours and mode 700. If any of that fails nothing is written, so on a shared `CLAUDE_CODE_TMPDIR` JPG, GIF and WebP previews and rescues are simply off. Files are written under a temporary name and renamed into place. The mod does not delete them; the system's temp cleanup does.

When the paste cache is gone (a reboot cleared the temp dir), pictures of sent prompts are rescued from the transcript. Limit: the rescue reads that prompt's whole transcript line, base64 of every picture included, so a prompt over 4 MiB can't be rescued and its pictures don't show.

### What it reads and runs

- The whole draft text, every 200 ms (a poll interval, not a promise: a picture that needs converting holds that round until it is done).
- Each cached PNG, read whole with `$.fs.read(path, { as: 'bytes' })` for its size; over the engine's 4 MiB cap only the aspect ratio is lost.
- This session's transcript: `grep` scans the whole file on disk and hands the mod only the person's rows that mention `[Image #`, with every base64 blob removed, so a transcript of hundreds of MB never enters the mod's memory, though each first lookup after it grows scans it once. A result over 4 MiB counts as a failed read. A full row is read only to rescue a picture.
- `~/.claude/settings.json` (or the one under `CLAUDE_CONFIG_DIR`), once at start, for the language.

It makes no network requests and calls no model. External commands: `id -u` (to build the default temp dir when `CLAUDE_CODE_TMPDIR` is unset), `sh` / `mkdir` / `chmod` (the private folder), `grep` / `sed` (the transcript), `base64` (rescues), `mv` (renaming finished files), and the converters above. Paths and message ids are passed as arguments, never spliced into shell code.

It takes over three components: the band above the prompt (AbovePrompt), sent prompts (UserMessage, only to add buttons when pictures are bound, otherwise passed through), and its own zoom pane. Everything else, and every non-terminal surface, is left to the existing chain.

### Language

The UI comes in English and Traditional Chinese. The default `auto` follows the `language` in Claude Code's `settings.json`, then `LC_ALL` / `LANG`, and falls back to English; any Chinese shows Traditional Chinese. Only the user-level `~/.claude/settings.json` (or the one under `CLAUDE_CONFIG_DIR`) is read, not project settings or `--settings`. To pin a language, open `/config`, find this plugin's Language, and pick `en` or `zh-TW`.

### Install

```bash
claude plugin marketplace add GGGODLIN/cc-mod-image-view
claude plugin install cc-image-view@cc-mod-image-view --scope user
```

Sessions started after the install load it. Needs Claude Code 2.1.287 or later (checked against the 2.1.290 types), macOS or Linux, and a terminal with kitty graphics (Ghostty, kitty); other terminals show the alt text instead of pictures. Under Herdr, Claude Code 2.1.288 reads the terminal name `libghostty` as no kitty graphics; set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` for Herdr shells, for example in your interactive shell's startup file:

```bash
if [[ "${HERDR_ENV:-}" == "1" ]]; then
  export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
fi
```

Sessions already open don't pick up the new variable; start a new one.

### Tested

On Herdr (macOS) only; no promise for other terminals or later Claude Code versions.

- Above the prompt: Claude Code 2.1.288; JPG previews on 2.1.291.
- Under sent prompts: 2.1.291 with simulated mouse events: three pictures mixed with text (one JPG), typed fake tags, a typed old tag next to a new paste, a typed copy of a real prompt, `--resume`, the button row staying put on hover, switching the zoom pane, and a rescue after the whole paste cache was hidden. The Chinese UI was checked live; the English UI by tests only.
- Not tested: pasting from the clipboard with ctrl+v (only pasted file paths), keyboard-only use of the buttons, fullscreen mode, very long conversations, converters on Linux.

### Credits

Adapted and maintained by gggodlin from [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view/tree/12795b62f1c17f4b36c980e33672fbdff3a6731a) at commit `12795b62f1c17f4b36c980e33672fbdff3a6731a`. MIT, Copyright (c) 2026 Jarrod Watts; see [LICENSE](/LICENSE) and [NOTICE](/NOTICE). The plugin is named `cc-image-view` so it doesn't clash with upstream's `image-view`.

### Checks

```bash
claude plugin validate .
claude plugin test .
tsc -p .
```
