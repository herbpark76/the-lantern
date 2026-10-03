import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Square, X, Loader2,
} from "lucide-react";
import type { NarrationItem, NarrationManifest, NarrationPlayback } from "@/lib/narration";
import {
  resolveNarration, getManifestBaseUrl, narrateViaEdgeFunction,
  speakViaBrowser, stopBrowserSpeech,
} from "@/lib/narration";

interface NarrationPlayerProps {
  items: NarrationItem[];
  itemsToken: string;
  sceneToken: string;
  manifest: NarrationManifest | null;
  manifestUrl: string | null;
  storySlug: string;
  authToken: string;
  speed: number;
  onSpeedChange: (s: number) => void;
  onClose: () => void;
  onHighlight: (itemIndex: number) => void;
  startIndex?: number;
  waiting: boolean;
}

const SPEEDS = [0.9, 1, 1.1, 1.25, 1.5];

function isNextContiguous(
  items: NarrationItem[],
  idx: number,
  manifest: NarrationManifest | null,
  manifestBaseUrl: string,
  currentSeg: NarrationPlayback,
  loadedUrl: string | null,
): boolean {
  const nextIdx = idx + 1;
  if (nextIdx >= items.length) return false;
  const nextSeg = resolveNarration(items[nextIdx], manifest, manifestBaseUrl);
  return (
    !!nextSeg &&
    nextSeg.mode === "manifest" &&
    nextSeg.audioUrl === currentSeg.audioUrl &&
    nextSeg.audioUrl === loadedUrl &&
    nextSeg.start !== undefined &&
    currentSeg.end !== undefined &&
    Math.abs(nextSeg.start - currentSeg.end) < 0.15
  );
}

