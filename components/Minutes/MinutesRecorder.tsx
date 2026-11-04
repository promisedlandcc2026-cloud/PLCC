import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import {
  formatRecorderDuration,
  joinTranscriptChunks,
  MINUTES_CHUNK_SECONDS,
  MINUTES_MAX_RECORD_SECONDS,
  pickMinutesRecorderMimeType,
  summarizeTranscript,
} from '../../api/_utils/minutesRecorder.js';

type Props = {
  disabled?: boolean;
  onTranscribed: (result: { transcript: string; summary: string; audioUrl?: string | null }) => void;
  onError?: (message: string) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
};

const MinutesRecorder: React.FC<Props> = ({ disabled, onTranscribed, onError, getAuthHeaders }) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [liveNotes, setLiveNotes] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const sessionIdRef = useRef('');
  const chunkIndexRef = useRef(0);
  const transcriptPartsRef = useRef<string[]>([]);
  const mimeRef = useRef('audio/webm');
  const startSegmentRef = useRef<() => void>(() => {});

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    cleanupTimers();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [cleanupTimers]);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const publishParts = useCallback(
    (audioUrl?: string | null) => {
      const transcript = joinTranscriptChunks(transcriptPartsRef.current);
      setLiveNotes(transcript);
      onTranscribed({
        transcript,
        summary: summarizeTranscript(transcript),
        audioUrl: audioUrl || null,
      });
    },
    [onTranscribed]
  );

  const uploadAndTranscribe = useCallback(
    async (blob: Blob) => {
      if (!blob.size) return;
      setBusy(true);
      onError?.('');
      try {
        const headers = await getAuthHeaders();
        const mimeType = blob.type || mimeRef.current || 'audio/webm';
        const idx = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        const urlRes = await fetch('/api/vault?resource=minutes&subResource=audio-upload-url', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType,
            sessionId: sessionIdRef.current,
            chunkIndex: idx,
          }),
        });
        const urlData = await urlRes.json().catch(() => ({}));
        if (!urlRes.ok || !urlData.signedUrl) {
          throw new Error(urlData.error || 'Could not start audio upload');
        }
        const put = await fetch(String(urlData.signedUrl), {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob,
        });
        if (!put.ok) {
          throw new Error(`Audio upload failed (${put.status})`);
        }
        const txRes = await fetch('/api/vault?resource=minutes&subResource=transcribe-stored', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: urlData.path, mimeType }),
        });
        const txData = await txRes.json().catch(() => ({}));
        if (!txRes.ok) throw new Error(txData.error || 'Transcription failed');
        transcriptPartsRef.current.push(String(txData.transcript || ''));
        setChunkCount(transcriptPartsRef.current.length);
        publishParts(txData.audioUrl || null);
      } catch (e: any) {
        onError?.(e?.message || 'Could not transcribe this segment');
      } finally {
        setBusy(false);
      }
    },
    [getAuthHeaders, onError, publishParts]
  );

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !recordingRef.current) return;
    const localChunks: BlobPart[] = [];
    const mimeType = mimeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) localChunks.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'audio/webm';
      void uploadAndTranscribe(new Blob(localChunks, { type }));
    };
    mediaRef.current = recorder;
    recorder.start(1000);
    segmentTimerRef.current = window.setTimeout(() => {
      if (!recordingRef.current) return;
      try {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
      } catch {
        /* ignore */
      }
      startSegmentRef.current();
    }, MINUTES_CHUNK_SECONDS * 1000);
  }, [uploadAndTranscribe]);

  useEffect(() => {
    startSegmentRef.current = startSegment;
  }, [startSegment]);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    cleanupTimers();
    try {
      if (mediaRef.current && mediaRef.current.state !== 'inactive') {
        mediaRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [cleanupTimers]);

  const startRecording = async () => {
    if (disabled) return;
    onError?.('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickMinutesRecorderMimeType();
      sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      chunkIndexRef.current = 0;
      transcriptPartsRef.current = [];
      setChunkCount(0);
      setLiveNotes('');
      setSeconds(0);
      recordingRef.current = true;
      setRecording(true);
      startSegment();
      timerRef.current = window.setInterval(() => {
        setSeconds((n) => {
          const next = n + 1;
          if (next >= MINUTES_MAX_RECORD_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e: any) {
      cleanupStream();
      recordingRef.current = false;
      setRecording(false);
      onError?.(e?.message || 'Microphone access was denied.');
    }
  };

  return (
    <div
      className="rounded-2xl border border-gold/25 bg-[#0d1a14]/[0.03] p-4 space-y-3"
      data-minutes-recorder="true"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#0d1a14]">
            Record & transcribe
          </p>
          <p className="text-xs text-gray-500 font-medium">
            Built for ~1 hour huddles. We upload and transcribe every {MINUTES_CHUNK_SECONDS / 60}{' '}
            minutes so a long meeting never hits the server upload limit. Max 90 minutes.
          </p>
        </div>
        <span className="text-sm font-black tabular-nums text-[#0d1a14]">
          {formatRecorderDuration(seconds)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void startRecording()}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#0d1a14] text-[#C9A35A] text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
            data-minutes-recorder-action="start"
          >
            <Mic size={14} /> Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest"
            data-minutes-recorder-action="stop"
          >
            <Square size={14} /> Stop
          </button>
        )}
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#0d1a14]">
            <Loader2 size={14} className="animate-spin" /> Transcribing segment…
          </span>
        ) : null}
        {chunkCount > 0 ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {chunkCount} segment{chunkCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      {liveNotes ? (
        <p className="text-[11px] text-gray-500 line-clamp-3">{liveNotes}</p>
      ) : null}
    </div>
  );
};

export default MinutesRecorder;
