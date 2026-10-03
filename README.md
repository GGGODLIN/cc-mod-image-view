# cc-image-view

本機獨立的 Claude Code mod。輸入框裡有 `[Image #n]` 時，在 terminal 的 AbovePrompt 畫一列帶編號的縮圖。沒有這些標記時不畫這列，也不占 UI。

貼上後不必再按一個鍵。送出、或把標記刪掉之後，下一次檢查（200ms）縮圖就消失。橫圖、直圖照像素比例縮，不會被拉成同一種格子。快取檔找不到時，那一格顯示 `no preview`，不畫壞掉的圖。只在 terminal 畫；desktop、以及 AbovePrompt 以外的元件，都把畫面交回原來的鏈，不改其他 mod 的介面。

session 一開始就每 200ms 讀一次輸入框。沒有貼圖時這個 timer 仍會跑，只是不畫 UI。貼圖不會送出 `prompt.edit`，所以不能改成等編輯事件。

找得到的快取 PNG 會經 `$.fs.read(path, { as: 'bytes' })` 讀進檔案內容，不是只讀 header。引擎對這次讀取有大小上限；超過就放棄比例，圖仍可畫。`pngSize` 只用讀到內容的前 24 bytes 取寬高。終端機自己開檔畫 `Image`，像素不經過這個 mod。

機制借自 [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view/tree/12795b62f1c17f4b36c980e33672fbdff3a6731a) 的 commit `12795b62f1c17f4b36c980e33672fbdff3a6731a`。MIT，Copyright (c) 2026 Jarrod Watts。見 [LICENSE](/LICENSE) 與 [NOTICE](/NOTICE)。這裡的 plugin 名稱是 `cc-image-view`，避免和上游的 `image-view` 撞名。

## 常駐安裝

在 repo 根目錄執行一次：

```bash
claude plugin marketplace add .
claude plugin install cc-image-view@cc-mod-image-view --scope user
```

之後新開 Claude Code session 會自動載入，不必再帶 `--plugin-dir`。有圖片標記才顯示預覽列。

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

需要 Claude Code 2.1.287 或更新（這份對過本機 2.1.288 的 types）、macOS 或 Linux，以及支援 kitty graphics 的終端機（Ghostty、kitty）。其他終端機格子裡是 alt 文字，不是圖。

### Herdr 的單一 session 啟動

本機 Claude Code 2.1.288 收到 Herdr 的終端名稱 `libghostty` 後，預設判定 `kittyGraphics=no`，即使圖片探測回覆 `OK` 也只畫 alt 文字。這是 Claude Code 的終端名稱判定，不是本 mod 自己解碼或繪圖失敗。

以下啟動方式已在本機 Herdr 實測：

```bash
CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1 claude --plugin-dir .
```

這個環境變數只加在這次啟動，不寫入全域設定。Claude Code 記錄 `kittyGraphics=yes (env: CLAUDE_CODE_FORCE_TERMINAL_IMAGES)`；橫向藍圖、直向橘圖可同時顯示，刪掉其中一個標記只移除對應縮圖，清空輸入後預覽列消失。現有白話／跟丟了入口仍在。

驗證限於本機 Herdr 與 Claude Code 2.1.288；沒有承諾其他終端或新版相容。直接 Ghostty 對照未完成，真送出後清空只保留 mock 證據，實機沒有提交圖片給模型。常駐使用方式見前面的安裝段；這裡保留單一 session 的顯圖驗收範圍。

mod 原始碼不開網路、不寫檔、不呼叫模型。`CLAUDE_CODE_TMPDIR` 沒設定時，會跑一次 `id -u`，用來組預設暫存目錄。

## 檢查

```bash
claude plugin validate .
claude plugin test .
tsc -p .
```

Claude Code 載入這個目錄時，會把 API types 寫進 `.claude-plugin/types/`，`tsc -p .` 從那時起對得到 `claude-code`。Herdr 上的實際顯圖與視覺驗收不在這份樹裡。
