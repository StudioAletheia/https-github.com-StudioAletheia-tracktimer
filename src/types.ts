export interface Lap {
  lapNumber: number;
  splitTime: number; // Time taken for this specific lap
  totalTime: number; // Cumulative time when this lap was completed
  timestamp: number; // Absolute timestamp
}

export interface Runner {
  id: string;
  name: string;
  laps: Lap[];
  offset: number; // Time offset if runner started late (optional feature, but good for structure)
  finished: boolean;
  isPaused: boolean;
  totalPausedTime: number;
  lastPauseTime: number | null;
  showLapIndicator?: boolean;
  avatar?: string;
  isEditingName?: boolean;
  isConfiguring?: boolean;
  goals?: {
    targetLaps?: number;
    targetLapTime?: number; // milliseconds
    targetTotalTime?: number; // milliseconds
  };
}
