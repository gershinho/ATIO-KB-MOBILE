/**
 * Web twin of useSpeechToText.
 *
 * The native hook records with expo-audio, whose recorder has no browser
 * implementation, and uploads the file to the backend for Whisper. Replacing
 * the whole hook keeps expo-audio out of the web bundle.
 *
 * Dictation is reported as unavailable and the callers hide the mic, rather
 * than offering a button that cannot work.
 *
 * Worth knowing for later: browsers *can* record audio (getUserMedia plus
 * MediaRecorder), and the backend already accepts whatever format it is given —
 * it reads the extension off the filename and passes the file to Whisper. So a
 * real web microphone is a small piece of work, deliberately out of scope here.
 * See docs/WEB-SUPPORT-MATRIX.md.
 *
 * @returns {{isListening: boolean, isTranscribing: boolean, toggle: () => Promise<void>,
 *   error: null, clearError: () => void, unavailable: true}}
 */
import { useCallback } from 'react';

export default function useSpeechToText(_onTranscript) {
  const toggle = useCallback(async () => {}, []);
  const clearError = useCallback(() => {}, []);

  return {
    isListening: false,
    isTranscribing: false,
    toggle,
    error: null,
    clearError,
    // Absent from the native hook, so `unavailable` is undefined there and the
    // mic renders as usual.
    unavailable: true,
  };
}
