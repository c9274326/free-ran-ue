# PDU Session Release 功能修復說明

## 概述

本文檔說明在 free-ran-ue 專案中新增的 PDU Session Release 處理功能，使 free-ran-ue 能夠正確處理來自 free5gc SMF Fast Cleanup 機制觸發的網路側 PDU Session 釋放流程。

## 問題背景

當 free5gc SMF 的 Fast Cleanup 功能偵測到 PDU Session 閒置超時後，會發起網路側 PDU Session 釋放。原本的 free-ran-ue 無法處理此流程，導致：

1. gNB 無法處理 `PDUSessionResourceReleaseCommand` NGAP 訊息
2. UE 無法解密並處理加密的 `PDU Session Release Command` NAS 訊息
3. UE 的 TUN 介面無法正確關閉，PDU Session 釋放後仍可繼續 ping

## 變更摘要

| 檔案 | 新增行數 | 說明 |
|------|----------|------|
| `gnb/ngapDispatcher.go` | +72 | 新增 PDU Session Resource Release 處理器 |
| `gnb/ngapBuilder.go` | +61 | 新增 PDU Session Resource Release Response 建構函數 |
| `ue/ue.go` | +99 | 新增 NAS 訊息解密與 PDU Session Release 處理函數 |

---

## 修改內容

### 1. gnb/ngapDispatcher.go

#### 1.1 在 `initiatingMessageProcessor` 新增處理分支

```diff
 case ngapType.ProcedureCodeUEContextRelease:
     g.NgapLog.Debugln("Processing NGAP UE Context Release")
     d.ueContextReleaseProcessor(g, ngapPdu)
+case ngapType.ProcedureCodePDUSessionResourceRelease:
+    g.NgapLog.Debugln("Processing NGAP PDU Session Resource Release")
+    d.pduSessionResourceReleaseProcessor(g, ngapPdu)
 default:
```

#### 1.2 新增 `pduSessionResourceReleaseProcessor` 函數

此函數負責：
- 解析 `PDUSessionResourceReleaseCommand` NGAP 訊息
- 提取 AMF UE NGAP ID、RAN UE NGAP ID、NAS PDU 和 PDU Session 列表
- 將 NAS PDU（加密的 PDU Session Release Command）轉發給 UE
- 建立並發送 `PDUSessionResourceReleaseResponse` 給 AMF

---

### 2. gnb/ngapBuilder.go

#### 2.1 新增 `buildPduSessionResourceReleaseResponse` 函數

建構符合 3GPP TS 38.413 規範的 NGAP PDU Session Resource Release Response 訊息，包含：
- AMF UE NGAP ID
- RAN UE NGAP ID  
- PDU Session Resource Released List（已釋放的 PDU Session 列表）

#### 2.2 新增 `getPduSessionResourceReleaseResponse` 函數

將建構好的 NGAP PDU 編碼為位元組序列。

---

### 3. ue/ue.go

#### 3.1 修改 `waitForRanMessage` 函數

在 default case 中新增 NAS 訊息處理嘗試：

```diff
 default:
-    u.RanLog.Warnf("Received unknown message from RAN: %+v", buffer[:n])
+    // 嘗試處理 NAS 訊息 (例如 PDU Session Release Command)
+    if !u.tryHandleNasMessage(buffer[:n]) {
+        u.RanLog.Warnf("Received unknown message from RAN: %+v", buffer[:n])
+    }
```

#### 3.2 新增 `tryHandleNasMessage` 函數

此函數負責識別和解密 NAS 訊息：

```go
func (u *Ue) tryHandleNasMessage(data []byte) bool {
    // 檢查 Security Header Type
    // data[0] = Extended Protocol Discriminator (0x7e for 5GMM)
    // data[1] = Security Header Type
    epd := data[0]
    securityHeaderType := data[1] & 0x0f

    // 如果是 5GMM 訊息且有安全頭，需要解密
    if epd == 0x7e && securityHeaderType != nas.SecurityHeaderTypePlainNas {
        msg, err := nasDecode(u, securityHeaderType, data)
        if err != nil {
            return false
        }
        return u.handleDecodedNasMessage(msg)
    }
    // ...
}
```

**關鍵修正**：原本的邏輯僅檢查 EPD (Extended Protocol Discriminator)，但加密的 NAS 訊息第一個位元組仍然是 `0x7e`，需要進一步檢查第二個位元組的 Security Header Type 來判斷是否需要解密。

