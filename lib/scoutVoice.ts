// ---------------------------------------------------------------------------
// Scout voice integration — stubs for wake word + speech
// Implementation requires expo-av (recording) and expo-speech (TTS).
// These stubs allow the app to compile and run in Expo Go.
// Replace with real implementations in a dev build session.
// ---------------------------------------------------------------------------

/** Whether we're listening for "Hey Scout" wake word */
export let isWakeWordListening = false;

/** Whether we're recording a voice command after wake word detected */
export let isRecordingCommand = false;

/**
 * Start listening for the "Hey Scout" wake phrase.
 * Requires expo-av Audio recording — stub until dev build.
 */
export async function startListeningForWakeWord(): Promise<void> {
  // TODO: dev build — start Audio.Recording in chunks,
  // transcribe each chunk, check for WAKE_PHRASE
  console.log('[ScoutVoice] startListeningForWakeWord — stub');
  isWakeWordListening = true;
}

/**
 * Stop listening for wake word.
 */
export async function stopListeningForWakeWord(): Promise<void> {
  console.log('[ScoutVoice] stopListeningForWakeWord — stub');
  isWakeWordListening = false;
}

/**
 * Start recording a voice command (after wake word detected).
 * Records until silence threshold or max duration.
 * Returns the transcribed text.
 */
export async function startRecordingCommand(): Promise<string> {
  // TODO: dev build — start Audio.Recording, detect silence,
  // transcribe via Gemini or Whisper, return text
  console.log('[ScoutVoice] startRecordingCommand — stub');
  isRecordingCommand = true;
  return '';
}

/**
 * Stop recording a voice command early.
 */
export async function stopRecordingCommand(): Promise<void> {
  console.log('[ScoutVoice] stopRecordingCommand — stub');
  isRecordingCommand = false;
}

/**
 * Speak Scout's response via text-to-speech.
 * Requires expo-speech — stub until dev build.
 */
export async function speakResponse(text: string): Promise<void> {
  // TODO: dev build — Speech.speak(text, { language, rate, pitch })
  console.log('[ScoutVoice] speakResponse — stub:', text);
}

/**
 * Stop any active speech output.
 */
export async function stopSpeaking(): Promise<void> {
  // TODO: dev build — Speech.stop()
  console.log('[ScoutVoice] stopSpeaking — stub');
}
