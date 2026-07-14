/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type WorkspaceType = 'desktop' | 'phone';

export type TrackerState = 
  | 'uninitialized'  // Script loading / camera access not requested
  | 'ready'          // Camera open, ready to click "Apply"
  | 'scanning'       // Calibration phase - "scan the cursor"
  | 'connected'      // Calibrated and tracking active
  | 'error';         // Camera or model loading error

export interface Coordinates {
  x: number; // 0 to 100 relative to workspace container
  y: number; // 0 to 100 relative to workspace container
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface CalibrationTarget {
  x: number; // target x coordinate (normalized, e.g. 0.5)
  y: number; // target y coordinate (normalized, e.g. 0.5)
  radius: number; // tolerance radius
}

export interface PaintStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface DesktopNote {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  color: string;
}
