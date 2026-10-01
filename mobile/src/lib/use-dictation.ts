// Speaking instead of typing, with the phone's own speech recogniser
// (expo-speech-recognition): words appear as they're said, and it stops
// by itself when the speaker pauses. What was already typed is kept -
// the spoken words are added after it.
import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechModule = typeof import('expo-speech-recognition');

// Native code: present in real builds, missing from Expo Go, where
// importing it would throw and take every screen down with it. Without
// it, `available` is false and the microphone simply isn't offered.
let speech: SpeechModule | null = null;
try {
  speech = require('expo-speech-recognition') as SpeechModule;
} catch {
  speech = null;
}

// Errors that just mean "nothing was said" or "you stopped it".
const QUIET_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout']);
const NEEDS_MICROPHONE = 'RoadVerdict needs the microphone to hear you. You can allow it in your phone’s settings.';

// Asks for the microphone up front (the first time the app opens) - the
// same permission tapping the microphone would ask for. Without the
// native module (Expo Go) there's nothing to ask for.
export async function requestMicrophone(): Promise<void> {
  if (!speech) return;
  await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => {});
}

export function useDictation(text: string, setText: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The text as it was when listening started, so each partial result
  // replaces the last one instead of piling up.
  const before = useRef('');
  const setTextRef = useRef(setText);
  setTextRef.current = setText;

  useEffect(() => {
    if (!speech) return;
    const recognizer = speech.ExpoSpeechRecognitionModule;
    const subscriptions = [
      recognizer.addListener('start', () => setListening(true)),
      recognizer.addListener('end', () => setListening(false)),
      recognizer.addListener('result', (event) => {
        const spoken = event.results[0]?.transcript ?? '';
        setTextRef.current(`${before.current}${before.current && spoken ? ' ' : ''}${spoken}`);
      }),
      recognizer.addListener('error', (event) => {
        setListening(false);
        if (QUIET_ERRORS.has(event.error)) return;
        setProblem(
          event.error === 'not-allowed'
            ? NEEDS_MICROPHONE
            : event.error === 'network'
              ? 'Voice typing needs a connection. Check it and try again.'
              : 'Voice typing didn’t work that time. Try again, or type it instead.'
        );
      }),
    ];
    return () => {
      subscriptions.forEach((s) => s.remove());
      recognizer.abort();
    };
  }, []);

  const start = useCallback(async () => {
    if (!speech) return;
    setProblem(null);
    const permission = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setProblem(NEEDS_MICROPHONE);
      return;
    }
    before.current = text.trim();
    speech.ExpoSpeechRecognitionModule.start({ lang: 'en-GB', interimResults: true, continuous: false, addsPunctuation: true });
  }, [text]);

  const stop = useCallback(() => speech?.ExpoSpeechRecognitionModule.stop(), []);

  const available = !!speech && speech.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  return { listening, problem, start, stop, available };
}
