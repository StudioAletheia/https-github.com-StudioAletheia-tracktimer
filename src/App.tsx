import { useEffect, useState, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Flag, Trash2, Download, Pencil, Settings, Trophy } from 'lucide-react';
import { Runner, Lap } from './types';
import { motion, AnimatePresence } from 'motion/react';

// Utility to format time as mm:ss.ms
const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};

// Utility to parse mm:ss.ms or mm:ss to ms
const parseTime = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length === 1) {
    // Assume seconds
    return parseFloat(parts[0]) * 1000;
  }
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    return (minutes * 60000) + (seconds * 1000);
  }
  return 0;
};

export default function App() {
  const [masterTime, setMasterTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [sortType, setSortType] = useState<'manual' | 'time' | 'laps'>('manual');
  const [trackLength, setTrackLength] = useState(400); // meters
  const [isEditingTrack, setIsEditingTrack] = useState(false);
  const requestRef = useRef<number>();

  // Load state from local storage on mount
  useEffect(() => {
    // Load runners
    const savedRunners = localStorage.getItem('track-timing-pro-runners');
    if (savedRunners) {
      try {
        setRunners(JSON.parse(savedRunners));
      } catch (e) {
        console.error("Failed to load runners", e);
      }
    } else {
      // Add default runners if none exist
      setRunners([
        { id: crypto.randomUUID(), name: 'Runner 1', laps: [], offset: 0, finished: false, isPaused: false, totalPausedTime: 0, lastPauseTime: null },
        { id: crypto.randomUUID(), name: 'Runner 2', laps: [], offset: 0, finished: false, isPaused: false, totalPausedTime: 0, lastPauseTime: null },
      ]);
    }

    // Load timer state
    const savedState = localStorage.getItem('track-timing-pro-state');
    if (savedState) {
      try {
        const { isRunning: savedIsRunning, startTime: savedStartTime, masterTime: savedMasterTime, trackLength: savedTrackLength } = JSON.parse(savedState);
        
        if (savedTrackLength) {
          setTrackLength(savedTrackLength);
        }

        if (savedIsRunning && savedStartTime) {
          // If it was running, calculate the new masterTime based on elapsed real time
          setStartTime(savedStartTime);
          setMasterTime(Date.now() - savedStartTime);
          setIsRunning(true);
        } else {
          // If it was paused, restore the saved masterTime
          setMasterTime(savedMasterTime || 0);
          setIsRunning(false);
          setStartTime(null);
        }
      } catch (e) {
        console.error("Failed to load timer state", e);
      }
    }
  }, []);

  // Save runners to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('track-timing-pro-runners', JSON.stringify(runners));
  }, [runners]);

  // Save timer state when running status, start time, or track length changes
  useEffect(() => {
    localStorage.setItem('track-timing-pro-state', JSON.stringify({
      isRunning,
      startTime,
      masterTime,
      trackLength
    }));
  }, [isRunning, startTime, trackLength]);

  // Save timer state when masterTime changes (only if paused)
  useEffect(() => {
    if (!isRunning) {
      localStorage.setItem('track-timing-pro-state', JSON.stringify({
        isRunning,
        startTime,
        masterTime,
        trackLength
      }));
    }
  }, [masterTime, isRunning, trackLength]);

  const getSortedRunners = () => {
    if (sortType === 'manual') return runners;

    return [...runners].sort((a, b) => {
      if (sortType === 'laps') {
        // Sort by laps (descending), then total time (ascending)
        if (b.laps.length !== a.laps.length) return b.laps.length - a.laps.length;
        const aTime = a.laps.length > 0 ? a.laps[a.laps.length - 1].totalTime : 0;
        const bTime = b.laps.length > 0 ? b.laps[b.laps.length - 1].totalTime : 0;
        return aTime - bTime;
      } else if (sortType === 'time') {
         // Sort by total time of last lap (ascending) - fastest overall first
         const aTime = a.laps.length > 0 ? a.laps[a.laps.length - 1].totalTime : Infinity;
         const bTime = b.laps.length > 0 ? b.laps[b.laps.length - 1].totalTime : Infinity;
         // If no laps, push to bottom
         if (aTime === Infinity && bTime === Infinity) return 0;
         if (aTime === Infinity) return 1;
         if (bTime === Infinity) return -1;
         return aTime - bTime;
      }
      return 0;
    });
  };

  const sortedRunners = getSortedRunners();

  const animate = (time: number) => {
    if (startTime !== null) {
      setMasterTime(Date.now() - startTime);
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isRunning) {
      if (startTime === null) {
        setStartTime(Date.now() - masterTime);
      }
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      setStartTime(null);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, masterTime]); // Added masterTime to dependency to handle resume correctly

  // Fix for resume: When starting, we need to calculate the "virtual" start time
  // based on the current accumulated masterTime.
  const toggleTimer = () => {
    if (isRunning) {
      setIsRunning(false);
      setStartTime(null);
    } else {
      setStartTime(Date.now() - masterTime);
      setIsRunning(true);
    }
  };

  // Helper to calculate a runner's effective time
  const getRunnerTime = (runner: Runner, currentMasterTime: number) => {
    let time = currentMasterTime - (runner.totalPausedTime || 0);
    if (runner.isPaused && runner.lastPauseTime && startTime) {
      // If paused, subtract the time elapsed since the pause started
      // currentMasterTime includes the time since pause, so we subtract it out
      // to freeze the time at the moment of pause.
      // momentOfPause (relative to start) = runner.lastPauseTime - startTime
      // time = momentOfPause - totalPausedTime
      
      // However, calculating from masterTime is safer for sync:
      // time = (currentMasterTime) - (currentMasterTime - (runner.lastPauseTime - startTime)) - totalPausedTime
      //      = (runner.lastPauseTime - startTime) - totalPausedTime
      
      // We need to be careful if startTime is null (master paused).
      // If master is paused, masterTime is static.
      // If runner was paused BEFORE master paused, runner.lastPauseTime is set.
      
      const timeSincePause = Date.now() - runner.lastPauseTime;
      time -= timeSincePause;
    }
    return Math.max(0, time);
  };

  const toggleRunnerPause = (runnerId: string) => {
    if (!isRunning) return; // Can only pause/resume individual runners if master clock is running

    setRunners(runners.map(runner => {
      if (runner.id !== runnerId) return runner;

      if (runner.isPaused) {
        // Resume
        const pauseDuration = Date.now() - (runner.lastPauseTime || Date.now());
        return {
          ...runner,
          isPaused: false,
          lastPauseTime: null,
          totalPausedTime: (runner.totalPausedTime || 0) + pauseDuration
        };
      } else {
        // Pause
        return {
          ...runner,
          isPaused: true,
          lastPauseTime: Date.now(),
          showLapIndicator: false // Clear indicator on pause
        };
      }
    }));
  };

  const resetTimer = () => {
    setIsRunning(false);
    setMasterTime(0);
    setStartTime(null);
    setRunners(runners.map(r => ({ 
      ...r, 
      laps: [], 
      finished: false,
      isPaused: false,
      totalPausedTime: 0,
      lastPauseTime: null
    })));
  };

  const addRunner = () => {
    const newRunner: Runner = {
      id: crypto.randomUUID(),
      name: `Runner ${runners.length + 1}`,
      laps: [],
      offset: 0,
      finished: false,
      isPaused: false,
      totalPausedTime: 0,
      lastPauseTime: null
    };
    setRunners([...runners, newRunner]);
  };

  const removeRunner = (id: string) => {
    setRunners(runners.filter(r => r.id !== id));
  };

  const recordLap = (runnerId: string) => {
    if (!isRunning && masterTime === 0) return; // Can't lap if not started

    setRunners(runners.map(runner => {
      if (runner.id !== runnerId) return runner;
      if (runner.isPaused) return runner; // Can't lap if paused

      // Calculate effective time for this runner
      // If running, getRunnerTime uses Date.now(). 
      // But inside this function we want the snapshot consistent with masterTime.
      // masterTime is updated in the loop.
      // Let's use the same logic:
      
      const effectiveTotalTime = masterTime - (runner.totalPausedTime || 0);
      
      const previousTotalTime = runner.laps.length > 0 
        ? runner.laps[runner.laps.length - 1].totalTime 
        : 0;
      
      const splitTime = effectiveTotalTime - previousTotalTime;

      const newLap: Lap = {
        lapNumber: runner.laps.length + 1,
        splitTime,
        totalTime: effectiveTotalTime,
        timestamp: Date.now()
      };

      return { ...runner, laps: [...runner.laps, newLap], showLapIndicator: true };
    }));

    // Clear indicator after 3 seconds
    setTimeout(() => {
      setRunners(prevRunners => prevRunners.map(r => {
        if (r.id !== runnerId) return r;
        return { ...r, showLapIndicator: false };
      }));
    }, 3000);
  };

  const updateRunnerName = (id: string, name: string) => {
    setRunners(runners.map(r => r.id === id ? { ...r, name } : r));
  };

  const updateRunnerAvatar = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setRunners(runners.map(r => r.id === id ? { ...r, avatar: reader.result as string } : r));
    };
    reader.readAsDataURL(file);
  };

  const toggleRunnerConfig = (id: string) => {
    setRunners(runners.map(r => r.id === id ? { ...r, isConfiguring: !r.isConfiguring } : r));
  };

  const updateRunnerGoals = (id: string, goals: Runner['goals']) => {
    setRunners(runners.map(r => r.id === id ? { ...r, goals: { ...r.goals, ...goals } } : r));
  };

  const exportData = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Runner Name,Lap Number,Split Time,Total Time\n"
      + runners.flatMap(r => 
          r.laps.map(l => `${r.name},${l.lapNumber},${formatTime(l.splitTime)},${formatTime(l.totalTime)}`)
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `track_timing_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate overall stats
  const totalLaps = runners.reduce((acc, r) => acc + r.laps.length, 0);
  const allSplits = runners.flatMap(r => r.laps.map(l => l.splitTime));
  const fastestLap = allSplits.length > 0 ? Math.min(...allSplits) : 0;
  
  const finishedRunners = runners.filter(r => r.finished).length;
  const completionPercentage = runners.length > 0 ? (finishedRunners / runners.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-white">
      {/* Header / Master Control */}
      <header className="sticky top-0 z-50 bg-[#E4E3E0]/90 backdrop-blur-md border-b border-[#141414]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            
            {/* Title & Master Time */}
            <div className="flex items-center gap-8">
              <div className="text-left">
                <h1 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-1 font-mono">Track Timer</h1>
                <div className="text-5xl md:text-7xl font-mono font-medium tracking-tighter tabular-nums leading-none">
                  {formatTime(masterTime)}
                </div>
              </div>

              {/* Overall Stats */}
              <div className="hidden lg:flex items-center gap-6 pl-8 border-l border-[#141414]/10">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Runners</div>
                  <div className="text-xl font-mono font-medium tabular-nums text-[#141414]">{runners.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Total Laps</div>
                  <div className="text-xl font-mono font-medium tabular-nums text-[#141414]">{totalLaps}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Fastest Lap</div>
                  <div className="text-xl font-mono font-medium tabular-nums text-[#141414]">
                    {fastestLap > 0 ? formatTime(fastestLap) : '--:--.--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Track Length</div>
                  <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setIsEditingTrack(true)}>
                    {isEditingTrack ? (
                      <input
                        type="number"
                        value={trackLength}
                        autoFocus
                        onBlur={() => setIsEditingTrack(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setIsEditingTrack(false);
                        }}
                        onChange={(e) => setTrackLength(parseInt(e.target.value) || 0)}
                        className="w-16 bg-white border border-[#141414]/10 rounded px-1 py-0.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                      />
                    ) : (
                      <>
                        <div className="text-xl font-mono font-medium tabular-nums text-[#141414]">{trackLength}m</div>
                        <Pencil size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Completion</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-mono font-medium tabular-nums text-[#141414]">{Math.round(completionPercentage)}%</div>
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#141414] transition-all duration-500 ease-out"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <button 
                onClick={toggleTimer}
                className={`flex items-center gap-2 px-8 py-4 rounded-full font-medium transition-all active:scale-95 ${
                  isRunning 
                    ? 'bg-[#141414] text-white hover:bg-black' 
                    : 'bg-[#00D655] text-[#003311] hover:bg-[#00FF66]'
                }`}
              >
                {isRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                <span className="uppercase tracking-wide text-sm">{isRunning ? 'Stop' : 'Start'}</span>
              </button>

              <button 
                onClick={resetTimer}
                className="p-4 rounded-full bg-white border border-[#141414]/10 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors active:scale-95"
                title="Reset All"
              >
                <RotateCcw size={20} />
              </button>

              <div className="w-px h-10 bg-[#141414]/10 mx-2 hidden md:block"></div>

              <div className="flex items-center gap-1 bg-white rounded-full border border-[#141414]/10 p-1">
                <button
                  onClick={() => setSortType('manual')}
                  className={`px-3 py-2 rounded-full text-xs font-medium transition-colors ${sortType === 'manual' ? 'bg-[#141414] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Manual
                </button>
                <button
                  onClick={() => setSortType('laps')}
                  className={`px-3 py-2 rounded-full text-xs font-medium transition-colors ${sortType === 'laps' ? 'bg-[#141414] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Laps
                </button>
                <button
                  onClick={() => setSortType('time')}
                  className={`px-3 py-2 rounded-full text-xs font-medium transition-colors ${sortType === 'time' ? 'bg-[#141414] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Time
                </button>
              </div>

              <button 
                onClick={addRunner}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-[#141414]/10 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Add Runner</span>
              </button>

              <button 
                onClick={exportData}
                className="p-3 rounded-full bg-white border border-[#141414]/10 hover:bg-gray-50 transition-colors"
                title="Export CSV"
              >
                <Download size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Runners Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {sortedRunners.map((runner) => (
              <motion.div 
                key={runner.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`rounded-2xl shadow-sm border border-[#141414]/5 overflow-hidden flex flex-col transition-colors duration-300 ${
                  runner.finished ? 'bg-zinc-100 ring-2 ring-inset ring-black/5' : 'bg-white'
                }`}
              >
                {/* Runner Header */}
                <div className="p-4 border-b border-[#141414]/5 bg-gray-50/50 flex justify-between items-center relative overflow-hidden">
                  {runner.showLapIndicator && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-green-500/10 pointer-events-none" 
                    />
                  )}
                  <div className="flex items-center gap-3 flex-1 mr-4">
                    <div className="relative group shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gray-100 border border-[#141414]/10 overflow-hidden flex items-center justify-center relative">
                        {runner.avatar ? (
                          <img src={runner.avatar} alt={runner.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-gray-400 font-medium text-xs uppercase">{runner.name.substring(0, 2)}</span>
                        )}
                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Plus size={14} className="text-white" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                updateRunnerAvatar(runner.id, e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                      </div>
                      {runner.showLapIndicator && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white"
                        />
                      )}
                    </div>
                    <div className="relative flex-1 group/name">
                      {runner.isEditingName ? (
                        <input 
                          type="text" 
                          value={runner.name}
                          autoFocus
                          onBlur={() => {
                            setRunners(runners.map(r => r.id === runner.id ? { ...r, isEditingName: false } : r));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setRunners(runners.map(r => r.id === runner.id ? { ...r, isEditingName: false } : r));
                            }
                          }}
                          onChange={(e) => updateRunnerName(runner.id, e.target.value)}
                          className="bg-white font-serif italic text-lg font-medium text-[#141414] focus:outline-none ring-2 ring-black/5 rounded px-2 py-1 w-full shadow-sm"
                        />
                      ) : (
                        <div 
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            setRunners(runners.map(r => r.id === runner.id ? { ...r, isEditingName: true } : r));
                          }}
                        >
                          <span className="font-serif italic text-lg font-medium text-[#141414] truncate px-1 py-1 border border-transparent hover:bg-black/5 rounded transition-colors">
                            {runner.name}
                          </span>
                          <Pencil size={14} className="text-gray-400 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {runner.finished && (
                      <span className="bg-[#141414] text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm whitespace-nowrap">
                        Finished
                      </span>
                    )}
                    <button 
                      onClick={() => toggleRunnerConfig(runner.id)}
                      className={`transition-colors p-1 ${runner.isConfiguring ? 'text-[#141414]' : 'text-gray-400 hover:text-[#141414]'}`}
                      title="Settings"
                    >
                      <Settings size={16} />
                    </button>
                    <button 
                      onClick={() => removeRunner(runner.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Configuration Mode */}
                {runner.isConfiguring ? (
                  <div className="p-6 bg-gray-50/50 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 font-mono mb-2">Set Goals</h3>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Target Laps</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 10"
                          value={runner.goals?.targetLaps || ''}
                          onChange={(e) => updateRunnerGoals(runner.id, { targetLaps: parseInt(e.target.value) || undefined })}
                          className="w-full bg-white border border-[#141414]/10 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Target Lap Time (mm:ss)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 01:30"
                          defaultValue={runner.goals?.targetLapTime ? formatTime(runner.goals.targetLapTime).slice(0, -3) : ''}
                          onBlur={(e) => {
                            const ms = parseTime(e.target.value);
                            if (ms > 0) updateRunnerGoals(runner.id, { targetLapTime: ms });
                          }}
                          className="w-full bg-white border border-[#141414]/10 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => toggleRunnerConfig(runner.id)}
                      className="w-full py-2 bg-[#141414] text-white rounded-lg text-xs font-bold uppercase tracking-wider mt-4 hover:bg-black/90"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Active Stats */}
                    <div className="p-6 grid grid-cols-2 gap-8">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Current Lap</div>
                        <div className="text-3xl font-mono font-medium tabular-nums text-[#141414]">
                          {runner.finished 
                            ? "DONE" 
                            : formatTime(
                                Math.max(0, getRunnerTime(runner, masterTime) - (runner.laps.length > 0 ? runner.laps[runner.laps.length - 1].totalTime : 0))
                              )
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Laps Completed</div>
                        <div className="text-3xl font-mono font-medium tabular-nums text-[#141414]">
                          {runner.laps.length}
                          {runner.goals?.targetLaps && (
                            <span className="text-gray-400 text-lg ml-1">/ {runner.goals.targetLaps}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Personal Best & Average Pace */}
                      <div className="col-span-2 pt-4 border-t border-[#141414]/5 grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono">Personal Best</div>
                          <div className="font-mono font-medium tabular-nums text-[#141414]">
                            {runner.laps.length > 0 
                              ? formatTime(Math.min(...runner.laps.map(l => l.splitTime)))
                              : '--:--.--'
                            }
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono">Avg Lap</div>
                          <div className="font-mono font-medium tabular-nums text-[#141414]">
                            {runner.laps.length > 0 
                              ? formatTime(runner.laps.reduce((acc, lap) => acc + lap.splitTime, 0) / runner.laps.length)
                              : '--:--.--'
                            }
                          </div>
                        </div>
                      </div>

                      {/* Distance & Overall Pace */}
                      <div className="col-span-2 pt-4 border-t border-[#141414]/5 grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono">Distance</div>
                          <div className="font-mono font-medium tabular-nums text-[#141414]">
                            {(runner.laps.length * trackLength / 1000).toFixed(2)} <span className="text-xs text-gray-400">km</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-mono">Overall Pace</div>
                          <div className="font-mono font-medium tabular-nums text-[#141414]">
                            {runner.laps.length > 0 
                              ? (() => {
                                  const totalTime = runner.laps.reduce((acc, l) => acc + l.splitTime, 0);
                                  const totalDistKm = (runner.laps.length * trackLength) / 1000;
                                  const paceMsPerKm = totalTime / totalDistKm;
                                  return formatTime(paceMsPerKm).slice(0, 5);
                                })()
                              : '--:--'
                            } <span className="text-xs text-gray-400">/km</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="px-6 pb-6 grid grid-cols-4 gap-2">
                      <button
                        onClick={() => recordLap(runner.id)}
                        disabled={!isRunning || runner.finished || runner.isPaused}
                        className="col-span-2 py-6 rounded-xl bg-[#141414] text-white font-medium text-lg uppercase tracking-wider hover:bg-black/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group shadow-sm"
                      >
                        <Flag size={20} className="group-active:rotate-12 transition-transform" />
                        Lap
                      </button>
                      
                      <button
                        onClick={() => toggleRunnerPause(runner.id)}
                        disabled={!isRunning || runner.finished}
                        className={`col-span-1 rounded-xl font-medium text-xs uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${
                          runner.isPaused
                            ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-100'
                            : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-100'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={runner.isPaused ? "Resume Runner" : "Pause Runner"}
                      >
                        {runner.isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                        {runner.isPaused ? "Resume" : "Pause"}
                      </button>

                      <button
                        onClick={() => {
                          const newRunners = runners.map(r => r.id === runner.id ? { ...r, finished: !r.finished } : r);
                          setRunners(newRunners);
                        }}
                        className={`col-span-1 rounded-xl font-medium text-xs uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${
                          runner.finished 
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' 
                            : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                        }`}
                        title={runner.finished ? "Resume Runner" : "Finish Runner"}
                      >
                        {runner.finished ? <RotateCcw size={16} /> : <Flag size={16} fill="currentColor" />}
                        {runner.finished ? "Resume" : "Finish"}
                      </button>
                    </div>
                  </>
                )}

                {/* Laps History Table */}
                <div className="flex-1 bg-gray-50 border-t border-[#141414]/5 max-h-[200px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] uppercase tracking-wider text-gray-400 font-medium bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 font-mono">#</th>
                        <th className="px-4 py-2 font-mono text-right">Split</th>
                        <th className="px-4 py-2 font-mono text-right">Delta</th>
                        <th className="px-4 py-2 font-mono text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200/50">
                      {runner.laps.slice().reverse().map((lap, index, array) => {
                        // Calculate best lap time
                        const bestLapTime = runner.laps.length > 0 ? Math.min(...runner.laps.map(l => l.splitTime)) : 0;
                        
                        // Calculate delta
                        // array is reversed, so the "previous" lap (chronologically) is at index + 1
                        const prevLap = array[index + 1];
                        let delta = 0;
                        let hasDelta = false;
                        
                        if (prevLap) {
                          delta = lap.splitTime - prevLap.splitTime;
                          hasDelta = true;
                        }

                        const isTargetMet = runner.goals?.targetLapTime && lap.splitTime <= runner.goals.targetLapTime;
                        const isBestLap = bestLapTime > 0 && lap.splitTime === bestLapTime;

                        return (
                          <tr key={lap.lapNumber} className={`transition-colors ${isBestLap ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-white'}`}>
                            <td className="px-4 py-2 font-mono text-gray-500">
                              <div className="flex items-center gap-1">
                                {lap.lapNumber}
                                {isBestLap && <Trophy size={10} className="text-amber-500" />}
                              </div>
                            </td>
                            <td className={`px-4 py-2 font-mono text-right font-medium ${isTargetMet ? 'text-green-600 font-bold' : ''}`}>
                              {formatTime(lap.splitTime)}
                            </td>
                            <td className={`px-4 py-2 font-mono text-right text-xs ${
                              !hasDelta ? 'text-gray-300' : delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-600' : 'text-gray-400'
                            }`}>
                              {hasDelta ? (
                                <>
                                  {delta > 0 ? '+' : ''}
                                  {(delta / 1000).toFixed(2)}s
                                </>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-2 font-mono text-right text-gray-500">{formatTime(lap.totalTime)}</td>
                          </tr>
                        );
                      })}
                      {runner.laps.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic text-xs">
                            No laps recorded yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Add Runner Card (Empty State) */}
          <motion.button
            layout
            onClick={addRunner}
            className="min-h-[300px] rounded-2xl border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center gap-4 text-gray-400 hover:text-[#141414] hover:border-[#141414]/30 hover:bg-white/50 transition-all group"
          >
            <div className="p-4 rounded-full bg-gray-100 group-hover:bg-white group-hover:shadow-sm transition-all">
              <Plus size={32} />
            </div>
            <span className="font-medium uppercase tracking-wide text-sm">Add New Runner</span>
          </motion.button>
        </div>
      </main>
    </div>
  );
}
