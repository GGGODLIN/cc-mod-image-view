# cc-image-view

Claude Code mod，讓貼進 Claude Code 的圖片看得到，有兩個地方：

- **輸入框上方**：輸入框裡有 `[Image #n]` 時，畫一列帶編號的縮圖。沒有這些標記時不畫這列，也不占 UI。
- **已送出的訊息底下**：你送出過、真的附了圖的訊息，底下有一排 `[ 圖 #n ]` 按鈕。滑鼠移上去，縮圖出現在那顆按鈕正下方；縮圖下方的「⤢ 放大」或按鈕本身，會在右側面板開大圖，Esc 關閉。圖片本身點不到（Claude Code 的圖片元件不接受點擊），所以放大要按按鈕。

貼上後不必再按一個鍵。送出、或把標記刪掉之後，下一次檢查（200ms）縮圖就消失。橫圖、直圖照像素比例縮，不會被拉成同一種格子。快取檔找不到時，那一格顯示 `no preview`，不畫壞掉的圖。只在 terminal 畫；desktop、以及 AbovePrompt 以外的元件，都把畫面交回原來的鏈，不改其他 mod 的介面。

session 一開始就每 200ms 讀一次輸入框。沒有貼圖時這個 timer 仍會跑，只是不畫 UI。貼圖不會送出 `prompt.edit`，所以不能改成等編輯事件。

哪些 `[Image #n]` 算數：只有真的附了圖的。你手打的 `[Image #1]` 不會被當成圖，就算同編號的舊圖還在。判斷依據是送出時的附件清單；接回舊 session 時改看對話紀錄檔裡那則訊息有沒有圖片區塊。同一則裡混了手打的舊標記和新貼的圖時，取暫存檔存在、編號最新的那幾個，因為新貼的圖一定拿到最新的編號。

JPG、GIF、WebP：Claude Code 的圖片元件只畫 PNG，所以其他格式會先轉成 PNG，放在 `<暫存目錄>/cc-image-view/<session id>/`。轉檔依序試 `sips`（macOS 內建）、`ffmpeg`、`magick`、`convert`，都沒有就顯示 `no preview`，失敗過的檔案不再重試。

暫存檔不見時（例如重開機清掉了暫存目錄），已送出訊息的圖改從對話紀錄檔取出，寫到同一個資料夾再畫。

這個 mod 會讀到的東西：

- 每 200ms 讀一次整個輸入框的文字。
- 快取的 PNG 會經 `$.fs.read(path, { as: 'bytes' })` 整個讀進來，用前 24 bytes 算寬高。引擎對這次讀取有 4 MiB 上限；超過就放棄比例，圖仍可畫。
- 這個 session 的對話紀錄檔：用 `grep` 挑出帶圖片的使用者訊息，`sed` 拿掉圖片的 base64 後才交給 mod；需要救回圖時，才用 `grep` 讀那一則訊息的完整內容。紀錄檔可能數百 MB，所以不整份讀。

mod 不自己解碼、縮放或重新編碼圖片，畫圖交給終端機開檔處理。

由 gggodlin 改寫與維護。機制借自 [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view/tree/12795b62f1c17f4b36c980e33672fbdff3a6731a) 的 commit `12795b62f1c17f4b36c980e33672fbdff3a6731a`。MIT，Copyright (c) 2026 Jarrod Watts。見 [LICENSE](/LICENSE) 與 [NOTICE](/NOTICE)。這裡的 plugin 名稱是 `cc-image-view`，避免和上游的 `image-view` 撞名。

## 安裝

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

## 試用

不正式安裝、不新增全域啟用項。在這個 repo 的根目錄另開 session：

```bash
claude --plugin-dir .
```

需要 Claude Code 2.1.287 或更新（這份對過本機 2.1.290 的 types）、macOS 或 Linux，以及支援 kitty graphics 的終端機（Ghostty、kitty）。其他終端機格子裡是 alt 文字，不是圖。

### Herdr 的單一 session 啟動

本機 Claude Code 2.1.288 收到 Herdr 的終端名稱 `libghostty` 後，預設判定 `kittyGraphics=no`，即使圖片探測回覆 `OK` 也只畫 alt 文字。這是 Claude Code 的終端名稱判定，不是本 mod 自己解碼或繪圖失敗。

以下啟動方式已在本機 Herdr 實測：

```bash
CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1 claude --plugin-dir .
```

這個環境變數只加在這次啟動，不寫入全域設定。Claude Code 記錄 `kittyGraphics=yes (env: CLAUDE_CODE_FORCE_TERMINAL_IMAGES)`；橫向藍圖、直向橘圖可同時顯示，刪掉其中一個標記只移除對應縮圖，清空輸入後預覽列消失。

驗證限於本機 Herdr（macOS）；沒有承諾其他終端或新版相容。直接 Ghostty 對照未完成。

- 輸入框上方的預覽：Claude Code 2.1.288 實測；JPG 預覽在 2.1.291 實測。
- 已送出訊息的預覽（0.2）：2.1.291 實測，用模擬滑鼠事件操作。包含一則三張圖混文字（含 JPG）、手打假標記、手打舊標記混新貼圖、`--resume` 接回、hover 時按鈕列不動、放大面板換圖，以及暫存目錄不見時從紀錄檔救回。
- 沒測：剪貼簿 ctrl+v 貼圖（只測了貼檔案路徑）、只用鍵盤操作按鈕、全螢幕模式、很長的對話捲動、Linux 上的轉檔工具。

常駐使用方式見前面的安裝段；這裡保留單一 session 的顯圖驗收範圍。

mod 原始碼不開網路、不呼叫模型。會寫的檔只有上面說的轉檔與救回的圖，都在暫存目錄底下。會執行的外部指令：`id -u`（`CLAUDE_CODE_TMPDIR` 沒設定時組預設暫存目錄）、`mkdir`、`sh`／`grep`／`sed`（讀對話紀錄檔）、`base64`（救回圖）與上面的轉檔工具。

## 檢查

```bash
claude plugin validate .
claude plugin test .
tsc -p .
```

Claude Code 載入這個目錄時，會把 API types 寫進 `.claude-plugin/types/`，`tsc -p .` 從那時起對得到 `claude-code`。Herdr 上的實際顯圖與視覺驗收不在這份樹裡。
