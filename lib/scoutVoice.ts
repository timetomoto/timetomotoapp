// ---------------------------------------------------------------------------
// Scout voice integration — stubs for wake word + speech
// Implementation requires expo-av (recording) and expo-speech (TTS).
// These stubs allow the app to compile and run without native modules.
// Replace with real implementations in a dev build session.
// ---------------------------------------------------------------------------

/** Whether we're listening for "Hey Scout" wake word */
export let isWakeWordListening = false;

/** Whether we're recording a voice command after wake word detected */
export let isRecordingCommand = false;

export async function startListeningForWakeWord(): Promise<void> {
  isWakeWordListening = true;
}

export async function stopListeningForWakeWord(): Promise<void> {
  isWakeWordListening = false;
}

export async function startRecordingCommand(): Promise<string> {
  isRecordingCommand = true;
  return '';
}

export async function stopRecordingCommand(): Promise<void> {
  isRecordingCommand = false;
}

export async function speakResponse(_text: string): Promise<void> {
  // Stub — expo-speech in dev build
}

export async function stopSpeaking(): Promise<void> {
  // Stub — expo-speech in dev build
}
