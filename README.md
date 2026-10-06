# cc-image-view

Claude Code mod，讓貼進 Claude Code 的圖片看得到，有兩個地方：

- **輸入框上方**：輸入框裡有 `[Image #n]` 時，畫一列帶編號的縮圖。沒有這些標記時不畫這列，也不占 UI。
- **已送出的訊息底下**：你送出過、真的附了圖的訊息，底下有一排 `[ 圖 #n ]` 按鈕。滑鼠移上去，縮圖出現在那顆按鈕正下方；縮圖下方的「⤢ 放大」或按鈕本身，會在右側面板開大圖，Esc 關閉。圖片本身點不到（Claude Code 的圖片元件不接受點擊），所以放大要按按鈕。

https://github.com/user-attachments/assets/8487b2ae-0a09-44c7-8fd7-9ef634856773

這支示範片是用 HTML 重建的示意動畫，不是實機錄影：右側面板畫得比實機寬（約占 44%，實機約 29%），縮圖展開與面板滑入的速度是設計的，`⎿` 這類終端機符號也換了畫法。

輸入框上方的預覽：貼上後不必再按一個鍵；送出、或把標記刪掉之後，下一次檢查時縮圖就消失。200ms 是檢查間隔，不是保證：遇到要轉檔的圖，這一輪要等轉檔做完。橫圖、直圖照像素比例縮。快取檔找不到或轉不了時，那一格顯示 `no preview`。這裡只看標記和暫存檔，所以手打一個暫存裡還有的舊編號，一樣會顯示那張舊圖。

只在 terminal 畫。這個 mod 會接手三個元件：輸入框上方（AbovePrompt）、已送出的使用者訊息（UserMessage，只在有綁定的圖時加按鈕，其他時候原樣交回），以及自己的放大面板。desktop 與其他元件都交回原來的鏈。

session 一開始就每 200ms 讀一次輸入框。沒有貼圖時這個 timer 仍會跑，只是不畫 UI。貼圖不會送出 `prompt.edit`，所以不能改成等編輯事件。

已送出訊息的預覽只顯示對話紀錄檔明確綁在那則訊息上的圖：Claude Code 會把每則訊息附的圖片編號記在 `imagePasteIds`，一個編號對一個圖片區塊。手打的 `[Image #1]` 沒有這筆紀錄，不會被當成圖；同一則混了手打舊標記和新貼的圖，只有新貼的會出現。兩則訊息文字一模一樣、附的圖卻不同時（例如之後又手打了同一句），畫面上分不出是哪一則，兩則都不顯示。剛送出的訊息要等它寫進紀錄檔（通常一秒內），按鈕才出現。缺圖的訊息不顯示按鈕，不會出現 `no preview`。

JPG、GIF、WebP：Claude Code 的圖片元件只畫 PNG，所以這三種格式會先轉成 PNG（只取第一格），其他副檔名一律不轉。轉檔依序試 `sips`（macOS 內建）、`ffmpeg`（只准讀本機檔案）、`magick`、`convert`（限制記憶體 256 MiB、磁碟 1 GiB），每個工具最多 10 秒；都不行就不顯示，失敗過的檔案不再重試。這些工具是你機器上的程式，它們怎麼解碼由它們自己決定，也算在這個 mod 的信任範圍裡；只在 macOS 的 `sips` 上實測過。

轉好的 PNG 與救回的圖放在 `<暫存目錄>/cc-image-view/<session id>/`。這個資料夾和上一層都會先確認是你自己擁有、不是符號連結，並設成只有你能讀（700）；確認不了就不寫。檔案先寫成暫存名稱再改名，讀的人不會讀到寫一半的檔。這個 mod 不會主動清掉這些檔，靠系統清暫存目錄。

暫存檔不見時（例如重開機清掉了暫存目錄），已送出訊息的圖改從對話紀錄檔取出再畫。限制：救回時要把那一則訊息的整行紀錄讀進來，含所有圖片的 base64，超過 4 MiB 的訊息救不回來，那幾張圖不顯示。

這個 mod 會讀到的東西：

- 每 200ms 讀一次整個輸入框的文字。
- 快取的 PNG 會經 `$.fs.read(path, { as: 'bytes' })` 整個讀進來，用前 24 bytes 算寬高。引擎對這次讀取有 4 MiB 上限；超過就放棄比例，圖仍可畫。
- 這個 session 的對話紀錄檔：`grep` 在磁碟上掃過整份檔案，只把提到 `[Image #` 的使用者訊息、去掉圖片 base64 之後交給 mod。紀錄檔可能數百 MB，這樣不會整份讀進 mod 的記憶體，但每次紀錄檔變大後的第一次查詢都會掃一次全檔。這份清單超過 4 MiB 時視為讀取失敗，不用不完整的結果。需要救回圖時，才用 `grep` 讀那一則訊息的完整內容。

mod 的程式碼本身不解碼、縮放或重新編碼圖片：PNG 由終端機開檔畫，其他格式由上面的外部轉檔工具解碼再編成 PNG。

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
- 已送出訊息的預覽（0.2）：2.1.291 實測，用模擬滑鼠事件操作。包含一則三張圖混文字（含 JPG）、手打假標記、手打舊標記混新貼圖、`--resume` 接回、hover 時按鈕列不動、放大面板換圖，以及整個暫存資料夾不見時從紀錄檔救回。
- 沒測：剪貼簿 ctrl+v 貼圖（只測了貼檔案路徑）、只用鍵盤操作按鈕、全螢幕模式、很長的對話捲動、Linux 上的轉檔工具。

常駐使用方式見前面的安裝段；這裡保留單一 session 的顯圖驗收範圍。

mod 原始碼不開網路、不呼叫模型。會寫的檔只有上面說的轉檔與救回的圖，都在暫存目錄底下的私有資料夾。會執行的外部指令：`id -u`（`CLAUDE_CODE_TMPDIR` 沒設定時組預設暫存目錄）、`sh`／`mkdir`／`chmod`（建私有資料夾）、`grep`／`sed`（讀對話紀錄檔）、`base64`（救回圖）、`mv`（把寫好的檔換上去），以及上面的轉檔工具。路徑與訊息 id 都當成參數傳，不拼進 shell 指令。

## 檢查

```bash
claude plugin validate .
claude plugin test .
tsc -p .
```

Claude Code 載入這個目錄時，會把 API types 寫進 `.claude-plugin/types/`，`tsc -p .` 從那時起對得到 `claude-code`。Herdr 上的實際顯圖與視覺驗收不在這份樹裡。
