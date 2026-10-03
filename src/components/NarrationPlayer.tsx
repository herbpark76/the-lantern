import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Square, Volume2, X, Loader2,
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
  const lastFileRef = useRef<string | null>(null);

  const playItem = useCallback(async (idx: number) => {
    if (idx >= items.length) {
      setIsPlaying(false);
      setCurrentPlayback(null);
      return;
    }
    const item = items[idx];
    onHighlight(idx);
    setCurrentIndex(idx);

    const manifestPlayback = resolveNarration(item, manifest, manifestBaseUrl);
    if (manifestPlayback) {
      setLoading(false);
      setUsingBrowserTTS(false);
      setCurrentPlayback(manifestPlayback);

      const audio = audioRef.current;
      if (!audio) return;

      const urlChanged = !lastFileRef.current || !manifestPlayback.audioUrl?.endsWith(lastFileRef.current);
      if (urlChanged && manifestPlayback.audioUrl) {
        audio.src = manifestPlayback.audioUrl;
        lastFileRef.current = manifestPlayback.audioUrl.split("/").pop() ?? null;
        await new Promise<void>((resolve) => {
          audio.oncanplay = () => resolve();
          audio.load();
        });
      }
      audio.playbackRate = speed;
      if (manifestPlayback.start !== undefined) {
        audio.currentTime = manifestPlayback.start;
      }
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    // Try edge function
    setLoading(true);
    setUsingBrowserTTS(false);
    const url = await narrateViaEdgeFunction(storySlug, item.plainText, authToken);
    setLoading(false);

    if (url) {
      setCurrentPlayback({ mode: "api", audioUrl: url, start: 0 });
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      lastFileRef.current = null;
      audio.playbackRate = speed;
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    // Fallback: browser speech synthesis
    setCurrentPlayback({ mode: "tts" });
    setUsingBrowserTTS(true);
    setIsPlaying(true);
    speakViaBrowser(item.plainText);
    const checkEnd = setInterval(() => {
      if (typeof window !== "undefined" && !window.speechSynthesis.speaking) {
        clearInterval(checkEnd);
        advance();
      }
    }, 200);
  }, [items, manifest, manifestBaseUrl, onHighlight, speed, storySlug, authToken]);

  const advance = useCallback(() => {
    stopBrowserSpeech();
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= items.length) {
        setIsPlaying(false);
        setCurrentPlayback(null);
        return prev;
      }
      playItem(next);
      return next;
    });
  }, [items.length, playItem]);

  // Handle audio ended
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (currentPlayback?.mode === "manifest" && currentPlayback.end !== undefined) {
        if (audio.currentTime >= currentPlayback.end) {
          audio.pause();
          advance();
        }
      }
    };
    const onEnded = () => {
      if (currentPlayback?.mode !== "manifest") {
        advance();
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentPlayback, advance]);

  // Start playing when component mounts or startIndex changes
  useEffect(() => {
    if (isPlaying) {
      playItem(currentIndex);
    }
  }, []);

  // Update playback rate
  useEffect(() => {
    if (audioRef.current && !usingBrowserTTS) {
      audioRef.current.playbackRate = speed;
    }
    if (usingBrowserTTS && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      if (isPlaying) playItem(currentIndex);
    }
  }, [speed]);

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
    stopBrowserSpeech();
    const prev = Math.max(0, currentIndex - 1);
    setCurrentIndex(prev);
    playItem(prev);
  };

  const handleNext = () => {
    stopBrowserSpeech();
    const next = Math.min(items.length - 1, currentIndex + 1);
    setCurrentIndex(next);
    playItem(next);
  };

  const handleStop = () => {
    stopBrowserSpeech();
    audioRef.current?.pause();
    setIsPlaying(false);
    setCurrentPlayback(null);
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
