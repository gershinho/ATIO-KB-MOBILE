import { useState, useCallback, useRef } from 'react';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { transcribeAudio } from '../config/api';

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
          console.log('[STT] No recording URI');
          setIsTranscribing(false);
          return;
        }

        const result = await transcribeAudio(uri);
        const text = result?.text?.trim() || '';

        if (text) {
          onTranscriptRef.current(text, true);
        }
      } catch (err) {
        console.log('[STT] Transcription error:', err.message || err);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Start recording — iOS requires recording mode to be enabled first
    try {
      const permStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!permStatus.granted) {
        console.log('[STT] Microphone permission denied');
        return;
      }

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsListening(true);
    } catch (err) {
      console.log('[STT] Recording start error:', err.message || err);
      setIsListening(false);
    }
  }, [isListening, recorder]);

  return { isListening, isTranscribing, toggle };
}
