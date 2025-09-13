import { useState, useRef, useCallback, useEffect } from 'react';
import { ttsService } from '../lib/tts-service';
import { playClickSound } from '../lib/sounds';
import { toast } from 'sonner';
import { useUnifiedAIStreaming } from './use-unified-ai-streaming';
import { ChatMessage } from '@/lib/utils';

// Add proper types for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: 'not-allowed' | 'permission-denied' | 'no-speech' | 'audio-capture' | 'network' | 'aborted' | 'no-speech' | 'service-not-allowed';
  message: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface VoiceInteractionOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  useWhisper?: boolean;
  userId: string; // Required for unified AI streaming
}

interface PetVoiceInteractionState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  transcribedText: string;
  error: string | null;
}

export const usePetVoiceInteraction = (options: VoiceInteractionOptions) => {
  // State management
  const [state, setState] = useState<PetVoiceInteractionState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    transcribedText: '',
    error: null,
  });

  // Refs for cleanup and state management
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isCancelledRef = useRef<boolean>(false);

  // Get the AI streaming service for processing responses
  const { sendMessage } = useUnifiedAIStreaming({
    userId: options.userId,
    onResponseComplete: (response) => {
      // Handle response completion if needed
    }
  });

  // Process transcribed text and get AI response
  const processVoiceInput = useCallback(async () => {
    if (!state.transcribedText.trim()) return;

    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      // Get AI response using unified streaming
      const response = await sendMessage(
        state.transcribedText,
        [], // Empty chat history for now
        {} as any // No spelling question for pet interactions
      );
      
      if (response) {
        // Speak the response using TTS
        setState(prev => ({ ...prev, isSpeaking: true }));
        await ttsService.speak(response.textContent, {
          voice: options.voiceId,
          stability: options.stability,
          similarity_boost: options.similarityBoost,
          speed: options.speed
        });
      }
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isSpeaking: false,
        transcribedText: ''
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isSpeaking: false,
        error: 'Failed to process voice input'
      }));
      toast.error("Failed to process voice input – please try again.");
    }
  }, [state.transcribedText, options, sendMessage]);

  // Initialize speech recognition with better error handling
  const initializeSpeechRecognition = useCallback(async () => {
    try {
      // First, check if we have microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately as we just needed it for permission
      stream.getTracks().forEach(track => track.stop());

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Speech recognition is not supported in this browser. Please try using Chrome, Edge, or Safari.");
        return null;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Add more detailed error handling
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        let errorMessage = "Microphone error – please try again.";
        
        switch (event.error) {
          case 'not-allowed':
          case 'permission-denied':
            errorMessage = "Microphone access was denied. Please allow microphone access and try again.";
            break;
          case 'no-speech':
            errorMessage = "No speech was detected. Please try speaking again.";
            break;
          case 'audio-capture':
            errorMessage = "No microphone was found. Please check your microphone connection.";
            break;
          case 'network':
            errorMessage = "Network error occurred. Please check your internet connection.";
            break;
          case 'aborted':
            // Don't show error for user-initiated cancellation
            return;
          default:
            errorMessage = `Microphone error: ${event.error}. Please try again.`;
        }

        setState(prev => ({
          ...prev,
          isListening: false,
          error: errorMessage
        }));
        toast.error(errorMessage);
      };

      return recognition;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.error("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
      } else {
        toast.error("Failed to initialize microphone. Please check your microphone connection and browser settings.");
      }
      return null;
    }
  }, []);

  // Start browser-based speech recognition with better error recovery
  const startBrowserSpeechRecognition = useCallback(async () => {
    const recognition = await initializeSpeechRecognition();
    if (!recognition) return;

    recognition.onstart = () => {
      setState(prev => ({ ...prev, isListening: true, error: null }));
      isCancelledRef.current = false;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (state.isProcessing || isCancelledRef.current) return;

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setState(prev => ({
        ...prev,
        transcribedText: finalTranscript + interimTranscript
      }));
    };

    recognition.onend = () => {
      // If we're still supposed to be listening but recognition stopped,
      // try to restart it (common on some mobile browsers)
      if (state.isListening && !isCancelledRef.current) {
        try {
          recognition.start();
        } catch (error) {
          setState(prev => ({ ...prev, isListening: false }));
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      toast.error("Failed to start speech recognition. Please try again.");
      setState(prev => ({ ...prev, isListening: false, error: "Failed to start speech recognition" }));
    }
  }, [initializeSpeechRecognition, state.isListening, state.isProcessing]);

  // Start Whisper-based recording
  const startWhisperRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setState(prev => ({ ...prev, isListening: true, error: null }));
        chunksRef.current = [];
        isCancelledRef.current = false;
      };

      mediaRecorder.onstop = async () => {
        if (!isCancelledRef.current) {
          setState(prev => ({ ...prev, isListening: false, isProcessing: true }));
          
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          try {
            // Here you would send the audioBlob to your Whisper processing endpoint
            // For now, we'll just simulate it with a timeout
            await new Promise(resolve => setTimeout(resolve, 1000));
            setState(prev => ({
              ...prev,
              isProcessing: false,
              transcribedText: "Whisper transcription would appear here"
            }));
          } catch (error) {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: 'Failed to transcribe audio'
            }));
            toast.error("Failed to transcribe audio – please try again.");
          }
        }
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to access microphone'
      }));
      toast.error("Failed to access microphone – please check permissions.");
    }
  }, []);

  // Start voice interaction
  const startListening = useCallback(() => {
    playClickSound();
    ttsService.stop(); // Stop any ongoing TTS

    if (state.isListening) {
      // Stop recording and process input
      if (options.useWhisper && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      } else if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setState(prev => ({ ...prev, isListening: false }));
      // Process the transcribed text after a short delay to ensure we have the final transcript
      setTimeout(() => {
        processVoiceInput();
      }, 100);
      return;
    }

    // Clear previous transcription
    setState(prev => ({ ...prev, transcribedText: '', error: null }));

    // Start new recording
    if (options.useWhisper) {
      startWhisperRecording();
    } else {
      startBrowserSpeechRecognition();
    }
  }, [state.isListening, options.useWhisper, startWhisperRecording, startBrowserSpeechRecognition, processVoiceInput]);

  // Cancel voice interaction
  const cancelListening = useCallback(() => {
    isCancelledRef.current = true;
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isListening: false,
      isProcessing: false,
      transcribedText: '',
      error: null
    }));
  }, []);

  // Stop all voice interaction
  const stopAll = useCallback(() => {
    cancelListening();
    ttsService.stop();
    setState(prev => ({
      ...prev,
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      transcribedText: '',
      error: null
    }));
  }, [cancelListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  return {
    ...state,
    startListening,
    cancelListening,
    processVoiceInput,
    stopAll
  };
}; 