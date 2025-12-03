# 🔄 即時數據整合說明

## ✅ 已完成的改進

我已經將 Demo 網站升級為**連接真實 free5GC SMF 數據**的版本!

### 📡 新增的 API Endpoints

在 SMF 中新增了兩個 Debug API:

1. **GET /debug/sessions** - 獲取所有 PDU Session 的即時資訊
2. **GET /debug/stats** - 獲取 Fast Cleanup 統計數據

這些 API 已經啟用 CORS，可以從 Demo 網站直接訪問。

### 🔧 修改的檔案

#### 後端 (SMF)
- `free5gc/NFs/smf/internal/sbi/server.go`
  - 新增 `/debug/sessions` endpoint
  - 新增 `/debug/stats` endpoint
  - 啟用 CORS 支援

#### 前端 (Demo)
- `demo/script.js`
  - 新增 `fetchRealData()` 函數從 SMF API 獲取數據
  - 新增 `processRealSessions()` 處理真實 Session 數據
  - 新增 `processRealStats()` 處理統計數據
  - 更新 `refreshSessions()` 和 `startAutoRefresh()` 使用真實數據

## 🚀 使用方式

### 方法 1: 使用真實數據 (推薦)

1. **確保 free5GC 正在運行**
   ```bash
   cd /home/ubuntu/CNDI_final/free5gc
   ./run.sh
   ```

2. **啟動 Demo 網站**
   ```bash
   cd /home/ubuntu/CNDI_final/demo
   python3 -m http.server 8080
   ```

3. **在瀏覽器中開啟**
   ```
   http://localhost:8080
   ```

4. **Demo 會自動連接到 SMF API**
   - SMF API 地址: `http://localhost:29502`
   - 每 5 秒自動刷新數據
   - 顯示真實的 PDU Session 狀態

### 方法 2: 使用模擬數據 (備用)

如果 SMF 未運行或 API 無法訪問，Demo 會自動切換到模擬數據模式。

你也可以手動切換到模擬數據:
```javascript
// 在 demo/script.js 中修改
const USE_REAL_DATA = false; // 改為 false
```

## 📊 真實數據展示內容

### Session 資訊
- ✅ SUPI (用戶識別碼)
- ✅ PDU Session ID
- ✅ IP 地址
- ✅ DNN (Data Network Name)
- ✅ S-NSSAI (Slice 資訊)
- ✅ Session 狀態 (Active/Idle/Released)
- ✅ 閒置時間 (秒)
- ✅ 最後活動時間

### 統計數據
- ✅ 總 Active Sessions 數量
- ✅ 已清理的 Sessions 數量
- ✅ 平均閒置時間
- ✅ 最後掃描時間
- ✅ 掃描次數

## 🧪 測試步驟

### 1. 建立 PDU Session
```bash
cd /home/ubuntu/CNDI_final/free-ran-ue
make ns-ue
```

### 2. 查看 Demo 網站
打開 `http://localhost:8080`，你應該會看到:
- Session 列表中出現新的 PDU Session
- 顯示真實的 SUPI、IP、DNN
- 狀態顯示為 "active"

### 3. 測試流量活動
```bash
# 在 UE namespace 中執行 ping
sudo ip netns exec ue1 ping -I uesimtun0 8.8.8.8
```

觀察 Demo 網站:
- 閒置時間應該保持在低值
- 狀態保持 "active"

### 4. 測試閒置超時
停止 ping，等待配置的超時時間 (例如 60 秒)

觀察 Demo 網站:
- 閒置時間逐漸增加
- 狀態變為 "idle"
- 超時後 Session 被清理，狀態變為 "released"

### 5. 測試自動重連
如果 UE 有自動重連機制，你會看到:
- 舊 Session 消失
- 新 Session 出現
- Timeline 顯示清理和重連事件

## 🔍 API 測試

你可以直接測試 API endpoints:

```bash
# 獲取 Sessions
curl http://localhost:29502/debug/sessions | jq

# 獲取統計數據
curl http://localhost:29502/debug/stats | jq
```

預期輸出範例:

```json
// /debug/sessions
{
  "sessions": [
    {
      "supi": "imsi-208930000000001",
      "pdu_session_id": 1,
      "pdu_address": "10.60.0.101",
      "dnn": "internet",
      "snssai": {
        "sst": 1,
        "sd": "010203"
      },
      "state": "Active",
      "last_active_time": "2025-12-03T11:30:00Z",
      "idle_seconds": 15,
      "idle_timeout": 60
    }
  ],
  "timestamp": 1701604200
}

// /debug/stats
{
  "TotalScans": 120,
  "TotalCleaned": 5,
  "LastScanTime": "2025-12-03T11:30:00Z",
  "LastCleanedCount": 1
}
```

## 🎨 視覺化效果

### 即時更新
- 📊 統計卡片每 5 秒自動更新
- 🔄 Session 列表即時反映系統狀態
- ⏰ Timeline 顯示最新的清理事件

### 狀態指示
- 🟢 **Active**: 綠色標籤，Session 正常運作
- 🟡 **Idle**: 黃色標籤，Session 閒置中
- ⚪ **Released**: 灰色標籤，Session 已釋放

### 互動功能
- 🔄 點擊刷新按鈕立即更新數據
- 🎬 播放訊息流程動畫
- 📋 Hover 查看詳細資訊

## ⚠️ 注意事項

### CORS 設定
API 已啟用 CORS (`Access-Control-Allow-Origin: *`)，僅用於本地開發和 Demo。
生產環境應該限制允許的來源。

### 效能考量
- Demo 每 5 秒刷新一次數據
- 如果 Session 數量很多，可以調整刷新頻率
- API 查詢是輕量級的，不會影響 SMF 效能

### 安全性
- Debug API 沒有認證機制
- 僅用於本地測試和 Demo
- 生產環境應該移除或加上認證

## 🎯 Demo 展示技巧

### 開場 (展示真實數據)
1. 開啟 Demo 網站
2. 指出 "這些是真實的 PDU Session 數據"
3. 展示即時更新 (每 5 秒)

### 建立 Session
1. 執行 `make ns-ue` 建立新 UE
2. 在 Demo 網站上看到新 Session 出現
3. 展示 SUPI、IP、DNN 等真實資訊

### 流量測試
1. 執行 ping 產生流量
2. 展示閒置時間保持低值
3. 停止 ping，展示閒置時間增加

### 自動清理
1. 等待超時 (或手動觸發)
2. 展示 Session 狀態變化
3. 展示 Timeline 中的清理事件

### 統計數據
1. 展示總 Sessions 數量
2. 展示已清理數量
3. 展示平均閒置時間

## 🎉 優勢總結

### 之前 (模擬數據)
- ❌ 數據是假的
- ❌ 無法反映真實狀態
- ❌ 缺乏說服力

### 現在 (真實數據)
- ✅ 連接真實 SMF
- ✅ 即時反映系統狀態
- ✅ 展示實際運作情況
- ✅ 更具說服力和專業性

---

**現在你的 Demo 不只是好看，還是真實的!** 🚀

這將大大提升你在 Demo 時的專業度和可信度!
