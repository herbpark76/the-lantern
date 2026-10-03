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
  manifest: NarrationManifest | null;
  manifestUrl: string | null;
  storySlug: string;
  authToken: string;
  speed: number;
  onSpeedChange: (s: number) => void;
  onClose: () => void;
  onHighlight: (itemIndex: number) => void;
  startIndex?: number;
}

const SPEEDS = [0.9, 1, 1.1, 1.25, 1.5];

export function NarrationPlayer({
  items, manifest, manifestUrl, storySlug, authToken,
  speed, onSpeedChange, onClose, onHighlight, startIndex = 0,
}: NarrationPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState<NarrationPlayback | null>(null);
  const [usingBrowserTTS, setUsingBrowserTTS] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const manifestBaseUrl = manifestUrl ? getManifestBaseUrl(manifestUrl) : "";

  // Refs for segment tracking — read by event handlers without stale closures
  const segRef = useRef<NarrationPlayback | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const currentIndexRef = useRef(startIndex);
  const advancingRef = useRef(false);
  const speedRef = useRef(speed);
  const itemsRef = useRef(items);
  const manifestRef = useRef(manifest);
  const manifestBaseUrlRef = useRef(manifestBaseUrl);
  const ttsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep refs in sync
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);
  useEffect(() => { manifestBaseUrlRef.current = manifestBaseUrl; }, [manifestBaseUrl]);

  // Fully stop whatever source is currently active
  const stopPreviousSource = useCallback(() => {
    stopBrowserSpeech();
    if (ttsIntervalRef.current) {
      clearInterval(ttsIntervalRef.current);
      ttsIntervalRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
  }, []);

  // Wait for the audio element to finish seeking to a given time
  const waitForSeeked = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      const handler = () => { audio.removeEventListener("seeked", handler); resolve(); };
      audio.addEventListener("seeked", handler);
      // Safety timeout in case 'seeked' never fires
      setTimeout(() => { audio.removeEventListener("seeked", handler); resolve(); }, 300);
    });

  // Wait for the audio element to finish loading (canplay)
  const waitForCanPlay = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      const handler = () => { audio.removeEventListener("canplay", handler); resolve(); };
      audio.addEventListener("canplay", handler);
    });

  const playItemRef = useRef<(idx: number) => Promise<void>>(async () => {});

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

      // Read the PREVIOUS segment before overwriting the ref
      const prev = segRef.current;

      // Stop any previous non-manifest source (TTS interval, API audio, etc.)
      // Only keep the audio playing if prev was a manifest segment in the same file
      const prevWasContiguousManifest =
        prev && prev.mode === "manifest" && prev.audioUrl === next.audioUrl &&
        loadedUrlRef.current === next.audioUrl;

      if (!prevWasContiguousManifest) {
        stopPreviousSource();
      }

      // Now assign the new segment
      segRef.current = next;
      setCurrentPlayback(next);

      const audio = audioRef.current;
      if (!audio) return;

      // Contiguous fast-path: ONLY after a manifest item, same file loaded, currently playing, times align
      if (prevWasContiguousManifest && !audio.paused &&
          prev && prev.end !== undefined && next.start !== undefined &&
          Math.abs(next.start - prev.end) < 0.15) {
        audio.playbackRate = speedRef.current;
        setIsPlaying(true);
        return;
      }

      // Not contiguous (or switching from non-manifest) — reload file if needed
      const needsLoad = loadedUrlRef.current !== next.audioUrl || !audio.currentSrc;
      if (needsLoad && next.audioUrl) {
        audio.src = next.audioUrl;
        await waitForCanPlay(audio);
        audio.load();
        loadedUrlRef.current = next.audioUrl;
      }

      audio.playbackRate = speedRef.current;
      if (next.start !== undefined) {
        audio.currentTime = next.start;
        await waitForSeeked(audio);
      }

      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Retry once after load completes
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

    // Stop any previous source before switching to API/TTS
    stopPreviousSource();

    // Only call edge function when manifest truly has no entry
    setLoading(true);
    setUsingBrowserTTS(false);
    const url = await narrateViaEdgeFunction(storySlug, item.plainText, authToken);
    setLoading(false);

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
  }, [onHighlight, storySlug, authToken, goToNext, stopPreviousSource]);

  // Keep playItemRef in sync
  useEffect(() => { playItemRef.current = playItem; }, [playItem]);

  // Audio event handlers — read from refs, not state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const seg = segRef.current;
      if (!seg || seg.mode !== "manifest" || seg.end === undefined) return;
      if (advancingRef.current) return;

      if (audio.currentTime >= seg.end) {
        // Check if next segment is in the same file and contiguous
        const nextIdx = currentIndexRef.current + 1;
        if (nextIdx < itemsRef.current.length) {
          const nextItem = itemsRef.current[nextIdx];
          const nextSeg = resolveNarration(nextItem, manifestRef.current, manifestBaseUrlRef.current);
          if (nextSeg && nextSeg.mode === "manifest" &&
              nextSeg.audioUrl === seg.audioUrl &&
              nextSeg.audioUrl === loadedUrlRef.current &&
              !audio.paused &&
              nextSeg.start !== undefined &&
              Math.abs(nextSeg.start - seg.end) < 0.15) {
            // Contiguous in same file — don't pause, just advance segRef
            currentIndexRef.current = nextIdx;
            setCurrentIndex(nextIdx);
            onHighlight(nextIdx);
            segRef.current = nextSeg;
            setCurrentPlayback(nextSeg);
            return;
          }
        }
        // Not contiguous — pause and advance
        audio.pause();
        goToNext();
      }
    };

    const onEnded = () => {
      const seg = segRef.current;
      if (seg?.mode !== "manifest") {
        goToNext();
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [goToNext, onHighlight]);

  // Start playing on mount, and jump when the user taps a paragraph
  // (startIndex changes but currentIndexRef hasn't, so they differ).
  // When the player itself advances and calls onHighlight, the parent feeds
  // the same index back as startIndex — currentIndexRef already matches, so we skip.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      void playItemRef.current(startIndex);
      return;
    }
    if (startIndex === currentIndexRef.current) return;
    stopPreviousSource();
    void playItemRef.current(startIndex);
  }, [startIndex, stopPreviousSource]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBrowserSpeech();
      if (ttsIntervalRef.current) clearInterval(ttsIntervalRef.current);
    };
  }, []);

  // Update playback rate
  useEffect(() => {
    if (audioRef.current && !usingBrowserTTS) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, usingBrowserTTS]);

  const handlePlayPause = () => {
    if (isPlaying) {
      if (usingBrowserTTS) {
        stopBrowserSpeech();
      } else {
        audioRef.current?.pause();
      }
      setIsPlaying(false);
    } else {
      if (usingBrowserTTS) {
        playItem(currentIndex);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    }
  };

  const handlePrev = () => {
    stopPreviousSource();
    const prev = Math.max(0, currentIndexRef.current - 1);
    currentIndexRef.current = prev;
    setCurrentIndex(prev);
    playItem(prev);
  };

  const handleNext = () => {
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
        <button onClick={handlePrev} disabled={currentIndex <= 0} className="btn-ghost !p-2 disabled:opacity-30">
          <SkipBack size={18} />
        </button>

        <button onClick={handlePlayPause} className="btn-primary !p-2.5 !rounded-full" style={{ minWidth: "44px" }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <button onClick={handleNext} disabled={currentIndex >= items.length - 1} className="btn-ghost !p-2 disabled:opacity-30">
          <SkipForward size={18} />
        </button>

        <div className="flex-1 min-w-0 px-2">
          <p className="text-xs font-sans text-ink-600 dark:text-ink-300 truncate">
            {currentItem ? currentItem.plainText.slice(0, 80) + (currentItem.plainText.length > 80 ? "…" : "") : ""}
          </p>
          <p className="text-xs font-sans text-ink-400 mt-0.5">
            {currentIndex + 1} / {items.length}
            {usingBrowserTTS && " · browser voice"}
            {currentPlayback?.mode === "manifest" && " · recorded"}
            {currentPlayback?.mode === "api" && " · generated"}
          </p>
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