#### 3.3 新增 `handleDecodedNasMessage` 函數

處理解碼後的 NAS 訊息，支援：
- 5GSM 訊息（如 PDU Session Release Command）
- 5GMM 訊息（如 DL NAS Transport，可能包含內層 5GSM 訊息）

#### 3.4 新增 `handlePduSessionReleaseCommand` 函數

處理 PDU Session Release Command：
- 關閉 TUN 介面 (`ueTunnelDevice.Close()`)
- 移除 TUN 設備 (`bringDownUeTunnelDevice`)
- 記錄 PDU Session 已被網路釋放

---

## 訊息流程

```
SMF                    AMF                    gNB                    UE
 |                      |                      |                      |
 |--NetworkInitiated--->|                      |                      |
 |    Release           |                      |                      |
 |                      |--PDUSessionResource->|                      |
 |                      |  ReleaseCommand      |                      |
 |                      |  (含加密 NAS PDU)    |                      |
 |                      |                      |--NAS PDU (加密)----->|
 |                      |                      |  PDU Session         |
 |                      |                      |  Release Command     |
 |                      |                      |                      |
 |                      |                      |  [UE 解密 NAS 訊息]   |
 |                      |                      |  [關閉 TUN 介面]      |
 |                      |                      |                      |
 |                      |<-PDUSessionResource--|                      |
 |                      |  ReleaseResponse     |                      |
 |<--N2 PDU Resource----|                      |                      |
 |   Release Response   |                      |                      |
```

---

## NAS 訊息格式

### 加密的 NAS 訊息結構

| Byte | 欄位 | 說明 |
|------|------|------|
| 0 | Extended Protocol Discriminator | `0x7e` = 5GMM |
| 1 | Security Header Type | `0x02` = Integrity Protected and Ciphered |
| 2-5 | Message Authentication Code | 4 bytes MAC |
| 6 | Sequence Number | NAS 序號 |
| 7+ | Encrypted Payload | 加密的 NAS 訊息內容 |

### 解密後的 PDU Session Release Command

| Byte | 欄位 | 值 |
|------|------|-----|
| 0 | Extended Protocol Discriminator | `0x2e` (5GSM) |
| 1 | PDU Session ID | Session ID |
| 2 | PTI | Procedure Transaction ID |
| 3 | Message Type | `0x68` (PDU Session Release Command) |
| 4+ | 5GSM Cause, etc. | 其他 IE |

---

## 測試驗證

### 前置條件
1. 設定 free5gc SMF Fast Cleanup (`smfcfg.yaml`)
2. 編譯並啟動 free-ran-ue

### 測試步驟
1. 啟動 free5gc 核心網
2. 啟動 free-ran-ue 並建立 PDU Session
3. 使用 UE 執行 ping：`ping -I uesimtun0 8.8.8.8`
4. 停止 ping，等待 idle timeout（例如 60 秒）
5. 觀察日誌輸出

### 預期結果

**SMF 日誌：**
```
Network initiated release for UE... PDUSessionID[X], cause: 67
```

**gNB 日誌：**
```
Processing NGAP PDU Session Resource Release
Received PDU Session Resource Release Command for AMF UE NGAP ID: X, RAN UE NGAP ID: X, PDU Sessions: [X]
PDU Session Resource Release completed for UE XXXXX, PDU Sessions: [X]
```

**UE 日誌：**
```
Received PDU Session Release Command
Processing PDU Session Release Command - closing TUN interface
TUN interface closed due to PDU Session Release
PDU Session Released by network
```

**驗證 ping 失敗：**
```bash
$ ping -I uesimtun0 8.8.8.8
ping: uesimtun0: No such device
```

---

## 已知訊息

以下訊息在 PDU Session Release 過程中可能出現，屬於正常現象：

| 等級 | 訊息 | 說明 |
|------|------|------|
| ERROR | `read tun: file already closed` | TUN 讀取 goroutine 在介面關閉時的 race condition |
| WARN | `Error bringing down TUN device` | TUN 設備可能已被移除 |

這些訊息不影響 PDU Session Release 的功能正確性。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `gnb/ngapDispatcher.go` | NGAP 訊息分發與處理 |
| `gnb/ngapBuilder.go` | NGAP 訊息建構 |
| `ue/ue.go` | UE NAS 訊息處理與 TUN 管理 |
| `ue/security.go` | NAS 安全解密函數 (`nasDecode`) |
