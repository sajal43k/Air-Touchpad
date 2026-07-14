/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, Play, CheckCircle, RefreshCw, AlertCircle, Info, Fingerprint } from 'lucide-react';
import { TrackerState, Coordinates } from '../types';

interface TouchpadControlsProps {
  trackerState: TrackerState;
  setTrackerState: (state: TrackerState) => void;
  onCursorMove: (coords: Coordinates) => void;
  onSingleClick: () => void;
  onDoubleClick: () => void;
  onStreamReady?: (stream: MediaStream) => void;
  onPinchChange?: (pinching: boolean) => void;
  isMinimized?: boolean;
}

export default function TouchpadControls({
  trackerState,
  setTrackerState,
  onCursorMove,
  onSingleClick,
  onDoubleClick,
  onStreamReady,
  onPinchChange,
  isMinimized = false,
}: TouchpadControlsProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [loadingModel, setLoadingModel] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isTrackingActive, setIsTrackingActive] = useState<boolean>(false);
  
  // Tracking parameters
  const [sensitivity, setSensitivity] = useState<number>(1.5); // 1.0 to 3.0
  const [smoothing, setSmoothing] = useState<number>(0.75); // 0.0 to 0.95 (higher = smoother, lower = faster)
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  
  // Interactive stats shown in UI
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [pinchDistance, setPinchDistance] = useState<number>(1);
  const [pinchActive, setPinchActive] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [logs, setLogs] = useState<{ id: string; time: string; text: string; type: 'info' | 'success' | 'action' | 'error' }[]>([]);

  // Smooth position state
  const lastPosRef = useRef<Coordinates>({ x: 50, y: 50 });
  const lastPinchRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const scanProgressRef = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);

  // Helper to add logs
  const addLog = (text: string, type: 'info' | 'success' | 'action' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLogs((prev) => [{ id: Math.random().toString(), time, text, type }, ...prev.slice(0, 19)]);
  };

  // Check and wait for CDN loading, with robust dynamic injection fallback
  useEffect(() => {
    let checkCount = 0;
    const checkLibs = setInterval(() => {
      if ((window as any).Hands && (window as any).Camera) {
        setLoadingModel(false);
        clearInterval(checkLibs);
        addLog('MediaPipe tracking engine loaded successfully.', 'success');
        return;
      }

      checkCount++;
      // After 3 seconds (6 checks), if they are still not loaded, try to inject them dynamically without crossorigin
      if (checkCount === 6) {
        addLog('Scripts taking longer to load. Injecting CDN fallbacks...', 'info');
        
        if (!(window as any).Camera) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
          script.async = true;
          document.head.appendChild(script);
        }
        
        if (!(window as any).Hands) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
          script.async = true;
          document.head.appendChild(script);
        }
      }

      // After 10 seconds (20 checks), if still not loaded, try UNPKG fallback
      if (checkCount === 20) {
        addLog('jsDelivr timed out. Attempting unpkg.com fallbacks...', 'error');
        
        const scriptCam = document.createElement('script');
        scriptCam.src = 'https://unpkg.com/@mediapipe/camera_utils/camera_utils.js';
        scriptCam.async = true;
        document.head.appendChild(scriptCam);

        const scriptHands = document.createElement('script');
        scriptHands.src = 'https://unpkg.com/@mediapipe/hands/hands.js';
        scriptHands.async = true;
        document.head.appendChild(scriptHands);
      }

      // After 30 seconds, if still failing, show error
      if (checkCount > 60) {
        clearInterval(checkLibs);
        setErrorMessage('Failed to load MediaPipe from any CDN. Please check your internet connection or reload.');
        addLog('Failed to load tracking engines. All CDN sources failed.', 'error');
      }
    }, 500);

    return () => clearInterval(checkLibs);
  }, []);

  // Keep refs to avoid stale closures in MediaPipe and requestAnimationFrame loops
  const trackerStateRef = useRef<TrackerState>(trackerState);
  const isMirroredRef = useRef<boolean>(isMirrored);
  const sensitivityRef = useRef<number>(sensitivity);
  const smoothingRef = useRef<number>(smoothing);
  const handDetectedRef = useRef<boolean>(handDetected);
  const onCursorMoveRef = useRef(onCursorMove);
  const onPinchChangeRef = useRef(onPinchChange);
  const onSingleClickRef = useRef(onSingleClick);
  const onDoubleClickRef = useRef(onDoubleClick);

  useEffect(() => { trackerStateRef.current = trackerState; }, [trackerState]);
  useEffect(() => { isMirroredRef.current = isMirrored; }, [isMirrored]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { smoothingRef.current = smoothing; }, [smoothing]);
  useEffect(() => { handDetectedRef.current = handDetected; }, [handDetected]);
  useEffect(() => { onCursorMoveRef.current = onCursorMove; }, [onCursorMove]);
  useEffect(() => { onPinchChangeRef.current = onPinchChange; }, [onPinchChange]);
  useEffect(() => { onSingleClickRef.current = onSingleClick; }, [onSingleClick]);
  useEffect(() => { onDoubleClickRef.current = onDoubleClick; }, [onDoubleClick]);

  // Keep track of the latest hand tracking results in a ref to avoid stale closures
  const latestResultsRef = useRef<any>(null);

  // Unified 60 FPS Canvas Render Loop for incredibly smooth animations and instant drawing
  useEffect(() => {
    let active = true;
    
    const renderLoop = () => {
      if (!active) return;
      
      const canvas = canvasRef.current;
      if (canvas && isTrackingActive && trackerStateRef.current !== 'error') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 1. Clear previous canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // 2. Draw Cyan calibration circle if scanning (drawn IMMEDIATELY on camera start)
          if (trackerStateRef.current === 'scanning') {
            const targetNormalX = 0.5;
            const targetNormalY = 0.45;
            const targetCanvasRadius = 35;
            const targetCanvasX = (isMirroredRef.current ? (1 - targetNormalX) : targetNormalX) * canvas.width;
            const targetCanvasY = targetNormalY * canvas.height;

            // Draw target circle
            ctx.beginPath();
            ctx.arc(targetCanvasX, targetCanvasY, targetCanvasRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#06b6d4'; // Cyan
            ctx.lineWidth = 3;
            ctx.stroke();

            // Pulsing outer scan ring
            const pulseRadius = targetCanvasRadius + Math.sin(Date.now() / 150) * 8;
            ctx.beginPath();
            ctx.arc(targetCanvasX, targetCanvasY, pulseRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Draw crosshairs
            ctx.beginPath();
            ctx.moveTo(targetCanvasX - 15, targetCanvasY);
            ctx.lineTo(targetCanvasX + 15, targetCanvasY);
            ctx.moveTo(targetCanvasX, targetCanvasY - 15);
            ctx.lineTo(targetCanvasX, targetCanvasY + 15);
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          
          // 3. Draw hand skeleton if results are available
          const results = latestResultsRef.current;
          if (results && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            drawHandSkeleton(ctx, results.multiHandLandmarks[0], canvas.width, canvas.height);
          }
        }
      }
      
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      active = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isTrackingActive]);

  // Initialize MediaPipe Hands
  useEffect(() => {
    if (!isTrackingActive || loadingModel || !videoRef.current || !canvasRef.current) return;

    let active = true;
    let cameraInstance: any = null;
    let handsInstance: any = null;

    try {
      const HandsClass = (window as any).Hands;
      const CameraClass = (window as any).Camera;

      handsInstance = new HandsClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      handsInstance.onResults((results: any) => {
        if (!active) return;
        handleResults(results);
      });

      cameraInstance = new CameraClass(videoRef.current, {
        onFrame: async () => {
          if (!active) return;
          if (videoRef.current && handsInstance) {
            try {
              await handsInstance.send({ image: videoRef.current });
            } catch (err) {
              console.warn("MediaPipe send error caught:", err);
            }
          }
        },
        width: 640,
        height: 480,
      });

      cameraInstance.start()
        .then(() => {
          if (!active) return;
          setCameraPermission(true);
          setTrackerState('scanning');
          scanProgressRef.current = 0;
          setScanProgress(0);
          addLog('Webcam stream active. Position your finger in the cyan circle.', 'info');
          
          if (videoRef.current) {
            videoRef.current.play().catch(err => {
              console.warn("Auto-play error on camera start:", err);
            });
            
            if (videoRef.current.srcObject) {
              const stream = videoRef.current.srcObject as MediaStream;
              if (onStreamReady) {
                onStreamReady(stream);
              }
            }
          }
        })
        .catch((err: any) => {
          if (!active) return;
          console.error(err);
          setCameraPermission(false);
          setTrackerState('error');
          setErrorMessage('Could not access your webcam. Please allow camera permissions.');
          addLog('Error: Camera permissions denied.', 'error');
        });

    } catch (e: any) {
      console.error(e);
      if (active) {
        setTrackerState('error');
        setErrorMessage('Failed to initialize Hand-tracking. Check connection or reload.');
        addLog('Error initializing tracking engine.', 'error');
      }
    }

    return () => {
      active = false;
      if (onPinchChangeRef.current) {
        onPinchChangeRef.current(false);
      }
      if (cameraInstance) {
        try {
          cameraInstance.stop();
        } catch (_) {}
      }
      if (handsInstance) {
        try {
          handsInstance.close();
        } catch (_) {}
      }
    };
  }, [loadingModel, isTrackingActive]);

  // Handle detection results
  const handleResults = (results: any) => {
    latestResultsRef.current = results;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // If no multiHandLandmarks, hand is not detected
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      if (handDetectedRef.current) {
        setHandDetected(false);
        setPinchActive(false);
        if (onPinchChangeRef.current) {
          onPinchChangeRef.current(false);
        }
      }
      // If scanning, slowly drain scan progress very gently
      if (trackerStateRef.current === 'scanning') {
        scanProgressRef.current = Math.max(0, scanProgressRef.current - 0.2);
        setScanProgress(Math.floor(scanProgressRef.current));
      }
      return;
    }

    if (!handDetectedRef.current) {
      setHandDetected(true);
    }

    const landmarks = results.multiHandLandmarks[0];

    // Extract key landmarks
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexMCP = landmarks[5];
    const wrist = landmarks[0];

    // Calculate dynamic hand size to normalize distances regardless of camera distance
    const handScale = Math.sqrt(
      Math.pow(wrist.x - indexMCP.x, 2) + Math.pow(wrist.y - indexMCP.y, 2)
    );

    // Calculate index to thumb distance
    const distance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
    );
    const normalizedDistance = distance / (handScale || 1);
    setPinchDistance(Number(normalizedDistance.toFixed(3)));

    // Pinch threshold is typically < 0.38
    const isPinching = normalizedDistance < 0.38;
    setPinchActive(isPinching);

    // Extract raw index finger coordinates
    const rawX = isMirroredRef.current ? (1 - indexTip.x) : indexTip.x;
    const rawY = indexTip.y;

    // Define standard touchpad active boundaries to allow full coverage with small movements
    const activeBox = { xMin: 0.25, xMax: 0.75, yMin: 0.25, yMax: 0.75 };
    
    // Map bounding box to 0-100% space
    let targetX = ((rawX - activeBox.xMin) / (activeBox.xMax - activeBox.xMin)) * 100;
    let targetY = ((rawY - activeBox.yMin) / (activeBox.yMax - activeBox.yMin)) * 100;

    // Boost with sensitivity
    const centerOffset = 50;
    targetX = centerOffset + (targetX - centerOffset) * sensitivityRef.current;
    targetY = centerOffset + (targetY - centerOffset) * sensitivityRef.current;

    // Clamp coordinates
    targetX = Math.max(0, Math.min(100, targetX));
    targetY = Math.max(0, Math.min(100, targetY));

    // Apply Exponential Moving Average (EMA) smoothing to eliminate camera jitter
    const currentSmoothing = smoothingRef.current;
    const smoothX = lastPosRef.current.x * currentSmoothing + targetX * (1 - currentSmoothing);
    const smoothY = lastPosRef.current.y * currentSmoothing + targetY * (1 - currentSmoothing);
    
    const nextCoords = { x: smoothX, y: smoothY };
    lastPosRef.current = nextCoords;

    // STATE-SPECIFIC INTERACTION
    if (trackerStateRef.current === 'scanning') {
      const targetNormalX = 0.5;
      const targetNormalY = 0.45;

      // Check if user's index finger tip is inside target (using screen-aligned coordinates)
      const distFromTarget = Math.sqrt(
        Math.pow(rawX - targetNormalX, 2) + Math.pow(rawY - targetNormalY, 2)
      );

      if (distFromTarget < 0.20) {
        // Finger is in target! Advance scanning progress faster
        scanProgressRef.current = Math.min(100, scanProgressRef.current + 4.0);
        setScanProgress(Math.floor(scanProgressRef.current));

        // Scan success action
        if (scanProgressRef.current >= 100) {
          setTrackerState('connected');
          addLog('Cursor synchronization complete! Air touchpad connected.', 'success');
        }
      } else {
        // Drain scanning progress much slower if hand drifts slightly
        scanProgressRef.current = Math.max(0, scanProgressRef.current - 0.1);
        setScanProgress(Math.floor(scanProgressRef.current));
      }
    } else if (trackerStateRef.current === 'connected') {
      // Tracking is active! Report positions to parent
      if (onCursorMoveRef.current) {
        onCursorMoveRef.current(nextCoords);
      }
      if (onPinchChangeRef.current) {
        onPinchChangeRef.current(isPinching);
      }

      // Handle Pinch Gestures (Clicks & Double-clicks)
      const previousPinch = lastPinchRef.current;
      
      if (isPinching && !previousPinch) {
        // Pinch Down!
        addLog('Pinch detected (Touchdown)', 'info');
      } else if (!isPinching && previousPinch) {
        // Pinch Up! (Release)
        const now = Date.now();
        const timeDiff = now - lastClickTimeRef.current;

        if (timeDiff < 380) {
          // Double click detected!
          if (onDoubleClickRef.current) {
            onDoubleClickRef.current();
          }
          addLog('⚡ Double-Click executed!', 'success');
        } else {
          // Single click detected
          if (onSingleClickRef.current) {
            onSingleClickRef.current();
          }
          addLog('🖱️ Click registered', 'action');
        }
        lastClickTimeRef.current = now;
      }
      
      lastPinchRef.current = isPinching;
    }
  };

  const drawHandSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number) => {
    // Connections of hand joints (MediaPipe Hands standard skeletal index)
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [9, 10], [10, 11], [11, 12],          // Middle (partial to MCP)
      [0, 9], [13, 14], [14, 15], [15, 16], // Ring
      [0, 13], [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17]             // Palm border
    ];

    // Set line styles
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)'; // Sleek Cyan
    ctx.lineWidth = 2;

    // Draw bones
    for (const [p1, p2] of connections) {
      if (landmarks[p1] && landmarks[p2]) {
        const x1 = (isMirroredRef.current ? (1 - landmarks[p1].x) : landmarks[p1].x) * width;
        const y1 = landmarks[p1].y * height;
        const x2 = (isMirroredRef.current ? (1 - landmarks[p2].x) : landmarks[p2].x) * width;
        const y2 = landmarks[p2].y * height;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const cx = (isMirroredRef.current ? (1 - lm.x) : lm.x) * width;
      const cy = lm.y * height;

      ctx.beginPath();
      ctx.arc(cx, cy, i === 8 ? 6 : i === 4 ? 6 : 3, 0, 2 * Math.PI);
      
      // Highlight tracking anchors (Index tip & Thumb tip)
      if (i === 8) {
        ctx.fillStyle = '#06b6d4'; // Cyan for tracking index
      } else if (i === 4) {
        ctx.fillStyle = '#e11d48'; // Rose for click thumb
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      }
      ctx.fill();
    }
  };

  const startCalibration = () => {
    if (trackerState === 'ready' || trackerState === 'connected') {
      scanProgressRef.current = 0;
      setScanProgress(0);
      setTrackerState('scanning');
      addLog('Scanning requested. Hold your index finger inside the cyan ring.', 'info');
    }
  };

  const toggleMirror = () => {
    setIsMirrored(!isMirrored);
    addLog(`Webcam feed horizontal mirror ${!isMirrored ? 'enabled' : 'disabled'}.`);
  };

  const stopTracking = () => {
    setIsTrackingActive(false);
    setTrackerState('uninitialized');
    setHandDetected(false);
    setPinchActive(false);
    latestResultsRef.current = null;
    addLog('Webcam tracking stopped by user.', 'info');
  };

  return (
    <div 
      id={isMinimized ? undefined : "touchpad_controls_container"} 
      className={isMinimized 
        ? "relative aspect-video w-full h-full rounded-xl bg-slate-950 border border-cyan-500/60 overflow-hidden shadow-2xl group transition-all duration-300"
        : "bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 h-full shadow-2xl"
      }
    >
      {/* 1. Tracker Status Card (Title Bar) - Hide when minimized */}
      {!isMinimized && (
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-cyan-400" />
            <h2 className="font-display font-medium text-slate-200">Air Touchpad Control Panel</h2>
          </div>
          <span className={`px-2 py-1 text-2xs font-mono rounded-full font-bold uppercase ${
            trackerState === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            trackerState === 'scanning' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse' :
            trackerState === 'ready' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
            'bg-slate-800 text-slate-400'
          }`}>
            {trackerState === 'connected' ? '● Live Air Touch' :
             trackerState === 'scanning' ? '● Scanning Finger...' :
             trackerState === 'ready' ? '● Camera Paused' :
             '● Offline'}
          </span>
        </div>
      )}

      {/* 2. Camera Live Stream Window - ALWAYS PERSISTENT */}
      {/* If minimized, this container matches the full size of the parent */}
      <div className={isMinimized 
        ? "absolute inset-0 w-full h-full"
        : "relative aspect-video w-full rounded-xl bg-slate-950 border border-slate-800/80 overflow-hidden group"
      }>
        {/* Mirror indicator badge */}
        {isTrackingActive && trackerState !== 'error' && (
          <button 
            onClick={toggleMirror}
            className={`absolute z-15 font-mono bg-slate-950/80 hover:bg-slate-900 border border-slate-800 rounded text-slate-300 transition-colors cursor-pointer ${
              isMinimized 
                ? 'top-2 right-2 px-1.5 py-0.5 text-4xs' 
                : 'top-3 right-3 px-2.5 py-1 text-2xs rounded-md'
            }`}
          >
            {isMinimized ? (isMirrored ? 'Unmirror' : 'Mirror') : (isMirrored ? 'Unmirror Feed' : 'Mirror Feed')}
          </button>
        )}

        {/* Stop Camera button - Only show if active and not minimized */}
        {isTrackingActive && trackerState !== 'error' && !isMinimized && (
          <button 
            onClick={stopTracking}
            className="absolute top-3 left-3 z-15 px-2.5 py-1 text-2xs font-mono bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-md text-rose-300 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Stop Camera
          </button>
        )}

        {/* Start Air Touchpad Screen (Shown when camera is inactive) */}
        {!isTrackingActive && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
            <div className={`bg-cyan-950/60 border border-cyan-800/40 rounded-full flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform duration-300 ${
              isMinimized ? 'w-10 h-10 mb-1.5' : 'w-14 h-14 mb-3'
            }`}>
              <CameraIcon className={isMinimized ? 'w-5 h-5' : 'w-7 h-7'} />
            </div>
            <h3 className="font-display text-xs md:text-sm text-slate-200 font-medium">
              {isMinimized ? 'Touchpad Offline' : 'Air Touchpad Control'}
            </h3>
            {!isMinimized && (
              <p className="text-xs text-slate-500 mt-1 max-w-xs font-sans">
                Connect your physical hand as a trackpad controller using high-speed CDN MediaPipe AI models.
              </p>
            )}
            <button
              onClick={() => {
                setIsTrackingActive(true);
                addLog('Activating camera and initializing tracking system...', 'info');
              }}
              className={`flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded font-bold transition-all shadow-md active:scale-98 cursor-pointer font-sans ${
                isMinimized ? 'mt-2 px-2 py-1 text-4xs' : 'mt-4 py-2 px-5 text-xs rounded-lg'
              }`}
            >
              <Play className={isMinimized ? 'w-2.5 h-2.5 fill-slate-950' : 'w-3.5 h-3.5 fill-slate-950'} />
              {isMinimized ? 'Start Camera' : 'Start Webcam & Tracking'}
            </button>
          </div>
        )}

        {/* Loading Model overlay */}
        {isTrackingActive && loadingModel && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <p className="font-display text-sm text-slate-200 font-medium">Initializing AI Hand-Tracking Engines</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs font-mono">Loading MediaPipe neural assets via high-speed CDN...</p>
          </div>
        )}

        {/* Error overlay */}
        {isTrackingActive && trackerState === 'error' && (
          <div className="absolute inset-0 z-20 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl max-w-xs flex flex-col items-center gap-3">
              <AlertCircle className="w-8 h-8 text-rose-500 animate-bounce" />
              <div>
                <p className="font-display font-medium text-slate-100 text-sm">Camera Connection Failed</p>
                <p className="text-xs text-slate-400 mt-1 leading-normal">{errorMessage || 'Unable to start camera tracking.'}</p>
              </div>
              <button
                onClick={() => {
                  setIsTrackingActive(false);
                  setTrackerState('uninitialized');
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer font-sans"
              >
                Go Back & Retry
              </button>
            </div>
          </div>
        )}

        {/* Video Element for Webcam Stream - ALWAYS PERSISTENT */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover z-0 ${isMirrored ? 'scale-x-[-1]' : ''} ${isTrackingActive && trackerState !== 'error' ? 'block' : 'hidden'}`}
          playsInline
          muted
        />
        
        {/* Render Canvas for Skeleton tracking overlays - ALWAYS PERSISTENT */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className={`absolute inset-0 w-full h-full object-cover z-10 bg-transparent ${isTrackingActive && trackerState !== 'error' ? 'block' : 'hidden'}`}
        />

        {/* Overlay when state is ready (Camera active but calibration not started) - Hide if minimized */}
        {isTrackingActive && trackerState === 'ready' && !isMinimized && (
          <div className="absolute inset-0 z-15 bg-slate-950/40 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl max-w-xs flex flex-col items-center gap-3 shadow-2xl">
              <CameraIcon className="w-8 h-8 text-cyan-400" />
              <div>
                <p className="font-display font-medium text-slate-100 text-sm">Camera Live & Connected</p>
                <p className="text-xs text-slate-400 mt-1">To connect the tracking cursor, we must calibrate your air controller.</p>
              </div>
              <button
                onClick={startCalibration}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer font-sans"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                Apply & Scan Cursor
              </button>
            </div>
          </div>
        )}

        {/* Scan feedback card while scanning */}
        {isTrackingActive && trackerState === 'scanning' && (
          <div className={`absolute bottom-3 left-3 right-3 z-20 bg-slate-950/90 border border-slate-800/80 backdrop-blur-md rounded-lg shadow-lg ${
            isMinimized ? 'p-1.5 bottom-2 left-2 right-2' : 'p-3'
          }`}>
            <div className={`flex items-center justify-between ${isMinimized ? 'mb-1' : 'mb-2'}`}>
              <span className={`font-mono font-medium text-cyan-400 flex items-center gap-1.5 uppercase animate-pulse ${
                isMinimized ? 'text-4xs' : 'text-2xs'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> Calibrating Cursor...
              </span>
              <span className={`font-mono font-bold text-slate-200 ${isMinimized ? 'text-3xs' : 'text-xs'}`}>{scanProgress}%</span>
            </div>
            <div className={`w-full bg-slate-800 rounded-full overflow-hidden ${isMinimized ? 'h-1' : 'h-2'}`}>
              <div 
                className="bg-cyan-500 h-full transition-all duration-100 ease-out" 
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            {!isMinimized && (
              <p className="text-3xs text-slate-400 mt-2 font-mono text-center">Place index finger in cyan circle & keep hand steady.</p>
            )}
          </div>
        )}

        {/* Hand status indicator inside feed when connected */}
        {isTrackingActive && trackerState === 'connected' && (
          <div className={`absolute z-15 bg-slate-950/80 border border-slate-800 backdrop-blur-xs rounded-md text-slate-300 shadow-md ${
            isMinimized 
              ? 'bottom-2 left-2 px-1.5 py-0.5 text-4xs' 
              : 'bottom-3 left-3 px-2.5 py-1 text-2xs'
          }`}>
            {handDetected ? (
              <span className="text-emerald-400">● {isMinimized ? 'Live Air' : 'Hand tracking active'}</span>
            ) : (
              <span className="text-rose-400 animate-pulse">▲ {isMinimized ? 'No hand' : 'Hand not in frame'}</span>
            )}
          </div>
        )}
      </div>

      {/* 3. Controls, Stats, Logs, etc. - ONLY RENDERED IF NOT MINIMIZED */}
      {!isMinimized && (
        <>
          {/* Slider calibrations */}
          <div className="grid grid-cols-2 gap-4 border-t border-slate-800/50 pt-4 text-xs font-sans">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 font-medium">Tracking Sensitivity</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="font-mono text-slate-300 min-w-[2.5rem] text-right">{sensitivity}x</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 font-medium">Jitter Smoothing</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.0"
                  max="0.9"
                  step="0.05"
                  value={smoothing}
                  onChange={(e) => setSmoothing(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="font-mono text-slate-300 min-w-[2.5rem] text-right">{Math.round(smoothing * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Real-time gestures visualization */}
          <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl">
            <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Gesture Trigger Engine
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center text-slate-300">
              <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                <div className="text-2xs text-slate-500 font-mono">PINCH DEPTH</div>
                <div className="text-sm font-mono font-semibold mt-0.5 text-cyan-300">
                  {handDetected ? pinchDistance : '--'}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                <div className="text-2xs text-slate-500 font-mono">TOUCHSTATE</div>
                <div className={`text-sm font-mono font-semibold mt-0.5 ${pinchActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {handDetected ? (pinchActive ? 'PINCHED' : 'HOVER') : 'IDLE'}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                <div className="text-2xs text-slate-500 font-mono">ACTION MODE</div>
                <div className="text-sm font-mono font-semibold mt-0.5 text-cyan-400 flex items-center justify-center gap-1">
                  {trackerState === 'connected' ? 'Air Touch' : '--'}
                </div>
              </div>
            </div>

            {/* Quick Help box */}
            <div className="mt-3 flex items-start gap-2 text-2xs text-slate-400 leading-normal border-t border-slate-800/40 pt-2.5">
              <CheckCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-300 font-semibold">How to interact:</strong> Pinch index finger and thumb together and release to <strong className="text-cyan-400">Click</strong>. Repeat twice quickly to <strong className="text-cyan-400">Double Click</strong>!
              </p>
            </div>
          </div>

          {/* Mock terminal logging output */}
          <div className="flex-1 flex flex-col min-h-[140px] max-h-[180px] bg-slate-950 border border-slate-850 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
              <span className="text-2xs font-mono text-slate-500 font-semibold uppercase tracking-wider">System Event logs</span>
              <button 
                onClick={() => {
                  setLogs([]);
                  addLog('Console logs cleared.');
                }}
                className="text-3xs font-mono text-cyan-400/80 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Clear Log
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-3xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-4">Waiting for inputs...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2 leading-relaxed">
                    <span className="text-slate-600 font-semibold shrink-0">[{log.time}]</span>
                    <span className={`
                      ${log.type === 'success' ? 'text-emerald-400' : ''}
                      ${log.type === 'action' ? 'text-cyan-400 font-medium' : ''}
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

          {/* Recalibrate button when connected */}
          {trackerState === 'connected' && (
            <button
              onClick={startCalibration}
              className="w-full py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium font-sans flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rescan / Recalibrate Touchpad
            </button>
          )}
        </>
      )}
    </div>
  );
}
