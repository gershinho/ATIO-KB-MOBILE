import { useState, useCallback, useRef } from 'react';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { transcribeAudio } from '../services/api';
import { createLogger } from '../utils/logger';

const log = createLogger('speech');

/**
 * Reusable hook for speech-to-text using expo-audio + backend Whisper.
 *
 * Records audio on-device (works in Expo Go — no native module required),
 * uploads the recording to the backend /api/transcribe endpoint which
 * forwards it to OpenAI Whisper, and returns the transcribed text.
 *
 * @param {(text: string, isFinal: boolean) => void} onTranscript
 *   Called with the final transcription when recording stops.
 *   isFinal is always true (no streaming partials with this approach).
 */
export default function useSpeechToText(onTranscript) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // transcribeAudio builds specific messages ("Transcription not available.
  // Set OPENAI_API_KEY on the server.", permission denials, timeouts). These
  // used to be console.log'd and dropped, so the mic button simply did nothing
  // and the user had no way to know why. Callers can now render this.
  const [error, setError] = useState(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const toggle = useCallback(async () => {
    if (isListening) {
      // Stop recording and transcribe
      setIsListening(false);
      setIsTranscribing(true);

      try {
        await recorder.stop();
        const uri = recorder.uri;

        if (!uri) {
          log.failed('Recording produced no audio file');
          setError('Recording failed. Please try again.');
          setIsTranscribing(false);
          return;
        }

        const result = await transcribeAudio(uri);
        const text = result?.text?.trim() || '';

        if (text) {
          onTranscriptRef.current(text, true);
        } else {
          setError("Didn't catch that. Try speaking again.");
        }
      } catch (err) {
        log.failed('Transcription failed:', err);
        setError(err.message || 'Transcription failed. Please try again.');
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Start recording — iOS requires recording mode to be enabled first
    setError(null);
    try {
      const permStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!permStatus.granted) {
        log.failed('Microphone permission denied');
        setError('Microphone access is off. Enable it in Settings to use voice search.');
        return;
      }

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsListening(true);
    } catch (err) {
      log.failed('Could not start recording:', err);
      setError(err.message || 'Could not start recording.');
      setIsListening(false);
    }
  }, [isListening, recorder]);

  const clearError = useCallback(() => setError(null), []);

  return { isListening, isTranscribing, toggle, error, clearError };
}
