import React, { useState, useEffect, useMemo } from 'react';
import { 
  Navigation, Plus, Trash2, Clock, Map as MapIcon, Sparkles, Info, X, 
  Loader2, Utensils, Plane, Coffee, Camera, Heart, Settings, AlertCircle,
  CheckCircle2
} from 'lucide-react';

// --- 風格設定 (Zakka Style) ---
// 動態載入可愛的圓體字型
const fontLink = document.createElement('link');
fontLink.href = "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// --- 模擬座標與資料庫 ---
const PREDEFINED_LOCATIONS = {
  "關西機場": { x: 20, y: 95, area: "Gateway", defaultDuration: 60 },
  "難波": { x: 50, y: 60, area: "Minami", defaultDuration: 120 },
  "道頓堀": { x: 50, y: 58, area: "Minami", defaultDuration: 90 },
  "心齋橋": { x: 50, y: 55, area: "Minami", defaultDuration: 120 },
  "黑門市場": { x: 52, y: 62, area: "Minami", defaultDuration: 60 },
  "通天閣": { x: 52, y: 70, area: "Tennoji", defaultDuration: 60 },
  "新世界": { x: 51, y: 71, area: "Tennoji", defaultDuration: 90 },
  "阿倍野 Harukas": { x: 52, y: 75, area: "Tennoji", defaultDuration: 90 },
  "梅田 (大阪站)": { x: 50, y: 30, area: "Kita", defaultDuration: 120 },
  "梅田藍天大廈": { x: 45, y: 28, area: "Kita", defaultDuration: 60 },
  "大阪城": { x: 70, y: 45, area: "Castle", defaultDuration: 150 },
  "環球影城 (USJ)": { x: 10, y: 40, area: "Bay", defaultDuration: 480 },
  "海遊館": { x: 10, y: 55, area: "Bay", defaultDuration: 180 },
  "天保山摩天輪": { x: 10, y: 56, area: "Bay", defaultDuration: 30 },
  "美國村": { x: 48, y: 56, area: "Minami", defaultDuration: 90 },
  "四天王寺": { x: 55, y: 72, area: "Tennoji", defaultDuration: 60 },
};

// 預設行程資料
const DEFAULT_ITINERARY = [
  {
    id: 1,
    day: 1,
    startTime: "10:00",
    items: [
      { id: '101', name: "關西機場", note: "航班抵達 ✈️", coords: PREDEFINED_LOCATIONS["關西機場"], duration: 60 },
      { id: '102', name: "難波", note: "飯店 Check-in 🏨", coords: PREDEFINED_LOCATIONS["難波"], duration: 60 },
    ]
  }
];