export function NarrationPlayer({
  items, itemsToken, sceneToken, manifest, manifestUrl, storySlug, authToken,
  speed, onSpeedChange, onClose, onHighlight, startIndex = 0, waiting,
}: NarrationPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState<NarrationPlayback | null>(null);
  const [usingBrowserTTS, setUsingBrowserTTS] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const manifestBaseUrl = manifestUrl ? getManifestBaseUrl(manifestUrl) : "";

  // Refs for segment tracking — read by event handlers without stale closures
  const segRef = useRef<NarrationPlayback | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const currentIndexRef = useRef(0);
  const advancingRef = useRef(false);
  const speedRef = useRef(speed);
  const itemsRef = useRef(items);
  const manifestRef = useRef(manifest);
  const manifestBaseUrlRef = useRef(manifestBaseUrl);
  const ttsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Token refs for scene-transition safety
  const itemsTokenRef = useRef(itemsToken);
  const sceneTokenRef = useRef(sceneToken);
  const waitingForTokenRef = useRef<string | null>(null);

  // Stop timers for precise segment ending
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const originalVolumeRef = useRef(1);

  // Keep refs in sync
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);
  useEffect(() => { manifestBaseUrlRef.current = manifestBaseUrl; }, [manifestBaseUrl]);
  useEffect(() => { itemsTokenRef.current = itemsToken; }, [itemsToken]);

  // Clear all stop timers (timeout, rAF, fade rAF)
  const clearStopTimers = useCallback(() => {
    if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (fadeRafRef.current) { cancelAnimationFrame(fadeRafRef.current); fadeRafRef.current = null; }
  }, []);

  // Fully stop whatever source is currently active
  const stopPreviousSource = useCallback(() => {
    stopBrowserSpeech();
    if (ttsIntervalRef.current) {
      clearInterval(ttsIntervalRef.current);
      ttsIntervalRef.current = null;
    }
    clearStopTimers();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = originalVolumeRef.current;
    }
  }, [clearStopTimers]);

  // Wait for the audio element to finish seeking to a given time
  const waitForSeeked = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      const handler = () => { audio.removeEventListener("seeked", handler); resolve(); };
      audio.addEventListener("seeked", handler);
      setTimeout(() => { audio.removeEventListener("seeked", handler); resolve(); }, 300);
    });

  // Wait for the audio element to finish loading (canplay)
  const waitForCanPlay = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      const handler = () => { audio.removeEventListener("canplay", handler); resolve(); };
      audio.addEventListener("canplay", handler);
    });

  const playItemRef = useRef<(idx: number) => Promise<void>>(async () => {});

  // Schedule precise stop for a manifest segment
  const scheduleSegmentStop = useCallback((
    audio: HTMLAudioElement,
    seg: NarrationPlayback,
    idx: number,
    willFade: boolean,
  ) => {
    clearStopTimers();
    if (seg.end === undefined) return;

    const rate = audio.playbackRate || 1;
    const remaining = (seg.end - audio.currentTime) / rate;
    const targetTime = seg.end - 0.04;

    // Schedule rAF polling ~80ms before segment end
    const rafDelay = Math.max(0, (remaining - 0.08) * 1000);

    stopTimeoutRef.current = setTimeout(() => {
      // rAF loop: pause when we reach targetTime
      const poll = () => {
        if (audio.paused) {
          rafRef.current = null;
          return;
        }
        if (audio.currentTime >= targetTime) {
          audio.pause();
          audio.currentTime = seg.end!;
          audio.volume = originalVolumeRef.current;
          rafRef.current = null;

          // Advance to next
          if (!advancingRef.current) {
            advancingRef.current = true;
            const nextIdx = idx + 1;
            if (nextIdx >= itemsRef.current.length) {
              setIsPlaying(false);
              setCurrentPlayback(null);
              segRef.current = null;
              advancingRef.current = false;
              return;
            }
            currentIndexRef.current = nextIdx;
            setCurrentIndex(nextIdx);
            advancingRef.current = false;
            void playItemRef.current(nextIdx);
          }
          return;
        }
        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);
    }, rafDelay);

    // Volume fade over last 60ms for non-contiguous segments
    if (willFade) {
      const fadeDelay = Math.max(0, (remaining - 0.06) * 1000);
      setTimeout(() => {
        if (audio.paused || rafRef.current === null) return; // segment already ended
        const startTime = performance.now();
        const startVol = audio.volume;
        const fadeDuration = 60;
        const animateFade = () => {
          if (audio.paused) {
            audio.volume = originalVolumeRef.current;
            fadeRafRef.current = null;
            return;
          }
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / fadeDuration);
          audio.volume = startVol * (1 - progress);
          if (progress < 1) {
            fadeRafRef.current = requestAnimationFrame(animateFade);
          } else {
            fadeRafRef.current = null;
          }
        };
        fadeRafRef.current = requestAnimationFrame(animateFade);
      }, fadeDelay);
    }
  }, [clearStopTimers]);

  const goToNext = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx >= itemsRef.current.length) {
      setIsPlaying(false);
      setCurrentPlayback(null);
      segRef.current = null;
      advancingRef.current = false;
      return;
    }
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    advancingRef.current = false;
    void playItemRef.current(nextIdx);
  }, []);

  const playItem = useCallback(async (idx: number) => {
    // Guard: don't play if items don't match the current scene
    if (itemsTokenRef.current !== sceneTokenRef.current) return;

    const curItems = itemsRef.current;
    if (idx >= curItems.length) {
      setIsPlaying(false);
      setCurrentPlayback(null);
      segRef.current = null;
      return;
    }

    const item = curItems[idx];
    onHighlight(idx);
    setCurrentIndex(idx);
    currentIndexRef.current = idx;

    const next = resolveNarration(item, manifestRef.current, manifestBaseUrlRef.current);

    if (next) {
      setLoading(false);
      setUsingBrowserTTS(false);

      const prev = segRef.current;

      const prevWasContiguousManifest =
        prev && prev.mode === "manifest" && prev.audioUrl === next.audioUrl &&
        loadedUrlRef.current === next.audioUrl;

      if (!prevWasContiguousManifest) {
        stopPreviousSource();
      }

      segRef.current = next;
      setCurrentPlayback(next);

      const audio = audioRef.current;
      if (!audio) return;

      // Contiguous fast-path
      if (prevWasContiguousManifest && !audio.paused &&
          prev && prev.end !== undefined && next.start !== undefined &&
          Math.abs(next.start - prev.end) < 0.15) {
        audio.playbackRate = speedRef.current;
        // Schedule stop for this contiguous segment
        const hasNext = isNextContiguous(
          curItems, idx, manifestRef.current, manifestBaseUrlRef.current,
          next, loadedUrlRef.current,
        );
        if (next.end !== undefined) {
          scheduleSegmentStop(audio, next, idx, !hasNext);
        }
        setIsPlaying(true);
        return;
      }

      // Not contiguous — reload file if needed
      const needsLoad = loadedUrlRef.current !== next.audioUrl || !audio.currentSrc;
      if (needsLoad && next.audioUrl) {
        audio.src = next.audioUrl;
        await waitForCanPlay(audio);
        audio.load();
        loadedUrlRef.current = next.audioUrl;
      }

      // Guard again after async load
      if (itemsTokenRef.current !== sceneTokenRef.current) return;

      audio.playbackRate = speedRef.current;
      audio.volume = originalVolumeRef.current;
      if (next.start !== undefined) {
        audio.currentTime = next.start;
        await waitForSeeked(audio);
      }

      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          await waitForCanPlay(audio);
          try {
            await audio.play();
            setIsPlaying(true);
          } catch {
            setIsPlaying(false);
          }
        } else {
          setIsPlaying(false);
        }
      }

      // Schedule precise stop
      if (next.end !== undefined) {
        const hasNext = isNextContiguous(
          curItems, idx, manifestRef.current, manifestBaseUrlRef.current,
          next, loadedUrlRef.current,
        );
        scheduleSegmentStop(audio, next, idx, !hasNext);
      }
      return;
    }

    // Stop any previous source before switching to API/TTS
    stopPreviousSource();

    setLoading(true);
    setUsingBrowserTTS(false);
    const url = await narrateViaEdgeFunction(storySlug, item.plainText, authToken);
    setLoading(false);

    // Guard: scene may have changed during async call
    if (itemsTokenRef.current !== sceneTokenRef.current) return;

    if (url) {
      const apiPlayback: NarrationPlayback = { mode: "api", audioUrl: url, start: 0 };
      segRef.current = apiPlayback;
      loadedUrlRef.current = url;
      setCurrentPlayback(apiPlayback);
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      await waitForCanPlay(audio);
      audio.load();
      audio.playbackRate = speedRef.current;
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          await waitForCanPlay(audio);
          try {
            await audio.play();
            setIsPlaying(true);
          } catch {
            setIsPlaying(false);
          }
        } else {
          setIsPlaying(false);
        }
      }
      return;
    }

    // Fallback: browser speech synthesis
    const ttsPlayback: NarrationPlayback = { mode: "tts" };
    segRef.current = ttsPlayback;
    loadedUrlRef.current = null;
    setCurrentPlayback(ttsPlayback);
    setUsingBrowserTTS(true);
    setIsPlaying(true);
    speakViaBrowser(item.plainText, speedRef.current);
    ttsIntervalRef.current = setInterval(() => {
      if (typeof window !== "undefined" && !window.speechSynthesis.speaking) {
        if (ttsIntervalRef.current) {
          clearInterval(ttsIntervalRef.current);
          ttsIntervalRef.current = null;
        }
        goToNext();
      }
    }, 200);
  }, [onHighlight, storySlug, authToken, goToNext, stopPreviousSource, scheduleSegmentStop]);

  // Keep playItemRef in sync
  useEffect(() => { playItemRef.current = playItem; }, [playItem]);

  // Audio 'ended' handler for API/non-manifest sources
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const seg = segRef.current;
      if (seg?.mode !== "manifest") {
        goToNext();
      }
    };

    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
    };
  }, [goToNext]);

  // --- Scene transition handling via tokens ---

  // When sceneToken changes, stop everything and wait for matching items
  const mountedRef = useRef(false);
  useEffect(() => {
    sceneTokenRef.current = sceneToken;
    if (!mountedRef.current) {
      mountedRef.current = true;
      waitingForTokenRef.current = sceneToken;
      return;
    }
    // Scene changed: stop all playback, reset index to 0
    stopPreviousSource();
    advancingRef.current = false;
    segRef.current = null;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setIsPlaying(false);
    setCurrentPlayback(null);
    waitingForTokenRef.current = sceneToken;
  }, [sceneToken, stopPreviousSource]);

  // When items arrive and match the scene we're waiting for, start at index 0
  useEffect(() => {
    if (waiting) return;
    if (!waitingForTokenRef.current) return;
    if (itemsToken !== waitingForTokenRef.current) return;
    // Items are ready for the current scene — start playback at 0
    waitingForTokenRef.current = null;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    void playItemRef.current(0);
  }, [waiting, itemsToken, sceneToken]);

  // Paragraph tap: jump to a specific index within the same scene
  const lastStartIndexRef = useRef(startIndex);
  useEffect(() => {
    if (waiting) return;
    if (waitingForTokenRef.current) return; // scene transition in progress
    if (startIndex === lastStartIndexRef.current) return;
    lastStartIndexRef.current = startIndex;
    stopPreviousSource();
    void playItemRef.current(startIndex);
  }, [startIndex, waiting, stopPreviousSource]);

  // When waiting becomes true, stop everything
  useEffect(() => {
    if (waiting) {
      stopPreviousSource();
      advancingRef.current = false;
      segRef.current = null;
      setIsPlaying(false);
      setCurrentPlayback(null);
    }
  }, [waiting, stopPreviousSource]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBrowserSpeech();
      if (ttsIntervalRef.current) clearInterval(ttsIntervalRef.current);
      clearStopTimers();
    };
  }, [clearStopTimers]);

  // Update playback rate — re-schedule stop if playing a manifest segment
  useEffect(() => {
    if (audioRef.current && !usingBrowserTTS) {
      audioRef.current.playbackRate = speed;
    }
    // Re-schedule stop timer for current manifest segment
    const seg = segRef.current;
    const audio = audioRef.current;
    if (seg && seg.mode === "manifest" && seg.end !== undefined && audio && !audio.paused && !advancingRef.current) {
      const hasNext = isNextContiguous(
        itemsRef.current, currentIndexRef.current,
        manifestRef.current, manifestBaseUrlRef.current,
        seg, loadedUrlRef.current,
      );
      scheduleSegmentStop(audio, seg, currentIndexRef.current, !hasNext);
    }
  }, [speed, usingBrowserTTS, scheduleSegmentStop]);

  const handlePlayPause = () => {
    if (waiting) return;
    if (isPlaying) {
      if (usingBrowserTTS) {
        stopBrowserSpeech();
      } else {
        audioRef.current?.pause();
        clearStopTimers();
      }
      setIsPlaying(false);
    } else {
      if (usingBrowserTTS) {
        playItem(currentIndex);
      } else {
        const audio = audioRef.current;
        if (audio) {
          audio.volume = originalVolumeRef.current;
          void audio.play();
          // Re-schedule stop for current segment
          const seg = segRef.current;
          if (seg && seg.mode === "manifest" && seg.end !== undefined) {
            const hasNext = isNextContiguous(
              itemsRef.current, currentIndexRef.current,
              manifestRef.current, manifestBaseUrlRef.current,
              seg, loadedUrlRef.current,
            );
            scheduleSegmentStop(audio, seg, currentIndexRef.current, !hasNext);
          }
        }
        setIsPlaying(true);
      }
    }
  };

  const handlePrev = () => {
    if (waiting) return;
    stopPreviousSource();
    const prev = Math.max(0, currentIndexRef.current - 1);
    currentIndexRef.current = prev;
    setCurrentIndex(prev);
    playItem(prev);
  };

  const handleNext = () => {
    if (waiting) return;
    stopPreviousSource();
    const next = Math.min(items.length - 1, currentIndexRef.current + 1);
    currentIndexRef.current = next;
    setCurrentIndex(next);
    playItem(next);
  };

  const handleStop = () => {
    stopPreviousSource();
    setIsPlaying(false);
    setCurrentPlayback(null);
    segRef.current = null;
    loadedUrlRef.current = null;
    onClose();
  };

  const currentItem = items[currentIndex];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-ink-50 dark:bg-ink-900 border-t border-ink-200 dark:border-ink-800 shadow-lg animate-slide-up">
      <audio ref={audioRef} />
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={handlePrev} disabled={waiting || currentIndex <= 0} className="btn-ghost !p-2 disabled:opacity-30">
          <SkipBack size={18} />
        </button>

        <button onClick={handlePlayPause} disabled={waiting} className="btn-primary !p-2.5 !rounded-full disabled:opacity-50" style={{ minWidth: "44px" }}>
          {loading || waiting ? <Loader2 size={18} className="animate-spin" /> : isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <button onClick={handleNext} disabled={waiting || currentIndex >= items.length - 1} className="btn-ghost !p-2 disabled:opacity-30">
          <SkipForward size={18} />
        </button>

        <div className="flex-1 min-w-0 px-2">
          {waiting ? (
            <p className="text-xs font-sans text-ink-600 dark:text-ink-300">Loading next scene…</p>
          ) : (
            <>
              <p className="text-xs font-sans text-ink-600 dark:text-ink-300 truncate">
                {currentItem ? currentItem.plainText.slice(0, 80) + (currentItem.plainText.length > 80 ? "…" : "") : ""}
              </p>
              <p className="text-xs font-sans text-ink-400 mt-0.5">
                {currentIndex + 1} / {items.length}
                {usingBrowserTTS && " · browser voice"}
                {currentPlayback?.mode === "manifest" && " · recorded"}
                {currentPlayback?.mode === "api" && " · generated"}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`text-xs font-sans px-1.5 py-1 rounded transition-colors ${
                speed === s
                  ? "bg-accent-500 text-white"
                  : "text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-800"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <button onClick={handleStop} className="btn-ghost !p-2">
          <Square size={16} />
        </button>

        <button onClick={onClose} className="btn-ghost !p-2">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
