/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, 
  Smartphone, 
  Sparkles, 
  MousePointer, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Terminal, 
  Copy, 
  Check, 
  Settings, 
  RefreshCw, 
  Play, 
  CheckCircle, 
  Fingerprint, 
  ArrowRight, 
  Radio,
  BookOpen,
  Info,
  Laptop
} from 'lucide-react';
import TouchpadControls from './components/TouchpadControls';
import { TrackerState, Coordinates } from './types';

export default function App() {
  // App-wide configuration and states
  const [trackerState, setTrackerState] = useState<TrackerState>('uninitialized');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  
  // Simulated Cursor coordinates (received or locally tracked)
  const [cursorPos, setCursorPos] = useState<Coordinates>({ x: 50, y: 50 });
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [clickTrigger, setClickTrigger] = useState<number>(0);
  const [doubleClickTrigger, setDoubleClickTrigger] = useState<number>(0);

  // Connection Session details
  const [sessionCode, setSessionCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('airpad_session_code');
      if (saved) return saved;
    } catch (_) {}
    // Generate a secure 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      localStorage.setItem('airpad_session_code', code);
    } catch (_) {}
    return code;
  });
  
  const [inputSessionCode, setInputSessionCode] = useState<string>('');
  const [currentRole, setCurrentRole] = useState<'standalone' | 'transmitter' | 'receiver'>('standalone');
  const [isTransmitterActive, setIsTransmitterActive] = useState<boolean>(false);

  // Script Copy confirmation indicator
  const [isScriptCopied, setIsScriptCopied] = useState<boolean>(false);
  const [authCookie, setAuthCookie] = useState<string>('');
  const [targetEnv, setTargetEnv] = useState<'local' | 'cloud'>('local');

  // Active status logs shown in the Guide Console
  const [bridgeLogs, setBridgeLogs] = useState<{ id: string; time: string; text: string; type: 'info' | 'success' | 'action' | 'error' }[]>([]);

  // Track the origin URL dynamically
  const [appUrl, setAppUrl] = useState<string>('https://ai.studio');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin);
    }
  }, []);

  const addBridgeLog = (text: string, type: 'info' | 'success' | 'action' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setBridgeLogs((prev) => [{ id: Math.random().toString(), time, text, type }, ...prev.slice(0, 14)]);
  };

  // 1. Initial greeting logs
  useEffect(() => {
    addBridgeLog(`Session system initialized. Code: ${sessionCode}`, 'info');
    addBridgeLog('Webcam neural tracking loaded and ready in browser sandbox.', 'success');
  }, [sessionCode]);

  // 2. Poll for coordinates if we are in 'receiver' (laptop screen) mode
  useEffect(() => {
    if (currentRole !== 'receiver') return;

    addBridgeLog(`Receiver Listening Mode activated for Session [${sessionCode}]`, 'success');
    
    const interval = setInterval(() => {
      fetch(`/api/coords?session=${sessionCode}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.lastUpdated > 0) {
            setCursorPos({ x: data.x, y: data.y });
            setIsPinching(data.active && data.click); // Simulating hover/click pinch visualizer
            
            if (data.click) {
              setClickTrigger((prev) => prev + 1);
              addBridgeLog(`🖱️ Click payload received from session transmitter`, 'action');
            }
            if (data.doubleClick) {
              setDoubleClickTrigger((prev) => prev + 1);
              addBridgeLog(`⚡ Double-Click payload received from session transmitter`, 'success');
            }
          }
        })
        .catch((err) => {
          console.warn("Failed to retrieve bridge coordinates:", err);
        });
    }, 45); // ~22Hz polling for lightweight transmission

    return () => {
      clearInterval(interval);
      addBridgeLog('Receiver mode deactivated.', 'info');
    };
  }, [currentRole, sessionCode]);

  // 3. Post coordinates to API if we are in 'transmitter' mode or 'standalone' mode
  // Whenever coordinates or click triggers change, we transmit them so the Python script or receiver tab can capture them!
  const lastSentRef = useRef<number>(0);
  const lastSentDraggingRef = useRef<boolean>(false);
  const isPinchingRef = useRef<boolean>(false);
  isPinchingRef.current = isPinching;

  const transmitCoordinates = (coords: Coordinates, click = false, doubleClick = false, dragging = false) => {
    const now = Date.now();
    // Throttle cursor movements to ~12ms (~83Hz) to maximize responsiveness, but allow click/dragging status packets to pass immediately
    const isSpecialPacket = click || doubleClick || dragging !== lastSentDraggingRef.current;
    if (now - lastSentRef.current < 12 && !isSpecialPacket) {
      return;
    }
    lastSentRef.current = now;
    lastSentDraggingRef.current = dragging;

    fetch(`/api/coords?session=${sessionCode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x: coords.x,
        y: coords.y,
        click,
        doubleClick,
        dragging,
        active: true,
      }),
    }).catch(() => {});
  };

  // Handle local cursor moves from webcam touchpad
  const handleLocalCursorMove = (coords: Coordinates, isDragging = false) => {
    setCursorPos(coords);
    if (currentRole === 'transmitter' || currentRole === 'standalone') {
      transmitCoordinates(coords, false, false, isDragging);
    }
  };

  // Handle local click gestures from webcam touchpad
  const handleLocalSingleClick = () => {
    setClickTrigger((prev) => prev + 1);
    addBridgeLog('Local Pinch click registered.', 'action');
    if (currentRole === 'transmitter' || currentRole === 'standalone') {
      transmitCoordinates(cursorPos, true, false, false);
    }
  };

  const handleLocalDoubleClick = () => {
    setDoubleClickTrigger((prev) => prev + 1);
    addBridgeLog('Local Double-Pinch click registered.', 'success');
    if (currentRole === 'transmitter' || currentRole === 'standalone') {
      transmitCoordinates(cursorPos, false, true, false);
    }
  };

  const handlePinchChange = (pinching: boolean) => {
    setIsPinching(pinching);
  };

  // Auto-collapse camera panel when connected to focus on setup guide
  useEffect(() => {
    if (trackerState === 'connected') {
      setIsSidebarOpen(false);
      addBridgeLog('Tracker calibrated! Camera collapsed for workspace visibility.', 'success');
    }
  }, [trackerState]);

  // Python Script Code Generation with dynamic URL insertion
  const pythonScriptCode = `import requests
import pyautogui
import time

# --- CONFIGURATION ---
# The URL of your active Air Touchpad session backend
BRIDGE_URL = "${targetEnv === 'local' ? 'http://localhost:3000' : appUrl}/api/coords?session=${sessionCode}"
SESSION_CODE = "${sessionCode}"
${targetEnv === 'cloud' ? `
# Dev Sandbox Authentication Cookie (Optional / Required for secure environments)
# If the console outputs "Failed to parse backend JSON", copy your browser Cookie header and paste it here.
COOKIE = """${authCookie || 'PASTE_YOUR_COOKIE_HERE'}"""` : ''}

# Sensitivity scaling factor
SENSITIVITY = 1.0
# ---------------------

pyautogui.FAILSAFE = True
# CRITICAL LATENCY FIX: Remove pyautogui's default 100ms artificial delay after each command
pyautogui.PAUSE = 0.0
screen_width, screen_height = pyautogui.size()

headers = {}
${targetEnv === 'cloud' ? `if COOKIE and COOKIE != "PASTE_YOUR_COOKIE_HERE":
    headers["Cookie"] = COOKIE` : ''}

print("=====================================================")
print("  AERO AIR TOUCHPAD PHYSICAL COMPUTER BRIDGE CLIENT")
print("=====================================================")
print(f"Connected to Session: {SESSION_CODE}")
print(f"Polling from: {BRIDGE_URL}")
print("Move your index finger to control this screen.")
print("Press Ctrl+C inside this terminal to exit.")
print("=====================================================")

last_x, last_y = screen_width // 2, screen_height // 2
is_mouse_down = False

# CRITICAL LATENCY FIX: Use requests.Session() to enable TCP connection keep-alive
# This reduces HTTP request round-trip latency by up to 10x!
client = requests.Session()

while True:
    try:
        # Fetch the latest coordinate package from the browser cloud backend
        response = client.get(BRIDGE_URL, ${targetEnv === 'cloud' ? 'headers=headers, ' : ''}timeout=1)
        if response.status_code == 200:
            try:
                data = response.json()
            except ValueError as ve:
                print("\\n[Auth/Proxy Notice] The response from the server is not valid JSON.")
                ${targetEnv === 'cloud' ? `print("If you are running in a secure sandbox, your browser Cookie must be passed.")
                print("Please copy the Cookie header from your browser DevTools (F12 -> Network) and paste it into the COOKIE field in this script.\\n")` : `print("Please make sure your local server is running on http://localhost:3000 by executing 'npm run dev' first.")`}
                time.sleep(4.0)
                continue
            
            # Map 0-100 coordinates directly to your physical display coordinates
            target_x = int((data["x"] / 100.0) * screen_width)
            target_y = int((data["y"] / 100.0) * screen_height)
            
            # Highly responsive interpolation (0.15 smoothing / 0.85 snap) to minimize latency while keeping path stable
            curr_x = int(last_x * 0.15 + target_x * 0.85)
            curr_y = int(last_y * 0.15 + target_y * 0.85)
            
            # Smoothly position physical mouse pointer
            pyautogui.moveTo(curr_x, curr_y)
            last_x, last_y = curr_x, curr_y
            
            # Handle continuous click-and-drag status
            dragging = data.get("dragging", False)
            if dragging:
                if not is_mouse_down:
                    pyautogui.mouseDown()
                    is_mouse_down = True
                    print("[Action] Mouse Down (Drag Start)")
            else:
                if is_mouse_down:
                    pyautogui.mouseUp()
                    is_mouse_down = False
                    print("[Action] Mouse Up (Drag End)")

            # Trigger OS hardware clicks based on browser hand gestures
            if data.get("click"):
                pyautogui.click()
                print("[Action] Single Click Executed")
            elif data.get("doubleClick"):
                pyautogui.doubleClick()
                print("[Action] Double Click Executed")
                
        # High sample rate (up to 100Hz) for near real-time tracking
        time.sleep(0.01)
        
    except KeyboardInterrupt:
        if is_mouse_down:
            pyautogui.mouseUp()
        print("\\nBridge terminated safely. Goodbye!")
        break
    except Exception as e:
        print(f"Reconnecting to backend: {e}")
        time.sleep(1.5)
`;

  const copyPythonScript = () => {
    navigator.clipboard.writeText(pythonScriptCode);
    setIsScriptCopied(true);
    addBridgeLog('Python bridge script copied to clipboard.', 'success');
    setTimeout(() => setIsScriptCopied(false), 2000);
  };

  // Touch Trackpad for Smartphone Mode
  const trackpadRef = useRef<HTMLDivElement | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!trackpadRef.current) return;
    const rect = trackpadRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    const nextCoords = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    setCursorPos(nextCoords);
    setIsPinching(true);
    transmitCoordinates(nextCoords, false, false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!trackpadRef.current) return;
    const rect = trackpadRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    const nextCoords = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    setCursorPos(nextCoords);
    transmitCoordinates(nextCoords, false, false);
  };

  const handleTouchEnd = () => {
    setIsPinching(false);
    // On release, trigger a click!
    transmitCoordinates(cursorPos, true, false);
    addBridgeLog('Trackpad tap registered as Click event', 'action');
  };

  const joinSession = () => {
    if (inputSessionCode.trim().length === 4) {
      setSessionCode(inputSessionCode.trim().toUpperCase());
      setCurrentRole('receiver');
      addBridgeLog(`Switched session connection to: ${inputSessionCode.trim().toUpperCase()}`, 'info');
    }
  };

  const resetToStandalone = () => {
    setCurrentRole('standalone');
    addBridgeLog('Reset session to Local Standalone Mode.', 'info');
  };

  // QR Code generator URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(appUrl)}`;

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* HEADER SECTION */}
      <header className="border-b border-slate-900 bg-slate-950/85 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Headline */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-radial from-cyan-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/10">
              <Fingerprint className="w-5.5 h-5.5 text-slate-950 font-black animate-pulse" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg md:text-xl tracking-tight text-slate-100 flex items-center gap-2">
                Air Touchpad <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 border border-cyan-800/50 px-2 py-0.5 rounded-full uppercase">Neural Bridge</span>
              </h1>
              <p className="text-3xs md:text-2xs text-slate-400 font-sans mt-0.5">Control your physical computer and phone screens with browser-driven webcam hand gestures.</p>
            </div>
          </div>

          {/* Controller View Toggle bar */}
          <div className="flex items-center gap-3 self-start md:self-auto font-mono text-3xs text-slate-500 bg-slate-900/40 border border-slate-850 px-3 py-1.5 rounded-lg">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${trackerState === 'connected' ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`}></span>
              CAMERA: {trackerState === 'connected' ? 'CALIBRATED' : trackerState === 'scanning' ? 'CALIBRATING...' : 'WAITING'}
            </span>
            <div className="w-px h-3 bg-slate-800" />
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-bold transition-colors cursor-pointer"
            >
              {isSidebarOpen ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {isSidebarOpen ? 'COLLAPSE CAMERA' : 'EXPAND CAMERA'}
            </button>
          </div>

        </div>
      </header>

      {/* MAIN WORKBENCH PANEL */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch relative">
        
        {/* LEFT COLUMN: Air Touchpad camera engine */}
        <div className={isSidebarOpen 
          ? "lg:col-span-5 flex flex-col gap-6 transition-all duration-300 transform scale-100 opacity-100" 
          : "fixed bottom-6 right-6 w-64 md:w-72 aspect-video z-50 pointer-events-auto transition-all duration-300 transform scale-100 opacity-100 rounded-xl shadow-2xl"
        }>
          <TouchpadControls
            isMinimized={!isSidebarOpen}
            trackerState={trackerState}
            setTrackerState={setTrackerState}
            onCursorMove={handleLocalCursorMove}
            onSingleClick={handleLocalSingleClick}
            onDoubleClick={handleLocalDoubleClick}
            onStreamReady={setWebcamStream}
            onPinchChange={handlePinchChange}
          />
        </div>

        {/* RIGHT COLUMN: Interactive Guidelines & Device Sync Hub */}
        <div 
          id="device_sync_hub_container" 
          className={`${isSidebarOpen ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all duration-300 bg-slate-900/40 border border-slate-850 rounded-2xl p-5 md:p-6 flex flex-col gap-6 shadow-2xl relative`}
        >
          {/* Section title */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-850 text-2xs font-semibold text-slate-300 cursor-pointer transition-all"
                title={isSidebarOpen ? "Hide Webcam stream" : "Show Webcam stream"}
              >
                {isSidebarOpen ? <ChevronLeft className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{isSidebarOpen ? 'Hide Camera' : 'Show Camera'}</span>
              </button>
              <div>
                <h2 className="font-display font-medium text-slate-200 text-sm">Physical Device Bridge Center</h2>
                <p className="text-3xs text-slate-500 mt-0.5">Control actual desktop hardware and phone screens using local AI model streams.</p>
              </div>
            </div>
            
            {/* Live Session code display */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
              <span className="text-4xs font-mono text-slate-500 uppercase">Session Code</span>
              <span className="text-xs font-mono font-bold text-cyan-400 select-all tracking-wider">{sessionCode}</span>
            </div>
          </div>

          {/* LIVE GRAPHICAL COORDINATE INTERACTION CARD */}
          <div className="bg-slate-950/60 border border-slate-850/80 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono text-slate-400 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> Local Cursor Tracker Output
              </h3>
              <span className="text-3xs font-mono text-slate-500">
                X: <strong className="text-cyan-400">{Math.round(cursorPos.x)}%</strong> | Y: <strong className="text-cyan-400">{Math.round(cursorPos.y)}%</strong>
              </span>
            </div>
            
            {/* Interactive Grid visualization */}
            <div className="relative aspect-[21/9] w-full rounded-lg bg-slate-950 border border-slate-900/80 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#06b6d4_1px,transparent_1px),linear-gradient(to_bottom,#06b6d4_1px,transparent_1px)] bg-[size:24px_24px]" />
              
              {/* Central crosshairs */}
              <div className="absolute w-px h-full bg-cyan-500/5" />
              <div className="absolute h-px w-full bg-cyan-500/5" />
              
              {/* Real-time pointer */}
              <div 
                className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out flex items-center justify-center pointer-events-none"
                style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
              >
                <div className={`rounded-full flex items-center justify-center transition-all ${isPinching ? 'bg-emerald-500/30 scale-125 border-2 border-emerald-400' : 'bg-cyan-500/20 scale-100 border border-cyan-400'}`}>
                  <MousePointer className={`w-3.5 h-3.5 ${isPinching ? 'text-emerald-400' : 'text-cyan-400'}`} />
                </div>
                {/* Visual cursor coordinate banner */}
                <div className="absolute top-7 bg-slate-950 border border-slate-800 text-[8px] font-mono font-bold text-slate-400 px-1 py-0.5 rounded shadow">
                  ({Math.round(cursorPos.x)}, {Math.round(cursorPos.y)})
                </div>
              </div>

              {/* Connected role flag */}
              <div className="absolute top-3 left-3 bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded text-4xs font-mono text-slate-400 uppercase">
                Mode: {currentRole === 'receiver' ? 'Receiver (Listening)' : currentRole === 'transmitter' ? 'Transmitter (Broadcasting)' : 'Local Standalone'}
              </div>
            </div>
          </div>

          {/* RULES OF USE & GESTURES PANEL */}
          <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl flex flex-col gap-3">
            <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
              <BookOpen className="w-4 h-4" /> Rules of How to Use (Hand Gestures)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-2xs leading-relaxed font-sans text-slate-400">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">01</span>
                <div>
                  <h4 className="font-semibold text-slate-200">Optimal Camera Setup</h4>
                  <p className="text-3xs mt-0.5 text-slate-400">Position your physical hand 1 to 2 feet away from your webcam. Ensure proper lighting and a clean neutral background.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">02</span>
                <div>
                  <h4 className="font-semibold text-slate-200">Synchronization Calibration</h4>
                  <p className="text-3xs mt-0.5 text-slate-400">Place your index finger in the cyan target ring on the camera window. Hold steady until calibration matches 100%.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">03</span>
                <div>
                  <h4 className="font-semibold text-slate-200">Pinch Gesture (Left Click)</h4>
                  <p className="text-3xs mt-0.5 text-slate-400">Join your thumb tip and index finger tip together and release. This registers a standard single left-click instantly.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">04</span>
                <div>
                  <h4 className="font-semibold text-slate-200">Double Pinch (Double-Click)</h4>
                  <p className="text-3xs mt-0.5 text-slate-400">Pinch and release twice rapidly (within 380ms) to trigger a mouse double-click, opening icons or system files.</p>
                </div>
              </div>
            </div>
          </div>

          {/* TWO INTEGRATED BRIDGING WORKSPACES (DESKTOP BRIDGE & SMARTPHONE SYNC) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* WORKSPACE A: Physical Desktop OS Bridge */}
            <div className="bg-slate-950/80 border border-slate-850 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-display font-medium text-slate-200">🖥️ Desktop Cursor Bridge</h3>
                </div>
              </div>

              {/* Environment Mode Selector Buttons */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-850 rounded-lg text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setTargetEnv('local');
                    addBridgeLog('Switched Python Bridge target to Localhost (unauthenticated).', 'info');
                  }}
                  className={`py-1.5 px-2 rounded-md transition-all text-center font-bold cursor-pointer ${
                    targetEnv === 'local'
                      ? 'bg-cyan-950 border border-cyan-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Local Server (No Auth)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetEnv('cloud');
                    addBridgeLog('Switched Python Bridge target to Cloud Sandbox (Pre-auth).', 'info');
                  }}
                  className={`py-1.5 px-2 rounded-md transition-all text-center font-bold cursor-pointer ${
                    targetEnv === 'cloud'
                      ? 'bg-cyan-950 border border-cyan-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cloud Sandbox (With Cookie)
                </button>
              </div>

              {targetEnv === 'local' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                    <strong>Zero-Cookie Local Method:</strong> Download and run this app's server on your own computer. This completely exposes an unauthenticated local API endpoint on your machine!
                  </p>
                  
                  {/* Local step guide */}
                  <div className="bg-slate-900/30 border border-slate-850/60 p-2.5 rounded-lg space-y-2 text-[10px] text-slate-300 font-sans">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold font-mono text-[9px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <strong className="text-slate-200">Download ZIP:</strong> Click the <strong className="text-cyan-400">Settings</strong> menu (top-right of AI Studio) &rarr; <strong className="text-slate-200">Export as ZIP</strong>.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold font-mono text-[9px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div>
                        <strong className="text-slate-200">Install Packages:</strong> Extract the ZIP on your system, open your terminal inside that directory, and run:
                        <code className="block mt-1 bg-slate-950 px-2 py-1 rounded text-cyan-300 font-mono text-[9px] border border-slate-850">npm install</code>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold font-mono text-[9px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <strong className="text-slate-200">Start Server:</strong> Run the Express backend server locally on port 3000:
                        <code className="block mt-1 bg-slate-950 px-2 py-1 rounded text-cyan-300 font-mono text-[9px] border border-slate-850">npm run dev</code>
                        <span className="text-[9px] text-slate-500 mt-1 block">Then open <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">http://localhost:3000</a> in your desktop browser.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold font-mono text-[9px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                      <div>
                        <strong className="text-slate-200">Run Python Bridge:</strong> Start the client on your system. It links with your local server instantly!
                        <code className="block mt-1 bg-slate-950 px-2 py-1 rounded text-cyan-300 font-mono text-[9px] border border-slate-850">pip install pyautogui requests</code>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                    Connect directly to the secure remote AI Studio preview environment. Because our cloud sandboxes are privately protected, you must paste your browser session cookie.
                  </p>

                  {/* Sandbox Auth proxy cookie resolver */}
                  <div className="bg-cyan-950/20 border border-cyan-900/30 p-2.5 rounded-lg flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> Sandbox Auth Cookie (Required)
                      </span>
                      <span className="text-[8px] font-mono text-slate-500">Secure Proxy Bypass</span>
                    </div>
                    <p className="text-[9px] text-slate-400 font-sans leading-normal">
                      Paste your active browser Cookie below to update the Python script configuration in real-time:
                    </p>
                    <div className="flex gap-1.5">
                      <input 
                        type="password"
                        placeholder="Paste Cookie here (e.g. __Host-oauth-proxy-session=...)"
                        value={authCookie}
                        onChange={(e) => setAuthCookie(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-[9px] font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                      {authCookie && (
                        <button 
                          onClick={() => setAuthCookie('')}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-3xs rounded font-mono font-bold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <details className="text-[8px] text-slate-400/80 cursor-pointer">
                      <summary className="hover:text-slate-300 font-medium select-none text-[8px] text-cyan-400/80">How to get your browser cookie in 15 seconds?</summary>
                      <ol className="list-decimal pl-3 mt-1.5 space-y-1 text-slate-400 leading-normal font-sans">
                        <li>Press <kbd className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono text-[8px]">F12</kbd> (or right-click → Inspect) to open DevTools.</li>
                        <li>Select the <strong className="text-slate-300">Network</strong> tab and refresh this page.</li>
                        <li>Click on the first line in the list (e.g. <code className="text-cyan-400">coords</code> or <code className="text-cyan-400">/</code>).</li>
                        <li>Scroll down to the <strong className="text-slate-300">Request Headers</strong> section.</li>
                        <li>Find the <code className="text-cyan-400">Cookie:</code> header, select and copy its entire value.</li>
                        <li>Paste it in the field above!</li>
                      </ol>
                    </details>
                  </div>
                </div>
              )}

              {/* Code Script block with copy option */}
              <div className="relative group">
                <div className="bg-slate-950 border border-slate-900 rounded-lg p-2.5 font-mono text-[8px] text-slate-400 h-[110px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-850 select-text">
                  <pre className="whitespace-pre-wrap">{pythonScriptCode}</pre>
                </div>
                <button
                  onClick={copyPythonScript}
                  className="absolute bottom-2 right-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white p-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  title="Copy Python Code"
                >
                  {isScriptCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[8px] font-bold text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[8px] font-bold">Copy Script</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* WORKSPACE B: Mobile Phone Sync Screen */}
            <div className="bg-slate-950/80 border border-slate-850 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-display font-medium text-slate-200">📱 Control on Phone Screen</h3>
              </div>
              
              <div className="flex flex-col gap-3 flex-1 justify-between">
                <div>
                  <p className="text-3xs text-slate-400 leading-normal font-sans mb-2">
                    Turn your smartphone into a remote trackpad controller! Open this page on your smartphone browser to broadcast input packages.
                  </p>

                  {/* QR Code integration */}
                  <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-850 p-2 rounded-lg">
                    <img 
                      src={qrCodeUrl} 
                      alt="QR Code to scan" 
                      className="w-16 h-16 rounded border border-slate-850 shrink-0 bg-white"
                      referrerPolicy="no-referrer"
                    />
                    <div className="font-sans text-[10px]">
                      <p className="text-slate-300 font-semibold">Scan QR Code</p>
                      <p className="text-slate-500 text-3xs mt-0.5 leading-normal">Point your phone's camera at this code to load the workspace instantly.</p>
                      <span className="text-cyan-400 font-mono text-[9px] mt-1 block select-all truncate max-w-[150px]">{appUrl}</span>
                    </div>
                  </div>
                </div>

                {/* Smartphone configuration block */}
                <div className="border-t border-slate-850 pt-2.5 mt-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-mono text-slate-400 uppercase">Interactive Device Roles</span>
                  </div>

                  {currentRole === 'transmitter' ? (
                    // Transmitter touch pad block
                    <div className="flex flex-col gap-2">
                      <div 
                        ref={trackpadRef}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg aspect-video flex flex-col items-center justify-center text-center cursor-crosshair select-none relative"
                      >
                        <MousePointer className="w-6 h-6 text-cyan-400 animate-pulse mb-1" />
                        <span className="text-3xs font-mono text-cyan-400 font-bold uppercase">Phone Drag Trackpad</span>
                        <span className="text-[8px] font-sans text-slate-500">Slide your thumb here to transmit mouse cursor inputs!</span>
                      </div>
                      <button 
                        onClick={resetToStandalone}
                        className="w-full py-1 text-4xs font-mono bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700 rounded transition-colors cursor-pointer"
                      >
                        Exit Transmitter Mode
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setCurrentRole('transmitter');
                          addBridgeLog('Broadcasting mode activated.', 'info');
                        }}
                        className="py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-3xs font-mono rounded flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md"
                      >
                        Transmitter Mode
                      </button>
                      
                      <button
                        onClick={() => {
                          setCurrentRole('receiver');
                        }}
                        className="py-1.5 px-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 font-medium text-3xs font-mono rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        Receiver Mode
                      </button>
                    </div>
                  )}
                  
                  {/* Join external session code inputs */}
                  {currentRole !== 'transmitter' && (
                    <div className="flex gap-1.5 mt-1">
                      <input 
                        type="text"
                        maxLength={4}
                        placeholder="ENTER SESSION CODE"
                        value={inputSessionCode}
                        onChange={(e) => setInputSessionCode(e.target.value.toUpperCase())}
                        className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-3xs font-mono text-slate-300 uppercase tracking-widest text-center"
                      />
                      <button
                        onClick={joinSession}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-cyan-400 text-3xs font-mono rounded transition-all cursor-pointer font-bold"
                      >
                        Connect
                      </button>
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>

          {/* REAL-TIME SYSTEM LOG CONSOLE */}
          <div className="flex-1 flex flex-col min-h-[140px] max-h-[170px] bg-slate-950 border border-slate-850 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 mb-1.5">
              <span className="text-3xs font-mono text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Terminal className="w-3.5 h-3.5" /> Bridge Console Logging Output
              </span>
              <button 
                onClick={() => setBridgeLogs([])}
                className="text-4xs font-mono text-cyan-400/80 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Clear Log
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-4xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent select-text">
              {bridgeLogs.length === 0 ? (
                <div className="text-slate-600 text-center py-4">System listening for events...</div>
              ) : (
                bridgeLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 leading-normal">
                    <span className="text-slate-600 font-semibold shrink-0">[{log.time}]</span>
                    <span className={`
                      ${log.type === 'success' ? 'text-emerald-400 font-medium' : ''}
                      ${log.type === 'action' ? 'text-cyan-400 font-medium animate-pulse' : ''}
                      ${log.type === 'info' ? 'text-slate-300' : ''}
                      ${log.type === 'error' ? 'text-rose-400' : ''}
                    `}>
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>

      {/* FOOTER METADATA */}
      <footer className="border-t border-slate-900 bg-slate-950 text-slate-600 text-4xs font-mono py-4 text-center">
        <p>© 2026 AeroOS Space Mechanics Lab. Powered by custom in-browser GPU hand tracking & coordinate bridge APIs.</p>
      </footer>

    </div>
  );
}