// --- 工具函式 ---
const getDistance = (p1, p2) => {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const estimateTravelTime = (p1, p2) => {
  if (!p1 || !p2) return 0;
  const dist = getDistance(p1, p2);
  return Math.round(10 + dist * 1.2);
};

const addTime = (timeStr, minutes) => {
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toTimeString().slice(0, 5);
};

export default function OsakaZakkaPlanner() {
  // --- State: API Key ---
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem("gemini_api_key") || "";
    } catch (e) {
      return "";
    }
  });
  const [showSettings, setShowSettings] = useState(!apiKey);
  
  // --- State: 核心資料 ---
  const [activeDay, setActiveDay] = useState(1);
  const [itinerary, setItinerary] = useState(DEFAULT_ITINERARY);
  const [inputLocation, setInputLocation] = useState("");
  const [inputNote, setInputNote] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  
  // --- State: AI 功能 ---
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  // 儲存 API Key
  const handleSaveKey = (key) => {
    setApiKey(key);
    try {
      localStorage.setItem("gemini_api_key", key);
    } catch (e) {
      console.warn("無法寫入 localStorage");
    }
    setShowSettings(false);
  };

  // 取得當前天數資料
  const currentDayIndex = itinerary.findIndex(d => d.day === activeDay);
  const currentDayData = itinerary[currentDayIndex] || { items: [], startTime: "09:00" };

  // --- 計算時間軸 (Computed) ---
  const calculatedTimeline = useMemo(() => {
    let currentTime = currentDayData.startTime;
    const timelineItems = [];

    currentDayData.items.forEach((item, index) => {
      let travelMinutes = 0;
      if (index > 0) {
        const prevItem = currentDayData.items[index - 1];
        if (prevItem.coords && item.coords) {
          travelMinutes = estimateTravelTime(prevItem.coords, item.coords);
        } else {
          travelMinutes = 30; // 預設移動時間
        }
        currentTime = addTime(currentTime, travelMinutes);
      }
      const arrivalTime = currentTime;
      const duration = item.duration || 90;
      const departureTime = addTime(arrivalTime, duration);
      currentTime = departureTime;

      timelineItems.push({
        ...item,
        travelTimeFromPrev: index > 0 ? travelMinutes : 0,
        arrivalTime,
        departureTime
      });
    });
    return timelineItems;
  }, [currentDayData]);

  // --- Effect: 搜尋建議 ---
  useEffect(() => {
    if (!inputLocation || inputLocation.trim() === "") {
      setSuggestions([]);
      return;
    }
    const matches = Object.keys(PREDEFINED_LOCATIONS).filter(loc => 
      loc.includes(inputLocation)
    );
    setSuggestions(matches);
  }, [inputLocation]);

  // --- Action: 新增項目 (核心邏輯修復) ---
  const handleAddItem = (nameOverride, noteOverride) => {
    // 1. 決定要新增的名稱與備註 (優先使用傳入的參數，否則使用輸入框)
    const nameToAdd = typeof nameOverride === 'string' ? nameOverride : inputLocation;
    const noteToAdd = typeof noteOverride === 'string' ? noteOverride : inputNote;

    // 2. 驗證
    if (!nameToAdd || !nameToAdd.trim()) {
      alert("請輸入景點名稱喔！");
      return;
    }

    // 3. 準備資料物件
    const locData = PREDEFINED_LOCATIONS[nameToAdd];
    const newItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // 產生唯一 ID
      name: nameToAdd,
      note: noteToAdd || "自由活動",
      coords: locData || null,
      duration: locData ? locData.defaultDuration : 90
    };

    // 4. 更新 State
    setItinerary(prevItinerary => {
      const dayIndex = prevItinerary.findIndex(d => d.day === activeDay);
      // 如果當天不存在，不執行
      if (dayIndex === -1) return prevItinerary;

      const newItinerary = [...prevItinerary];
      const newItems = [...newItinerary[dayIndex].items, newItem];
      newItinerary[dayIndex] = { ...newItinerary[dayIndex], items: newItems };
      return newItinerary;
    });

    // 5. 如果是用輸入框新增的，才清空輸入框
    if (nameToAdd === inputLocation) {
      setInputLocation("");
      setInputNote("");
      setSuggestions([]);
    }
  };

  // --- Action: 刪除項目 ---
  const handleDeleteItem = (itemId) => {
    setItinerary(prev => prev.map(day => {
      if (day.day === activeDay) {
        return { ...day, items: day.items.filter(i => i.id !== itemId) };
      }
      return day;
    }));
  };

  // --- Action: 移動項目 ---
  const moveItem = (index, direction) => {
    const items = [...currentDayData.items];
    if (direction === 'up' && index > 0) {
      [items[index], items[index - 1]] = [items[index - 1], items[index]];
    } else if (direction === 'down' && index < items.length - 1) {
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
    }
    
    setItinerary(prev => prev.map(day => {
      if (day.day === activeDay) {
        return { ...day, items };
      }
      return day;
    }));
  };

  // --- Action: 更改時間 ---
  const handleStartTimeChange = (e) => {
    const newTime = e.target.value;
    setItinerary(prev => prev.map(day => {
      if (day.day === activeDay) return { ...day, startTime: newTime };
      return day;
    }));
  };

  // --- Action: 自動排序 ---
  const autoOptimizeRoute = () => {
    let items = [...currentDayData.items];
    if (items.length <= 2) {
      alert("景點太少，不需要排序喔！(至少需要3個)");
      return;
    }
    const startPoint = items[0];
    let optimized = [startPoint];
    let remaining = items.slice(1);
    let current = startPoint;

    // 最近鄰演算法
    while (remaining.length > 0) {
      const hasCoords = remaining.filter(i => i.coords);
      const noCoords = remaining.filter(i => !i.coords);

      if (hasCoords.length === 0) {
        optimized = [...optimized, ...noCoords];
        break;
      }
      if (!current.coords) {
         current = hasCoords[0];
         optimized.push(current);
         remaining = remaining.filter(r => r.id !== current.id);
         continue;
      }
      let nearest = hasCoords[0];
      let minDist = getDistance(current.coords, nearest.coords);
      for (let i = 1; i < hasCoords.length; i++) {
        const d = getDistance(current.coords, hasCoords[i].coords);
        if (d < minDist) {
          minDist = d;
          nearest = hasCoords[i];
        }
      }
      optimized.push(nearest);
      current = nearest;
      remaining = remaining.filter(r => r.id !== nearest.id);
    }
    
    setItinerary(prev => prev.map(day => {
      if (day.day === activeDay) return { ...day, items: optimized };
      return day;
    }));
  };

  // --- API: Gemini 呼叫 ---
  const callGeminiAPI = async (prompt) => {
    if (!apiKey) {
      setShowSettings(true);
      throw new Error("請先輸入 API Key");
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "API 連線失敗");
      }
      
      if (!data.candidates || !data.candidates[0].content) {
         throw new Error("AI 沒有回應，請重試");
      }

      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error(error);
      alert(`發生錯誤：${error.message}`);
      throw error;
    }
  };

  // --- API: AI 推薦下一站 ---
  const handleGetAISuggestions = async () => {
    setIsAiLoading(true);
    const currentSpots = currentDayData.items.map(i => i.name).join(", ");
    const prompt = `我正在大阪旅遊，今天的行程：${currentSpots}。請根據最後一個點，推薦 3 個順路的下一個可愛或必去的景點/店鋪。回傳純 JSON 格式，不要有 markdown 標記：[{"name":"名稱","reason":"很短的理由","type":"cafe/spot/shop"}]。`;
    try {
      let text = await callGeminiAPI(prompt);
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        setAiSuggestions(JSON.parse(text));
      } catch (e) {
        console.error("JSON Parse Error", text);
        alert("AI 回傳格式有誤，請再試一次");
      }
    } catch (e) {
      // Error handled in callGeminiAPI
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- API: 景點資訊 ---
  const handleGetSpotInfo = async (spotName) => {
    setModalContent({ type: 'info', title: spotName, loading: true });
    const prompt = `請用繁體中文，以「旅遊手帳」的口吻，可愛地介紹大阪景點「${spotName}」的必看亮點 (100字內)。`;
    try {
      const text = await callGeminiAPI(prompt);
      setModalContent({ type: 'info', title: spotName, content: text, loading: false });
    } catch (e) {
      setModalContent(null);
    }
  };

  // --- API: 美食資訊 ---
  const handleGetFood = async (spotName) => {
    setModalContent({ type: 'food', title: `${spotName} 附近美食`, loading: true });
    const prompt = `請推薦 3 家大阪「${spotName}」附近的可愛咖啡廳或高分美食。回傳純 JSON，不要有 markdown 標記：[{"name":"店名","type":"類型","rating":"4.5","comment":"可愛短評"}]`;
    try {
      let text = await callGeminiAPI(prompt);
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        const foodData = JSON.parse(text);
        setModalContent({ type: 'food', title: `${spotName} 附近美食`, data: foodData, loading: false });
      } catch (e) {
        alert("AI 找不到美食資料，請稍後再試");
        setModalContent(null);
      }
    } catch (e) {
      setModalContent(null);
    }
  };

  return (
    <div className="min-h-screen text-[#5a554e] flex flex-col md:flex-row" 
         style={{
           fontFamily: '"Zen Maru Gothic", sans-serif',
           backgroundColor: '#fcf9f2',
           backgroundImage: 'radial-gradient(#e5e0d3 1px, transparent 1px)',
           backgroundSize: '20px 20px'
         }}>
      
      {/* --- Modal: 設定 API Key --- */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border-4 border-[#e6ccb2]">
            <h2 className="text-xl font-bold text-[#8b5e3c] mb-2 flex items-center gap-2">
              <Settings className="w-5 h-5"/> 設定金鑰
            </h2>
            <p className="text-sm text-[#8b7e75] mb-4">
              為了讓 AI 導遊工作，請輸入您的 Google Gemini API Key。
              (我們會暫存在您的瀏覽器中)
            </p>
            <input 
              type="password" 
              placeholder="貼上 API Key (AIza...)" 
              className="w-full p-2 border border-[#dcd6ce] rounded mb-4 focus:outline-[#d4a373]"
              onChange={(e) => setApiKey(e.target.value)}
              value={apiKey}
            />
            <div className="flex justify-end gap-2">
              {apiKey && <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-[#9c948a]">取消</button>}
              <button 
                onClick={() => handleSaveKey(apiKey)}
                className="px-4 py-2 bg-[#e9c46a] text-white rounded-lg font-bold hover:bg-[#e0b855]"
              >
                儲存並開始
              </button>
            </div>
            <div className="mt-4 text-xs text-[#b0a89e] text-center">
              還沒有 Key? <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline text-[#e76f51]">點此免費取得</a>
            </div>
          </div>
        </div>
      )}

      {/* --- 左側區塊：主要操作介面 --- */}
      <div className="w-full md:w-1/2 p-4 md:p-6 flex flex-col h-screen overflow-hidden relative">
        
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div className="relative inline-block">
            <div className="absolute -inset-1 bg-[#e8d5c4] rotate-1 rounded-sm opacity-50"></div>
            <div className="relative bg-[#fffcf5] border-2 border-[#8b7e75] border-dashed px-6 py-3 rounded-lg shadow-sm flex items-center gap-3">
              <span className="text-3xl">🐙</span>
              <div>
                <h1 className="text-xl font-bold text-[#8b5e3c] tracking-wider">大阪散策手帳</h1>
                <p className="text-xs text-[#a69b91]">Osaka Trip Planner</p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 bg-white rounded-full shadow-sm text-[#b0a89e] hover:text-[#8b5e3c]">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 天數選擇 Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide items-end">
          {itinerary.map(d => (
            <button
              key={d.day}
              onClick={() => { setActiveDay(d.day); setAiSuggestions([]); }}
              className={`px-5 py-2 rounded-t-xl text-sm font-bold transition-all relative border-t border-x ${
                activeDay === d.day 
                  ? 'bg-[#fffcf5] text-[#8b5e3c] border-[#8b7e75] h-12 shadow-[0_-2px_5px_rgba(0,0,0,0.02)] z-10' 
                  : 'bg-[#e6e2d8] text-[#9c948a] border-transparent h-10 hover:bg-[#dedad0]'
              }`}
            >
              Day {d.day}
            </button>
          ))}
          <button 
            onClick={() => setItinerary([...itinerary, { id: itinerary.length + 1, day: itinerary.length + 1, startTime: "09:00", items: [] }])}
            className="w-10 h-10 rounded-full bg-[#c7dcc6] text-[#5c7a5b] hover:bg-[#b5d1b3] flex items-center justify-center shadow-sm mb-1 ml-1"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 主要內容容器 (筆記本風格) */}
        <div className="flex-1 bg-[#fffcf5] rounded-b-2xl rounded-tr-2xl border border-[#dcd6ce] shadow-sm p-4 flex flex-col overflow-hidden relative">
          
          {/* 每日開始時間設定 */}
          <div className="flex items-center justify-between mb-4 border-b-2 border-dashed border-[#e8d5c4] pb-3">
            <div className="flex items-center gap-2 text-sm text-[#8b7e75] bg-[#f2ede6] px-3 py-1.5 rounded-full">
              <Clock className="w-4 h-4 text-[#d4a373]" />
              <span>START:</span>
              <input 
                type="time" 
                value={currentDayData.startTime}
                onChange={handleStartTimeChange}
                className="bg-transparent border-b border-[#c4b9b0] focus:outline-none focus:border-[#d4a373] text-[#5a554e] font-mono text-center w-20"
              />
            </div>
            <button 
              onClick={autoOptimizeRoute}
              className="text-xs bg-[#cce3de] text-[#4a6b63] px-3 py-1.5 rounded-lg hover:bg-[#b6d6cf] flex items-center gap-1 shadow-sm transition-transform active:scale-95"
            >
              <Navigation className="w-3 h-3" />
              順路整理
            </button>
          </div>

          {/* 輸入/新增區塊 */}
          <div className="flex gap-2 mb-4 relative z-20 bg-[#fff8e1] p-2 rounded-lg border border-[#f0e6cc] shadow-sm transform -rotate-1">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputLocation}
                onChange={(e) => setInputLocation(e.target.value)}
                placeholder="想要去哪裡呢？"
                className="w-full bg-transparent px-2 py-1 focus:outline-none placeholder-[#c7c0b0]"
              />
              {/* 搜尋建議下拉選單 */}
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-[#e8d5c4] mt-2 rounded-lg shadow-lg z-50 overflow-hidden">
                  {suggestions.map(s => (
                    <div 
                      key={s} 
                      onClick={() => { setInputLocation(s); setSuggestions([]); }} 
                      className="px-3 py-2 hover:bg-[#fff9e6] cursor-pointer text-sm text-[#8b7e75]"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button 
              onClick={() => handleAddItem()} 
              className="bg-[#e9c46a] text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#e0b855] shadow-sm active:scale-95 transition-transform"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* 行程列表 (Scrollable) */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-0 pb-20 custom-scrollbar">
            {calculatedTimeline.length === 0 ? (
              <div className="text-center py-12 text-[#c7c0b0] flex flex-col items-center gap-3">
                <div className="w-20 h-20 bg-[#f2ede6] rounded-full flex items-center justify-center">
                  <Camera className="w-8 h-8 opacity-50" />
                </div>
                <p>還是一張白紙呢...</p>
              </div>
            ) : (
              calculatedTimeline.map((item, index) => (
                <div key={item.id} className="relative pl-2 pb-6 last:pb-0">
                  {/* 交通時間連接線 */}
                  {index > 0 && (
                    <div className="absolute left-[34px] -top-8 bottom-8 w-0 border-l-2 border-dashed border-[#dcd6ce] -z-10 flex items-center justify-center">
                      <div className="bg-[#fcf9f2] px-1 py-0.5 text-[10px] text-[#b0a89e] transform mt-4 rotate-90">
                         ⌛ {item.travelTimeFromPrev}分
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 items-start group">
                    {/* 時間標示 */}
                    <div className="flex flex-col items-center min-w-[65px] pt-1">
                      <div className="bg-[#e6ccb2] text-white text-[10px] px-2 py-0.5 rounded-full mb-1 shadow-sm font-mono">
                        {item.arrivalTime}
                      </div>
                      <div className="h-full w-0.5 bg-[#e8d5c4] my-1 relative opacity-50"></div>
                      <span className="text-[10px] text-[#b0a89e] font-mono">{item.departureTime}</span>
                    </div>

                    {/* 行程卡片 */}
                    <div className="flex-1 bg-white p-3 rounded-xl border border-[#ebe5dd] shadow-[2px_2px_0px_#f0eadd] hover:shadow-[3px_3px_0px_#e0d8c8] hover:-translate-y-0.5 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-[#6d665e] text-base flex items-center gap-1">
                            {item.name}
                            {item.coords && <span className="text-[10px] text-[#86b086] border border-[#86b086] px-1 rounded-full">OK</span>}
                          </h3>
                          <div className="text-xs text-[#a69b91] mt-1 flex items-center gap-2">
                             <Clock className="w-3 h-3" /> {item.duration}分
                          </div>
                        </div>
                        
                        <div className="flex gap-1.5">
                          <button onClick={() => handleGetFood(item.name)} className="w-7 h-7 flex items-center justify-center text-[#e76f51] bg-[#fff0ed] hover:bg-[#ffe0db] rounded-full transition-colors" title="找美食">
                            <Utensils className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleGetSpotInfo(item.name)} className="w-7 h-7 flex items-center justify-center text-[#2a9d8f] bg-[#e0fbfc] hover:bg-[#cbf7f9] rounded-full transition-colors" title="看介紹">
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="w-7 h-7 flex items-center justify-center text-[#d6ccc2] hover:text-[#e76f51] hover:bg-[#fff0ed] rounded-full" title="刪除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-sm text-[#8b7e75] bg-[#faf7f2] p-2 rounded-lg border-l-4 border-[#e6ccb2] flex items-center gap-2">
                        {item.note}
                      </div>

                      {/* 排序按鈕 */}
                      <div className="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="text-xs text-[#b0a89e] hover:text-[#8b5e3c] px-2 py-1 bg-[#f2ede6] rounded-md">⬆</button>
                         <button onClick={() => moveItem(index, 'down')} disabled={index === calculatedTimeline.length - 1} className="text-xs text-[#b0a89e] hover:text-[#8b5e3c] px-2 py-1 bg-[#f2ede6] rounded-md">⬇</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* AI 按鈕 */}
            <button
              onClick={handleGetAISuggestions}
              disabled={isAiLoading}
              className="mt-6 w-full py-3 bg-[#cce3de] text-[#4a6b63] rounded-xl border-2 border-dashed border-[#a4c3b2] flex items-center justify-center gap-2 text-sm font-bold hover:bg-[#b6d6cf] transition-all"
            >
              {isAiLoading ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles className="w-4 h-4"/>}
              請問 Gemini 醬下一站去哪？ ✨
            </button>

            {/* AI 建議結果卡片 */}
            {aiSuggestions.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-2 animate-in slide-in-from-bottom-2">
                {aiSuggestions.map((s, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-[#e8d5c4] shadow-sm flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#9d8189]"></div>
                    <div className="pl-2">
                      <div className="font-bold text-[#6d665e] text-sm flex items-center gap-2">
                        {s.name}
                        <span className="text-[10px] bg-[#f4acb7] text-white px-1.5 rounded-full">{s.type || "Spot"}</span>
                      </div>
                      <div className="text-xs text-[#9c948a] mt-0.5">{s.reason}</div>
                    </div>
                    <button 
                      onClick={() => handleAddItem(s.name, `✨ ${s.reason}`)} 
                      className="bg-[#9d8189] text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#866e75] active:scale-95 transition-transform"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* --- Modal 視窗 (資訊/美食) --- */}
        {modalContent && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#5a554e]/40 backdrop-blur-[2px] p-6">
             <div className="bg-[#fffcf5] w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-xl shadow-[5px_5px_0px_rgba(0,0,0,0.1)] p-0 animate-in zoom-in-95 duration-200 border-2 border-[#e6ccb2] flex flex-col relative">
               <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#e9c46a] opacity-80 rotate-1 shadow-sm"></div>
               <div className="p-5 pt-8 flex justify-between items-start border-b border-dashed border-[#e6ccb2]">
                 <h3 className="font-bold text-lg text-[#8b5e3c] flex items-center gap-2">
                   {modalContent.type === 'food' ? <Coffee className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                   {modalContent.title}
                 </h3>
                 <button onClick={() => setModalContent(null)} className="text-[#d6ccc2] hover:text-[#e76f51]">
                   <X className="w-6 h-6" />
                 </button>
               </div>
               <div className="p-6">
                 {modalContent.loading ? (
                   <div className="py-8 flex flex-col items-center justify-center text-[#d6ccc2] gap-2">
                     <Loader2 className="w-8 h-8 animate-spin text-[#e76f51]" />
                     <span className="text-sm">努力查詢中...</span>
                   </div>
                 ) : modalContent.type === 'food' && modalContent.data ? (
                   <div className="space-y-4">
                     {modalContent.data.map((food, idx) => (
                       <div key={idx} className="bg-white p-3 rounded border border-[#f0eadd] shadow-sm">
                         <div className="flex justify-between items-start mb-1">
                           <div className="font-bold text-[#6d665e]">{food.name}</div>
                           <div className="text-xs font-bold text-[#e76f51] bg-[#fff0ed] px-1.5 py-0.5 rounded-full">❤ {food.rating}</div>
                         </div>
                         <div className="flex gap-2 text-xs text-[#a69b91] mb-2">
                           <span className="bg-[#f2ede6] px-1.5 rounded">{food.type}</span>
                         </div>
                         <div className="text-sm text-[#8b7e75] border-t border-dashed border-[#f2ede6] pt-2 mb-2">{food.comment}</div>
                         
                         {/* ★★★ 新增：美食加入按鈕 ★★★ */}
                         <button 
                           onClick={() => {
                             handleAddItem(food.name, `🍽️ 美食: ${food.type}`);
                             setModalContent(null);
                           }}
                           className="w-full py-2 bg-[#f2ede6] text-[#8b5e3c] text-xs font-bold rounded flex items-center justify-center gap-1 hover:bg-[#e6ccb2] transition-colors"
                         >
                           <Plus className="w-3 h-3" /> 加入行程
                         </button>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <div className="text-sm text-[#6d665e] leading-relaxed tracking-wide">{modalContent.content}</div>
                 )}
               </div>
             </div>
          </div>
        )}
      </div>

      {/* --- 右側區塊：地圖視覺化 (全寬/響應式顯示) --- */}
      <div className="flex w-full md:w-1/2 min-h-[50vh] relative items-center justify-center p-8 bg-[#f2ede6] border-t-4 md:border-t-0 md:border-l-4 border-dashed border-[#e6ccb2]">
        <div className="w-full max-w-md aspect-[3/4] bg-white p-4 pb-16 shadow-[5px_5px_15px_rgba(0,0,0,0.05)] rotate-1 relative transition-transform hover:rotate-0 duration-500">
           <div className="w-full h-full bg-[#e0fbfc]/30 border border-[#e0fbfc] relative overflow-hidden">
             {/* 手繪裝飾背景 */}
             <div className="absolute top-10 left-10 w-32 h-32 bg-[#fff0ed] rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
             <div className="absolute bottom-10 right-10 w-40 h-40 bg-[#fbf8cc] rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
             
             <svg className="w-full h-full overflow-visible">
               {/* 連結線 */}
               <polyline 
                 points={calculatedTimeline.filter(i => i.coords).map(i => `${i.coords.x}%,${i.coords.y}%`).join(' ')}
                 fill="none"
                 stroke="#d6ccc2" 
                 strokeWidth="3"
                 strokeDasharray="6 4"
                 strokeLinecap="round"
               />
               {/* 景點與座標 */}
               {calculatedTimeline.map((item, index) => {
                 if (!item.coords) return null;
                 return (
                   <g key={item.id} className="transition-all duration-500 cursor-pointer hover:scale-110">
                     <circle cx={`${item.coords.x}%`} cy={`${item.coords.y}%`} r="8" fill={index === 0 ? "#e76f51" : "#fff"} stroke={index === 0 ? "#e76f51" : "#8b5e3c"} strokeWidth="2"/>
                     <text x={`${item.coords.x}%`} y={`${item.coords.y}%`} dy="-16" textAnchor="middle" className="text-[11px] font-bold fill-[#6d665e] font-['Zen_Maru_Gothic']" style={{textShadow: '1px 1px 0px white'}}>{index + 1}. {item.name}</text>
                     <text x={`${item.coords.x}%`} y={`${item.coords.y}%`} dy="20" textAnchor="middle" className="text-[9px] fill-[#9c948a] font-mono bg-white/50">{item.arrivalTime}</text>
                   </g>
                 );
               })}
             </svg>
             <div className="absolute top-[20%] left-[50%] -translate-x-1/2 text-[#2a9d8f]/20 text-4xl font-black rotate-12 select-none">KITA</div>
             <div className="absolute top-[65%] left-[50%] -translate-x-1/2 text-[#e76f51]/20 text-4xl font-black -rotate-6 select-none">MINAMI</div>
           </div>
           {/* 底部文字 */}
           <div className="absolute bottom-4 left-0 w-full text-center font-['Zen_Maru_Gothic'] text-[#8b5e3c] opacity-80 flex items-center justify-center gap-2">
              <Heart className="w-4 h-4 text-[#e76f51] fill-[#e76f51]" /> Day {activeDay} 的小旅行
           </div>
        </div>
      </div>
    </div>
  );
}
