#!/bin/bash

# 5G Fast PDU Session Cleanup Demo 啟動腳本

echo "🚀 5G Fast PDU Session Cleanup Demo"
echo "===================================="
echo ""

# 檢查 SMF 是否運行
echo "📡 檢查 SMF 狀態..."
if curl -s http://127.0.0.2:8000/debug/sessions > /dev/null 2>&1; then
    echo "✅ SMF 正在運行，將使用真實數據"
    REAL_DATA=true
else
    echo "⚠️  SMF 未運行，將使用模擬數據"
    echo "   提示: 執行 'cd /home/ubuntu/CNDI_final/free5gc && ./run.sh' 來啟動 SMF"
    REAL_DATA=false
fi

echo ""
echo "🌐 啟動 Demo 網站..."
echo "   URL: http://localhost:8080"
echo ""
echo "📊 功能:"
echo "   - 即時 PDU Session 監控"
echo "   - Fast Cleanup 統計數據"
echo "   - 訊息流程動畫"
echo "   - 系統架構視覺化"
echo ""
echo "🔄 數據模式: $([ "$REAL_DATA" = true ] && echo "真實數據 (每5秒自動刷新)" || echo "模擬數據")"
echo ""
echo "按 Ctrl+C 停止 Demo 網站"
echo "===================================="
echo ""

# 啟動帶代理的 HTTP Server
cd "$(dirname "$0")"
python3 proxy-server.py
