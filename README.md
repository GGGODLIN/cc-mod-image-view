# cc-image-view

A Claude Code mod that lets you see the images you paste, in two places:

- **Above the prompt**: while the draft holds `[Image #n]` tags, a row of numbered thumbnails shows above it. With no tags, nothing is drawn.
- **Under sent prompts**: a prompt you sent with images gets a row of `[ img #n ]` buttons. Hover one and its thumbnail appears right under it; `⤢ Zoom` under the thumbnail, or the button itself, opens the picture in a side pane (Esc closes it). The picture itself can't be clicked: Claude Code's image element takes no presses.

https://github.com/user-attachments/assets/8487b2ae-0a09-44c7-8fd7-9ef634856773

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

Sessions started after the install load it. Needs Claude Code 2.1.287 or later (checked against the 2.1.290 types), macOS or Linux, and a terminal with kitty graphics (Ghostty, kitty); other terminals show the alt text instead of pictures. Under Herdr, Claude Code 2.1.288 reads the terminal name `libghostty` as no kitty graphics; set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` for Herdr shells (see the Chinese section for a snippet).

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

---

## 中文說明

Claude Code mod，讓貼進 Claude Code 的圖片看得到，有兩個地方：

- **輸入框上方**：輸入框裡有 `[Image #n]` 時，畫一列帶編號的縮圖。沒有這些標記時不畫這列，也不占 UI。
- **已送出的訊息底下**：你送出過、真的附了圖的訊息，底下有一排 `[ 圖 #n ]` 按鈕。滑鼠移上去，縮圖出現在那顆按鈕正下方；縮圖下方的「⤢ 放大」或按鈕本身，會在右側面板開大圖，Esc 關閉。圖片本身點不到（Claude Code 的圖片元件不接受點擊），所以放大要按按鈕。

上方的示範片是用 HTML 重建的示意動畫，不是實機錄影：右側面板畫得比實機寬（約占 44%，實機約 29%），縮圖展開與面板滑入的速度是設計的，`⎿` 這類終端機符號也換了畫法。

輸入框上方的預覽：貼上後不必再按一個鍵；送出、或把標記刪掉之後，下一次檢查時縮圖就消失。200ms 是檢查間隔，不是保證：遇到要轉檔的圖，這一輪要等轉檔做完。橫圖、直圖照像素比例縮。快取檔找不到或轉不了時，那一格顯示「無法預覽」。這裡只看標記和暫存檔，所以手打一個暫存裡還有的舊編號，一樣會顯示那張舊圖。

只在 terminal 畫。這個 mod 會接手三個元件：輸入框上方（AbovePrompt）、已送出的使用者訊息（UserMessage，只在有綁定的圖時加按鈕，其他時候原樣交回），以及自己的放大面板。desktop 與其他元件都交回原來的鏈。

session 一開始就每 200ms 讀一次輸入框。沒有貼圖時這個 timer 仍會跑，只是不畫 UI。貼圖不會送出 `prompt.edit`，所以不能改成等編輯事件。

已送出訊息的預覽只顯示對話紀錄檔明確綁在那則訊息上的圖：Claude Code 會把每則訊息附的圖片編號記在 `imagePasteIds`，一個編號對一個圖片區塊。手打的 `[Image #1]` 沒有這筆紀錄，不會被當成圖；同一則混了手打舊標記和新貼的圖，只有新貼的會出現。兩則訊息文字一模一樣、附的圖卻不同時（例如之後又手打了同一句），畫面上分不出是哪一則，兩則都不顯示。剛送出的訊息要等它寫進紀錄檔（通常一秒內），按鈕才出現；紀錄檔還沒確認前一律不顯示，等多久都一樣。紀錄檔讀取失敗或結果被截斷（符合的列超過 4 MiB）時，所有已送出訊息都先不顯示按鈕，直到下一次讀取成功。缺圖的訊息不顯示按鈕，不會出現「無法預覽」。

JPG、GIF、WebP：Claude Code 的圖片元件只畫 PNG，所以這三種格式會先轉成 PNG（只取第一格），其他副檔名一律不轉。轉檔依序試 `sips`（macOS 內建）、`ffmpeg`（只准讀本機檔案）、`magick`、`convert`（限制記憶體 256 MiB、磁碟 1 GiB），每個工具最多 10 秒；都不行就不顯示，失敗過的檔案不再重試。這些工具是你機器上的程式，它們怎麼解碼由它們自己決定，也算在這個 mod 的信任範圍裡；只在 macOS 的 `sips` 上實測過。

轉好的 PNG 與救回的圖放在 `<暫存目錄>/cc-image-view/<session id>/`。每次寫入前都會確認：暫存目錄本身是你的、不是符號連結、別人不能寫，而且它所在的資料夾別人不能在裡面改名（別人不能寫，或像 `/tmp` 一樣有 sticky 位元）；底下兩層資料夾再設成只有你能讀（700）。任何一項不成立就不寫，所以把 `CLAUDE_CODE_TMPDIR` 設在共用位置時，JPG／GIF／WebP 預覽與救回圖會直接關閉。檔案先寫成暫存名稱再改名，讀的人不會讀到寫一半的檔。這個 mod 不會主動清掉這些檔，靠系統清暫存目錄。

暫存檔不見時（例如重開機清掉了暫存目錄），已送出訊息的圖改從對話紀錄檔取出再畫。限制：救回時要把那一則訊息的整行紀錄讀進來，含所有圖片的 base64，超過 4 MiB 的訊息救不回來，那幾張圖不顯示。

這個 mod 會讀到的東西：

- 每 200ms 讀一次整個輸入框的文字。
- 快取的 PNG 會經 `$.fs.read(path, { as: 'bytes' })` 整個讀進來，用前 24 bytes 算寬高。引擎對這次讀取有 4 MiB 上限；超過就放棄比例，圖仍可畫。
- 啟動時讀一次使用者層的 `settings.json`，只看 `language`，用來決定介面語言。
- 這個 session 的對話紀錄檔：`grep` 在磁碟上掃過整份檔案，只把提到 `[Image #` 的使用者訊息、去掉圖片 base64 之後交給 mod。紀錄檔可能數百 MB，這樣不會整份讀進 mod 的記憶體，但每次紀錄檔變大後的第一次查詢都會掃一次全檔。這份清單超過 4 MiB 時視為讀取失敗，不用不完整的結果。需要救回圖時，才用 `grep` 讀那一則訊息的完整內容。

mod 的程式碼本身不解碼、縮放或重新編碼圖片：PNG 由終端機開檔畫，其他格式由上面的外部轉檔工具解碼再編成 PNG。

由 gggodlin 改寫與維護。機制借自 [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view/tree/12795b62f1c17f4b36c980e33672fbdff3a6731a) 的 commit `12795b62f1c17f4b36c980e33672fbdff3a6731a`。MIT，Copyright (c) 2026 Jarrod Watts。見 [LICENSE](/LICENSE) 與 [NOTICE](/NOTICE)。這裡的 plugin 名稱是 `cc-image-view`，避免和上游的 `image-view` 撞名。

### 安裝

```bash
claude plugin marketplace add GGGODLIN/cc-mod-image-view
claude plugin install cc-image-view@cc-mod-image-view --scope user
```

之後新開 Claude Code session 會自動載入。有圖片標記才顯示預覽列。從本機 clone 安裝時，把第一行換成在 repo 根目錄執行 `claude plugin marketplace add .`。

在 Herdr 使用時，另把以下條件放進互動 shell 的啟動設定，讓圖片開關只套用在新的 Herdr shell：

```bash
if [[ "${HERDR_ENV:-}" == "1" ]]; then
  export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
fi
```

已開著的 session 不會自動取得新環境變數，要新開 session。安裝的是副本；改原碼後用 `claude plugin update cc-image-view@cc-mod-image-view` 更新。

### 語言

介面有英文與繁體中文。預設 `auto`：先看 Claude Code `settings.json` 的 `language`（例如「繁體中文」），再看 `LC_ALL`／`LANG`，都沒有就用英文。任何中文都顯示繁體中文。只讀使用者層的 `~/.claude/settings.json`（或 `CLAUDE_CONFIG_DIR` 底下的），不看專案設定或 `--settings`。要固定語言，在 `/config` 找到這個 plugin 的 Language 選 `en` 或 `zh-TW`。

### 試用

不正式安裝、不新增全域啟用項。在這個 repo 的根目錄另開 session：

```bash
claude --plugin-dir .
```

需要 Claude Code 2.1.287 或更新（這份對過本機 2.1.290 的 types）、macOS 或 Linux，以及支援 kitty graphics 的終端機（Ghostty、kitty）。其他終端機格子裡是 alt 文字，不是圖。

#### Herdr 的單一 session 啟動

本機 Claude Code 2.1.288 收到 Herdr 的終端名稱 `libghostty` 後，預設判定 `kittyGraphics=no`，即使圖片探測回覆 `OK` 也只畫 alt 文字。這是 Claude Code 的終端名稱判定，不是本 mod 自己解碼或繪圖失敗。

以下啟動方式已在本機 Herdr 實測：

```bash
CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1 claude --plugin-dir .
```

這個環境變數只加在這次啟動，不寫入全域設定。Claude Code 記錄 `kittyGraphics=yes (env: CLAUDE_CODE_FORCE_TERMINAL_IMAGES)`；橫向藍圖、直向橘圖可同時顯示，刪掉其中一個標記只移除對應縮圖，清空輸入後預覽列消失。

驗證限於本機 Herdr（macOS）；沒有承諾其他終端或新版相容。直接 Ghostty 對照未完成。

- 輸入框上方的預覽：Claude Code 2.1.288 實測；JPG 預覽在 2.1.291 實測。
- 已送出訊息的預覽（0.2）：2.1.291 實測，用模擬滑鼠事件操作。包含一則三張圖混文字（含 JPG）、手打假標記、手打舊標記混新貼圖、`--resume` 接回、hover 時按鈕列不動、放大面板換圖，以及整個暫存資料夾不見時從紀錄檔救回。
- 介面語言（0.3）：中文介面實機確認過（`auto` 讀到 `settings.json` 的「繁體中文」）；英文介面只有測試涵蓋。
- 沒測：剪貼簿 ctrl+v 貼圖（只測了貼檔案路徑）、只用鍵盤操作按鈕、全螢幕模式、很長的對話捲動、Linux 上的轉檔工具。

常駐使用方式見前面的安裝段；這裡保留單一 session 的顯圖驗收範圍。

mod 原始碼不開網路、不呼叫模型。會寫的檔只有上面說的轉檔與救回的圖，都在暫存目錄底下的私有資料夾。會執行的外部指令：`id -u`（`CLAUDE_CODE_TMPDIR` 沒設定時組預設暫存目錄）、`sh`／`mkdir`／`chmod`（建私有資料夾）、`grep`／`sed`（讀對話紀錄檔）、`base64`（救回圖）、`mv`（把寫好的檔換上去），以及上面的轉檔工具。路徑與訊息 id 都當成參數傳，不拼進 shell 指令。

### 檢查

```bash
claude plugin validate .
claude plugin test .
tsc -p .
```

Claude Code 載入這個目錄時，會把 API types 寫進 `.claude-plugin/types/`，`tsc -p .` 從那時起對得到 `claude-code`。Herdr 上的實際顯圖與視覺驗收不在這份樹裡。
