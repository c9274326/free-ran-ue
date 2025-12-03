# 🔧 CORS 問題解決方案

## 問題診斷

Web 顯示沒有 PDU Session 的原因是 **CORS (Cross-Origin Resource Sharing) 問題**。

### 問題詳情
- 瀏覽器從 `http://localhost:8080` 訪問頁面
- JavaScript 嘗試訪問 `http://127.0.0.2:8000` 的 API
- 瀏覽器的同源策略阻止了這個跨域請求

即使 SMF 設置了 CORS 頭，瀏覽器仍然可能因為 IP 地址不同而阻止請求。

## 解決方案 ✅

我創建了一個**帶代理功能的 HTTP 服務器**:

### 工作原理
```
瀏覽器 → http://localhost:8080/api/debug/sessions
         ↓
    proxy-server.py (運行在 localhost:8080)
         ↓
    http://127.0.0.2:8000/debug/sessions → SMF
```

### 修改的檔案
1. **proxy-server.py** (新增)
   - 提供靜態文件服務
   - 代理 `/api/*` 請求到 SMF
   - 自動添加 CORS 頭

2. **script.js** (修改)
   - API 地址從 `http://127.0.0.2:8000` 改為 `/api`
   - 使用相對路徑，避免跨域問題

3. **start-demo.sh** (修改)
   - 使用 `python3 proxy-server.py` 而不是 `python3 -m http.server`

## 使用方式

### 啟動 Demo
```bash
cd /home/ubuntu/CNDI_final/demo
./start-demo.sh
```

### 測試代理
```bash
# 測試代理是否工作
curl http://localhost:8080/api/debug/sessions
```

### 在瀏覽器中
1. 開啟 `http://localhost:8080`
2. 按 F12 打開開發者工具
3. 查看 Console 和 Network 標籤
4. 應該看到成功的 API 請求

## 預期結果

### 成功的情況
- ✅ Console 顯示: "Success! Data: ..."
- ✅ Network 標籤顯示: `GET /api/debug/sessions` 狀態 200
- ✅ 頁面顯示真實的 PDU Session 數據

### 如果還是失敗
檢查以下項目:
1. SMF 是否在運行
2. 代理服務器是否正確啟動
3. 瀏覽器 Console 的錯誤訊息

## 測試步驟

1. **停止舊的 Demo 服務器** (如果還在運行)
   ```bash
   # 在運行 ./start-demo.sh 的終端按 Ctrl+C
   ```

2. **重新啟動使用代理的版本**
   ```bash
   cd /home/ubuntu/CNDI_final/demo
   ./start-demo.sh
   ```

3. **刷新瀏覽器** (`http://localhost:8080`)

4. **檢查數據**
   - 應該看到 2 個 Active Sessions
   - 真實的 SUPI 和 IP 地址
   - 即時更新的閒置時間

## 技術細節

### 為什麼需要代理？

瀏覽器的同源策略 (Same-Origin Policy) 要求:
- 協議相同 (http/https)
- 域名相同 (localhost vs 127.0.0.2)
- 端口相同 (8080 vs 8000)

即使只有一個不同，就會被視為跨域請求，需要 CORS 支援。

### 代理的優勢

1. **避免 CORS 問題**: 所有請求都來自同一個源
2. **簡化配置**: 不需要修改 SMF 的 CORS 設置
3. **更好的安全性**: 可以在代理層添加認證
4. **靈活性**: 可以輕鬆切換後端 API

## 故障排除

### 如果代理無法啟動
```bash
# 檢查端口是否被佔用
sudo netstat -tlnp | grep 8080

# 如果被佔用，停止佔用的進程
sudo kill <PID>
```

### 如果 API 請求失敗
```bash
# 測試 SMF API 是否可訪問
curl http://127.0.0.2:8000/debug/sessions

# 測試代理是否工作
curl http://localhost:8080/api/debug/sessions
```

### 查看詳細錯誤
在瀏覽器中:
1. 按 F12 打開開發者工具
2. 切換到 Console 標籤
3. 查看紅色錯誤訊息
4. 切換到 Network 標籤
5. 查看失敗的請求詳情

---

**現在重新啟動 Demo，應該就能看到真實數據了!** 🚀
