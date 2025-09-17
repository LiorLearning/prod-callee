import React, { useState, useEffect, useMemo } from 'react';
import { useCoins } from '@/pages/coinSystem';
import { ttsService } from '@/lib/tts-service';
import { useTTSSpeaking } from '@/hooks/use-tts-speaking';
import { usePetData } from '@/lib/pet-data-service';
import { useAuth } from '@/hooks/use-auth';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import pupOpen from '@/assets/faceSwap (1).gif';
import littleKid from '@/assets/little-kid.png';
import { EvolutionMenu } from '@/components/ui/evolution-menu';
import { petAIService } from '@/lib/pet-ai-service';

type Props = {};

type SpeechRecognitionType = any;

type ActionStatus = 'happy' | 'sad' | 'neutral';

interface ActionButton {
  id: string;
  icon: string | React.ReactNode;
  status: ActionStatus;
  label: string;
}

export function PetPage({}: Props): JSX.Element {
  // Use shared coin system
  const { coins, spendCoins, hasEnoughCoins, setCoins } = useCoins();
  
  // Use shared pet data system
  const { careLevel, ownedPets, audioEnabled, setCareLevel, addOwnedPet, setAudioEnabled, isPetOwned, getCoinsSpentForCurrentStage, getPetCoinsSpent, addPetCoinsSpent } = usePetData();
  
  // State for which pet is currently being displayed
  const [currentPet, setCurrentPet] = useState('dog'); // Default to dog
  
  // Local state for UI interactions
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [previousCoinsSpentForStage, setPreviousCoinsSpentForStage] = useState(0);
  const [showPetShop, setShowPetShop] = useState(false);
  const [lastSpokenMessage, setLastSpokenMessage] = useState('');
  const [transcribedMessage, setTranscribedMessage] = useState('');
  const [aiResponse, setAiResponse] = useState(''); // Add this line

  // Streak system for dog evolution unlocks - based on consecutive calendar days (US timezone)
  const [currentStreak, setCurrentStreak] = useState(() => {
    try {
      const streakData = localStorage.getItem('pet_feeding_streak_data');
      if (streakData) {
        const parsed = JSON.parse(streakData);
        return Math.max(0, parsed.streak || 0);
      }
      return 0;
    } catch {
      return 0;
    }
  });

  // Add state for evolution menu
  const [showEvolutionMenu, setShowEvolutionMenu] = useState(false);

  // Add new state for eating animation
  const [isEating, setIsEating] = useState(false);
  const [showCookieParticles, setShowCookieParticles] = useState(false);

  // Add these state declarations after other useState declarations
  const [userGuess, setUserGuess] = useState<string[]>([]);
  const [isGuessCorrect, setIsGuessCorrect] = useState(false);
  const [activeBoxIndex, setActiveBoxIndex] = useState<number>(-1);

  // Get user ID for voice interaction
  const { user } = useAuth();

  // Voice interaction state
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');

  // Voice recognition setup
  const [recognition, setRecognition] = useState<SpeechRecognitionType | null>(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setTranscribedText(transcript);
          setTranscribedMessage(transcript);
          setIsListening(false);
          handleVoiceInput(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setIsProcessing(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }
  }, []);

  // Handle voice input processing
  const handleVoiceInput = async (transcript: string) => {
    setIsProcessing(true);
    try {
      // Get the response from our pet AI service
      const response = await petAIService.generateResponse(currentPet, transcript);
      
      // Update the AI response first
      setAiResponse(response);
      
      // Add a small delay before speaking to ensure the UI has updated
      if (audioEnabled) {
        setTimeout(async () => {
          console.log('Speaking response:', response);
          await speakText(response);
        }, 500); // 500ms delay to ensure smooth transition
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);
      setAiResponse("I'm having trouble understanding right now. Could you try again?");
    } finally {
      setIsProcessing(false);
    }
  };

  // Update the voice action handler
  const handleActionClick = async (actionId: string) => {
    if (actionId === 'voice') {
      if (isListening) {
        // When stopping, stop the recognition
        if (recognition) {
          recognition.stop();
        }
        setIsListening(false);
      } else {
        setTranscribedMessage(''); // Clear previous message
        setTranscribedText(''); // Also clear transcribed text
        setIsListening(true);
        
        // Start speech recognition if available
        if (recognition) {
          try {
            await recognition.start();
          } catch (error) {
            console.error('Failed to start speech recognition:', error);
            setIsListening(false);
          }
        } else {
          console.error('Speech recognition not supported');
          setIsListening(false);
        }
      }

      // Update the voice action button with new icon and status
      setActionStates(prev => prev.map(action => 
        action.id === 'voice' 
          ? { 
              ...action, 
              icon: <Mic className={cn("text-white", isListening && "animate-pulse")} style={{ height: '2rem', width: '2rem' }} />,
              status: isListening ? 'happy' : 'neutral',
              label: isListening ? 'Stop & Send' : 'Talk'
            }
          : action
      ));
      return;
    }

    // Don't deduct coins for "More" action - always open pet shop
    if (actionId === 'more') {
      // Stop any current audio when opening pet shop
      ttsService.stop();
      setShowPetShop(true);
      return;
    }

    // Handle feeding action (water/food)
    if (actionId === 'water') {
      // Check if player has enough coins for feeding actions
      if (!hasEnoughCoins(10)) {
        alert("Not enough coins! You need 10 coins to perform this action.");
        return;
      }

      // Play feeding sound
      playFeedingSound();

      // Trigger eating animation
      setIsEating(true);
      setShowCookieParticles(true);
      
      // Reset animations after delay
      setTimeout(() => {
        setIsEating(false);
        setShowCookieParticles(false);
      }, 1000);

      // Deduct coins and increase care level
      spendCoins(10);
      setCareLevel(Math.min(careLevel + 1, 6), currentStreak);
      
      // Track coins spent on current pet
      addPetCoinsSpent(currentPet, 10);
      
      // Update streak based on calendar days
      const newStreak = updateStreak();

      // Trigger heart animation
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);

      // Update action status to happy
      setActionStates(prev => prev.map(action => 
        action.id === actionId 
          ? { ...action, status: 'happy' }
          : action
      ));
    }
  };

  // Get current date in US timezone (Eastern Time)
  const getCurrentUSDate = () => {
    const now = new Date();
    const usDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    return usDate.toDateString(); // Returns format like "Mon Jan 01 2024"
  };

  // Load and validate streak data
  const getStreakData = () => {
    try {
      const stored = localStorage.getItem('pet_feeding_streak_data');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to parse streak data:', error);
    }
    return { streak: 0, lastFeedDate: null, feedDates: [] };
  };

  // Save streak data to localStorage
  const saveStreakData = (streakData: { streak: number; lastFeedDate: string; feedDates: string[] }) => {
    try {
      localStorage.setItem('pet_feeding_streak_data', JSON.stringify(streakData));
      setCurrentStreak(streakData.streak);
    } catch (error) {
      console.warn('Failed to save streak data:', error);
    }
  };

  // Update streak based on feeding date
  const updateStreak = () => {
    const currentDate = getCurrentUSDate();
    const streakData = getStreakData();
    
    // If already fed today, don't update streak
    if (streakData.lastFeedDate === currentDate) {
      return streakData.streak;
    }

    let newStreak = streakData.streak;
    const feedDates = [...(streakData.feedDates || [])];

    // Add today's date to feed dates
    if (!feedDates.includes(currentDate)) {
      feedDates.push(currentDate);
    }

    // Check if this continues a streak
    if (streakData.lastFeedDate) {
      const lastDate = new Date(streakData.lastFeedDate);
      const today = new Date(currentDate);
      const daysDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDifference === 1) {
        // Consecutive day - increment streak
        newStreak = streakData.streak + 1;
      } else if (daysDifference > 1) {
        // Gap in feeding - reset streak to 1
        newStreak = 1;
      }
      // If daysDifference === 0, it means same day (already handled above)
    } else {
      // First time feeding
      newStreak = 1;
    }

    const newStreakData = {
      streak: newStreak,
      lastFeedDate: currentDate,
      feedDates: feedDates.slice(-30) // Keep last 30 days for performance
    };

    saveStreakData(newStreakData);
    return newStreak;
  };

  // Initialize streak and previous coins spent on component mount
  useEffect(() => {
    const streakData = getStreakData();
    if (streakData.lastFeedDate) {
      const currentDate = getCurrentUSDate();
      const lastDate = new Date(streakData.lastFeedDate);
      const today = new Date(currentDate);
      const daysDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // If more than 1 day has passed since last feeding, reset streak
      if (daysDifference > 1) {
        const resetStreakData = {
          streak: 0,
          lastFeedDate: streakData.lastFeedDate,
          feedDates: streakData.feedDates || []
        };
        saveStreakData(resetStreakData);
      }
    }
    
    // Initialize previous coins spent for current stage
    setPreviousCoinsSpentForStage(getCoinsSpentForCurrentStage(currentStreak));
  }, []);

  // TTS message ID for tracking speaking state
  const petMessageId = 'pet-message';
  const isSpeaking = useTTSSpeaking(petMessageId);

  // Add voice button to action buttons
  const voiceAction: ActionButton = {
    id: 'voice',
    icon: <Mic className={cn("text-white", isListening && "animate-pulse")} style={{ height: '2rem', width: '2rem' }} />,
    status: isListening ? 'happy' : 'neutral',
    label: isListening ? 'Stop & Send' : 'Talk'
  };

  // Update actionStates to include voice button
  const [actionStates, setActionStates] = useState<ActionButton[]>([
    { id: 'water', icon: '🍪', status: 'sad', label: 'Food' },
    voiceAction,
    { id: 'more', icon: '🐾', status: 'neutral', label: 'More' }
  ]);

  const getStatusEmoji = (status: ActionStatus) => {
    switch (status) {
      // case 'happy': return '😊';
      // case 'sad': return '😢';
      case 'neutral': return '';
      default: return '';
    }
  };

  // Sound effect functions
  const playFeedingSound = () => {
    try {
      // Create a pleasant "nom nom" eating sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a short, pleasant eating sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Pleasant "crunch" sound frequencies
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.type = 'triangle';
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio not supported');
    }
  };

  const playEvolutionSound = () => {
    try {
      // Create a magical "sparkle" evolution sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create multiple tones for a magical effect
      const frequencies = [523, 659, 784, 1047]; // C, E, G, C (major chord)
      
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + index * 0.1);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + index * 0.1);
        gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + index * 0.1 + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + index * 0.1 + 0.8);
        
        oscillator.start(audioContext.currentTime + index * 0.1);
        oscillator.stop(audioContext.currentTime + index * 0.1 + 0.8);
      });
    } catch (error) {
      console.log('Audio not supported');
    }
  };

  // Get Bobo images based on coins spent
  const getBoboImage = (coinsSpent: number) => {
    if (coinsSpent >= 50) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_011137_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else if (coinsSpent >= 30) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_011115_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else if (coinsSpent >= 10) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_011058_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_011043_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    }
  };

  // Get Feather images based on coins spent
  const getFeatherImage = (coinsSpent: number) => {
    if (coinsSpent >= 50) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250908_154758_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else if (coinsSpent >= 30) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250908_154733_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else if (coinsSpent >= 10) {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250908_155301_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    } else {
      return "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250908_154712_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
    }
  };

  const getPetImage = () => {
  return pupOpen;
    // Check if Bobo is owned and being displayed
    if (currentPet === 'bobo' && isPetOwned('bobo')) {
      // For Bobo, use pet-specific coin tracking
      const boboCoinsSpent = getPetCoinsSpent('bobo');
      return getBoboImage(boboCoinsSpent);
    }
    
    // Check if Feather is owned and being displayed
    if (currentPet === 'feather' && isPetOwned('feather')) {
      // For Feather, use pet-specific coin tracking
      const featherCoinsSpent = getPetCoinsSpent('feather');
      return getFeatherImage(featherCoinsSpent);
    }
    
    // Calculate coins spent on feeding for current evolution stage (for dog)
    const coinsSpentOnFeeding = getCoinsSpentForCurrentStage(currentStreak);


    // Check streak level for different dog evolution tiers
    let currentImage;
    
    if (currentStreak >= 3) {
      // Fully evolved dog versions for users with 3+ day streak
      if (coinsSpentOnFeeding >= 50) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001902_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 30) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001847_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 10) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001814_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001757_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      }
    } else if (currentStreak >= 2) {
      // Grown dog versions for users with 2+ day streak
      if (coinsSpentOnFeeding >= 50) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001500_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 30) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001443_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 10) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001432_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_001417_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      }
    } else {
      // Original small pup images for users with <2 day streak
      if (coinsSpentOnFeeding >= 50) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250905_160214_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 30) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250906_000902_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else if (coinsSpentOnFeeding >= 10) {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250905_160535_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      } else {
        currentImage = "https://tutor.mathkraft.org/_next/image?url=%2Fapi%2Fproxy%3Furl%3Dhttps%253A%252F%252Fdubeus2fv4wzz.cloudfront.net%252Fimages%252F20250905_160158_image.png&w=3840&q=75&dpl=dpl_2uGXzhZZsLneniBZtsxr7PEabQXN";
      }
    }
    
    // Check if pet evolved and play sound based on coins spent in current stage
    if (previousCoinsSpentForStage !== coinsSpentOnFeeding) {
      // Play sound when crossing evolution thresholds within current stage
      if ((previousCoinsSpentForStage < 30 && coinsSpentOnFeeding >= 30) || 
          (previousCoinsSpentForStage < 50 && coinsSpentOnFeeding >= 50)) {
        setTimeout(() => playEvolutionSound(), 400); // Delay to sync with animation
      }
      setPreviousCoinsSpentForStage(coinsSpentOnFeeding);
    }
    
    return currentImage;
  };

  const handlePetPurchase = (petType: string, cost: number) => {
    if (!hasEnoughCoins(cost)) {
      alert(`Not enough coins! You need ${cost} coins to buy this pet.`);
      return;
    }

    if (isPetOwned(petType)) {
      alert("You already own this pet!");
      return;
    }

    // Deduct coins and add pet to owned pets
    spendCoins(cost);
    addOwnedPet(petType);
    
    // Switch to the newly purchased pet
    setCurrentPet(petType);
    
    // Play purchase sound (reuse evolution sound for now)
    playEvolutionSound();
    
    // Special message for Bobo and Feather about arrival time
    if (petType === 'bobo' || petType === 'feather') {
      const petName = petType === 'bobo' ? 'Bobo' : 'Feather';
      alert(`🎉 Congratulations! You bought ${petName}! 🚚 Your new pet will arrive in your pet park within 24 hours!`);
    } else {
      alert(`🎉 Congratulations! You bought a ${petType}!`);
    }
  };

  const availablePets = [
    { id: 'bobo', emoji: '🐵', name: 'Bobo', cost: 60 },
    { id: 'feather', emoji: '🦜', name: 'Feather', cost: 60 }
  ];

  // ElevenLabs Text-to-Speech function using the proper TTS service
  const speakText = async (text: string) => {
    if (!audioEnabled || text === lastSpokenMessage) return;
    
    try {
      // Stop any currently playing audio
      ttsService.stop();
      
      setLastSpokenMessage(text);
      
      // Use the TTS service with a child-friendly voice and appropriate settings
      await ttsService.speak(text, {
        stability: 0.7,
        similarity_boost: 0.8,
        speed: 0.9, // Slightly slower for better comprehension
        messageId: petMessageId,
        voice: 'cgSgspJ2msm6clMCkdW9' // Jessica voice - warm and friendly for children
      });
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  // Get pet thought based on AI response or default thoughts
  const getPetThought = () => {
    // If we have an AI response, use that instead of the default thoughts
    if (aiResponse) {
      return aiResponse;
    }

    // Get initial greeting based on pet type
    const getInitialGreeting = () => {
      if (currentPet === 'bobo' && isPetOwned('bobo')) {
        return "Oook ook! 🐵 I'm Bobo! I love making new friends! What would you like to talk about?";
      } else if (currentPet === 'feather' && isPetOwned('feather')) {
        return "Tweet tweet! 🦜 I'm Feather! I'm so excited to chat with you! What's on your mind?";
      } else {
        return "Hi there! 🐶 I'm April! I'm so happy to be your friend! What would you like to talk about?";
      }
    };

    // Return initial greeting if no conversation has started
    return getInitialGreeting();
  };

  // Get coins spent for current pet
  const getCurrentPetCoinsSpent = () => {
    if (currentPet === 'dog') {
      return getCoinsSpentForCurrentStage(currentStreak);
    } else {
      return getPetCoinsSpent(currentPet);
    }
  };

  // Get current pet coins spent value
  const currentPetCoinsSpent = getCurrentPetCoinsSpent();

  // Memoize the pet thought so it only changes when the actual state changes
  const currentPetThought = useMemo(() => {
    return getPetThought();
  }, [currentPet, getCoinsSpentForCurrentStage(currentStreak), getPetCoinsSpent(currentPet), aiResponse]);

  // Handle audio playback when message changes
  useEffect(() => {
    // Stop any currently playing audio when pet state changes
    ttsService.stop();
    
    // Only speak when:
    // 1. Not in pet shop
    // 2. Audio is enabled
    // 3. Message has changed
    if (!showPetShop && audioEnabled && currentPetThought !== lastSpokenMessage) {
      const timer = setTimeout(() => {
        speakText(currentPetThought);
      }, 500); // Small delay for smooth UX
      
      return () => clearTimeout(timer);
    }
  }, [currentPetThought, showPetShop, audioEnabled, lastSpokenMessage]);

  // Stop voice interaction when switching pets or opening pet shop
  useEffect(() => {
    if (isListening && recognition) {
      recognition.stop();
    }
    if (isProcessing) {
      setIsProcessing(false);
    }
    setTranscribedMessage('');
    setTranscribedText('');
    ttsService.stop();
  }, [currentPet, showPetShop, recognition]);

  // Update action states when voice state changes
  useEffect(() => {
    setActionStates(prev => prev.map(action => 
      action.id === 'voice'
        ? { 
            ...action, 
            icon: <Mic className={cn("text-white", isListening && "animate-pulse")} style={{ height: '2rem', width: '2rem' }} />,
            status: isListening ? 'happy' : 'neutral',
            label: isListening ? 'Stop & Send' : 'Talk'
          }
        : action
    ));
  }, [isListening]);

  // Add this effect to reset the guess when the pet thought changes
  useEffect(() => {
    setUserGuess([]);
    setIsGuessCorrect(false);
    setActiveBoxIndex(-1);
  }, [currentPetThought]);

  // Add this after other useEffect declarations
  useEffect(() => {
    // Focus the next input box when activeBoxIndex changes
    if (activeBoxIndex >= 0) {
      const inputs = document.querySelectorAll<HTMLInputElement>('.character-input');
      inputs[activeBoxIndex]?.focus();
    }
  }, [activeBoxIndex]);


  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{
      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
      fontFamily: 'Quicksand, system-ui, sans-serif'
    }}>
      {/* Magical floating particles */}
      <div className="magical-particles">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              '--delay': `${Math.random() * 10}s`,
              '--size': `${Math.random() * 20 + 10}px`,
              '--left': `${Math.random() * 100}%`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Glass overlay for better contrast */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>

      {/* Top UI - Coins and Streak */}
      <div className="absolute top-5 left-1/2 transform -translate-x-1/2 z-20 flex gap-4">
        {/* Coins */}
        <div className="bg-white/20 backdrop-blur-md rounded-full px-6 py-3 border-2 border-white/30 shadow-lg hover:scale-105 transition-transform">
          <div className="flex items-center gap-2 text-white font-bold text-lg drop-shadow-md">
            <span className="text-xl">🪙</span>
            <span>{coins}</span>
          </div>
        </div>
        
        {/* Streak */}
        <div className="bg-white/20 backdrop-blur-md rounded-full px-6 py-3 border-2 border-white/30 shadow-lg hover:scale-105 transition-transform">
          <div className="flex items-center gap-2 text-white font-bold text-lg drop-shadow-md">
            <span className="text-xl">🔥</span>
            <span>{currentStreak}</span>
          </div>
        </div>
      </div>

      {/* Testing Buttons - Development Only */}
      <div className="absolute bottom-5 left-5 z-20 flex flex-col gap-2">
        <button
          onClick={() => setCoins(100)}
          className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-lg border-2 border-white/30 backdrop-blur-md shadow-lg transition-all duration-300 opacity-5 hover:opacity-30"
          title="Testing: Refill coins to 100"
        >
          🔄
        </button>
      </div>

      {/* Testing Button - Increase Streak (Development Only) */}
      <div className="absolute bottom-5 right-5 z-20">
        <button
          onClick={() => {
            const newStreak = currentStreak + 1;
            const streakData = getStreakData();
            const newStreakData = {
              ...streakData,
              streak: newStreak,
              lastFeedDate: getCurrentUSDate()
            };
            saveStreakData(newStreakData);
          }}
          className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-lg border-2 border-white/30 backdrop-blur-md shadow-lg transition-all duration-300 opacity-5 hover:opacity-30"
          title="Testing: Increase streak by 1"
        >
          🔥
        </button>
      </div>

      {/* Top UI - Heart only */}
      <div className="absolute top-4 right-10 z-20">
        {/* Heart that fills with blood */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center relative bg-white/20 backdrop-blur-sm border-2 border-white/30 shadow-lg">
          <div style={{
            position: 'relative',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Heart outline */}
            <div style={{
              position: 'absolute',
              fontSize: 84,
              color: '#E5E7EB',
            }}>
              🤍
            </div>
            {/* Filled heart (blood) */}
            <div style={{
              position: 'absolute',
              fontSize: 84,
              color: '#DC2626',
              clipPath: `inset(${Math.max(0, 100 - (currentPetCoinsSpent * 1.8 + 5))}% 0 0 0)`,
              transition: 'clip-path 500ms ease'
            }}>
              ❤️
            </div>
          </div>
        </div>

        {/* Animated hearts moving from pet to main heart */}
        {showHeartAnimation && (
          <>
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              fontSize: 20,
              color: '#DC2626',
              animation: 'heartFlyFromPet1 1200ms ease-out forwards',
              pointerEvents: 'none',
              zIndex: 30
            }}>
              ❤️
            </div>
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              fontSize: 16,
              color: '#DC2626',
              animation: 'heartFlyFromPet2 1200ms ease-out forwards',
              animationDelay: '150ms',
              pointerEvents: 'none',
              zIndex: 30
            }}>
              ❤️
            </div>
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              fontSize: 18,
              color: '#DC2626',
              animation: 'heartFlyFromPet3 1200ms ease-out forwards',
              animationDelay: '300ms',
              pointerEvents: 'none',
              zIndex: 30
            }}>
              ❤️
            </div>
          </>
        )}
      </div>

      {/* Main pet area - moved to top left */}
      <div className="flex-1 flex flex-col items-start justify-start relative px-4 z-10 mt-24">
        <div className="flex items-start gap-8 w-full">
          {/* Pet Container - Left Side */}
          <div className="relative w-72">
            {/* Pet Image with bouncing animation */}
            <div className={cn(
              "relative drop-shadow-2xl",
              isEating ? "animate-happy-bounce" : "animate-gentle-bounce"
            )}>
              <img 
                src={getPetImage()}
                alt="Pet"
                className={cn(
                  "w-72 h-72 object-contain rounded-2xl transition-all duration-700 ease-out hover:scale-105",
                  isEating && "animate-nom-nom"
                )}
                style={{
                  animation: careLevel * 10 >= 30 && careLevel * 10 < 50 ? 'petGrow 800ms ease-out' : 
                            careLevel * 10 >= 50 ? 'petEvolve 800ms ease-out' : 'none'
                }}
              />
            </div>
            
            {/* Cookie particles */}
            {showCookieParticles && (
              <div className="cookie-particles absolute inset-0">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="cookie-particle absolute"
                    style={{
                      '--delay': `${i * 0.1}s`,
                      '--angle': `${(i * 60) + Math.random() * 30}deg`,
                      '--distance': `${Math.random() * 20 + 40}px`
                    } as React.CSSProperties}
                  >
                    🍪
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat Area - Right Side */}
          <div className="flex-1 max-w-2xl">
            {/* Pet's Chat Bubble */}
            {!showPetShop && (
              <div className={cn(
                "relative bg-gradient-to-br from-blue-50 to-cyan-50 rounded-3xl p-6 mb-8 border-[6px] border-dashed border-blue-400/50 shadow-xl w-full backdrop-blur-sm bg-white/90 hover:scale-102 transition-all duration-500",
                "before:content-[''] before:absolute before:-inset-2 before:border-[4px] before:border-pink-400/30 before:rounded-[2rem] before:z-[-1]",
                "after:content-[''] after:absolute after:-inset-4 after:border-[4px] after:border-purple-400/20 after:rounded-[2.5rem] after:z-[-2]",
                isProcessing && "scale-[0.85] opacity-90"
              )}>
                {/* Speech bubble tail pointing to pet */}
                <div className="absolute top-1/2 -left-3 transform -translate-y-1/2 w-0 h-0 border-t-[12px] border-b-[12px] border-r-[12px] border-t-transparent border-b-transparent border-r-blue-400"></div>
                
                {/* Pet name badge */}
                <div className="absolute -top-3 left-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
                  {currentPet === 'dog' ? 'April 🐶' : currentPet === 'bobo' ? 'Bobo 🐵' : 'Feather 🦜'}
                </div>

                <div className={cn(
                  "text-lg text-slate-800 font-medium leading-relaxed mt-2",
                  "transition-all duration-500",
                  isProcessing && "scale-95"
                )}>
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <span>Thinking</span>
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-thinking-dot" style={{ animationDelay: '0s' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-thinking-dot" style={{ animationDelay: '0.2s' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-thinking-dot" style={{ animationDelay: '0.4s' }}></span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* First word as interactive boxes */}
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1">
                          {currentPetThought.split(' ')[0].split('').map((char, index) => {
                            const isCorrect = userGuess[index]?.toLowerCase() === char.toLowerCase();
                            const hasGuess = userGuess[index] !== undefined;
                            const isActive = activeBoxIndex === index;
                            
                            return (
                              <input 
                                key={index}
                                type="text"
                                maxLength={1}
                                value={userGuess[index] || ''}
                                className={cn(
                                  "w-8 h-8 border-2 rounded-md text-center font-bold text-lg transition-all duration-200",
                                  "focus:outline-none focus:ring-2 focus:ring-offset-2",
                                  "character-input", // Add this class for querySelector
                                  hasGuess ? (
                                    isCorrect 
                                      ? "border-green-500 bg-green-100 text-green-700 focus:ring-green-500"
                                      : "border-red-500 bg-red-100 text-red-700 focus:ring-red-500"
                                  ) : "border-slate-400 focus:border-blue-500 focus:ring-blue-500",
                                  isActive && "scale-110"
                                )}
                                onClick={() => setActiveBoxIndex(index)}
                                onChange={(e) => {
                                  const newGuess = [...userGuess];
                                  const input = e.target.value;
                                  
                                  if (input) {
                                    newGuess[index] = input;
                                    setUserGuess(newGuess);
                                    
                                    // Move to next box if available
                                    if (index < currentPetThought.split(' ')[0].length - 1) {
                                      setActiveBoxIndex(index + 1);
                                    }
                                    
                                    // Check if word is complete and correct
                                    const word = newGuess.join('');
                                    if (word.toLowerCase() === currentPetThought.split(' ')[0].toLowerCase()) {
                                      setIsGuessCorrect(true);
                                    } else {
                                      setIsGuessCorrect(false);
                                    }
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Backspace') {
                                    e.preventDefault(); // Prevent default backspace behavior
                                    const newGuess = [...userGuess];
                                    
                                    if (userGuess[index]) {
                                      // If current box has a character, clear it
                                      newGuess[index] = '';
                                      setUserGuess(newGuess);
                                      setIsGuessCorrect(false);
                                    } else if (index > 0) {
                                      // If current box is empty and we're not at first box,
                                      // move to previous box and clear it
                                      setActiveBoxIndex(index - 1);
                                      newGuess[index - 1] = '';
                                      setUserGuess(newGuess);
                                      setIsGuessCorrect(false);
                                    }
                                  } else if (e.key === 'ArrowLeft' && index > 0) {
                                    setActiveBoxIndex(index - 1);
                                  } else if (e.key === 'ArrowRight' && index < currentPetThought.split(' ')[0].length - 1) {
                                    setActiveBoxIndex(index + 1);
                                  }
                                }}
                              />
                            );
                          })}
                        </div>
                        
                        {/* Success message */}
                        {isGuessCorrect && (
                          <div className="text-green-600 font-medium animate-fade-in mt-2">
                            ✨ Correct! Well done!
                          </div>
                        )}
                      </div>
                      
                      {/* Rest of the message */}
                      <div className="mt-4">
                        {currentPetThought.split(' ').slice(1).join(' ')}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Chat Area - Bottom Right */}
        <div className="fixed bottom-56 right-8 z-30">
          <div className="relative flex items-start gap-4">
            {/* User's transcribed message */}
            {(transcribedMessage || isListening) && (
              <div className="max-w-md animate-fade-in mt-12">
                <div className="relative bg-gradient-to-br from-purple-500/90 to-indigo-600/90 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-white/20">
                  {/* Speech bubble tail pointing to kid */}
                  <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 w-0 h-0 border-t-[12px] border-b-[12px] border-l-[12px] border-t-transparent border-b-transparent border-l-purple-500/90"></div>
                  <div className="text-md text-white font-medium leading-relaxed">
                    {isListening ? (
                      <div className="flex items-center gap-2">
                        <span>Listening</span>
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                      </div>
                    ) : transcribedMessage}
                  </div>
                </div>
              </div>
            )}

            {/* User Avatar */}
            <div className="relative w-72">
              {/* Kid Image with bouncing animation */}
              <div className="relative drop-shadow-2xl animate-gentle-bounce">
                <img 
                  src={littleKid}
                  alt="Kid"
                  className="w-72 h-72 object-contain rounded-2xl transition-all duration-700 ease-out hover:scale-105"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evolution Menu Button */}
      <button
        onClick={() => setShowEvolutionMenu(true)}
        className="fixed top-24 right-8 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md border-2 border-white/30 text-2xl flex items-center justify-center shadow-xl z-40 transition-all duration-300 hover:scale-110 active:scale-95"
      >
        🐾
      </button>

      {/* Evolution Menu */}
      <EvolutionMenu
        currentStreak={currentStreak}
        isOpen={showEvolutionMenu}
        onClose={() => setShowEvolutionMenu(false)}
      />

      {/* Bottom Action Buttons - Centered with playful style */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-30">
        <div className="flex gap-6 px-8 py-6 bg-white/10 backdrop-blur-md rounded-full border-[6px] border-dashed border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.3)] transition-all duration-300 relative
          before:content-[''] before:absolute before:-inset-2 before:border-[4px] before:border-pink-400/30 before:rounded-full before:z-[-1]
          after:content-[''] after:absolute after:-inset-4 after:border-[4px] after:border-purple-400/20 after:rounded-full after:z-[-2]">
        {actionStates.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action.id)}
            className={`
              relative flex flex-col items-center gap-2 p-4
              bg-gradient-to-br from-white/10 to-white/5
              rounded-full min-w-[100px] min-h-[80px]
              transition-all duration-300 
              hover:bg-white/20 hover:-translate-y-1 hover:scale-110
              active:scale-95 active:translate-y-0
              border-2 border-white/30
              group
            `}
          >
            {/* Status emoji with improved animation */}
            {getStatusEmoji(action.status) && (
              <div className="absolute -top-2 -right-2 text-lg bg-gradient-to-br from-white to-white/90 rounded-full w-8 h-8 flex items-center justify-center shadow-lg animate-bounce">
                {getStatusEmoji(action.status)}
              </div>
            )}
            
            {/* Action icon with hover effect */}
            <div className="text-4xl drop-shadow-lg transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[8deg]">
              {typeof action.icon === 'string' ? (
                <span className="text-4xl">{action.icon}</span>
              ) : (
                <div className="scale-150">{action.icon}</div>
              )}
            </div>
            
            {/* Action label with improved text style */}
            <div className="text-sm font-bold text-white drop-shadow-md tracking-wide absolute -bottom-6 whitespace-nowrap min-w-[80px] text-center">
              {action.label}
            </div>
            
            {/* Coin cost with enhanced styling */}
            {action.id === 'water' && (
              <div className="absolute -top-3 -left-3 flex items-center justify-center bg-gradient-to-br from-yellow-500/40 to-amber-600/40 backdrop-blur-md px-3 py-1.5 rounded-full border-2 border-yellow-400/30 shadow-lg">
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-bold text-sm">10</span>
                  <span className="text-base">🪙</span>
                </div>
              </div>
            )}

            {/* Subtle glow effect on hover */}
            <div className="absolute inset-0 rounded-full bg-white/0 transition-all duration-300 group-hover:bg-white/10 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] pointer-events-none"></div>
          </button>
        ))}
        </div>
      </div>

      {/* Audio Toggle Button */}
      <button
        onClick={() => {
          setAudioEnabled(!audioEnabled);
          if (isSpeaking) {
            ttsService.stop();
          }
        }}
        className={`fixed bottom-8 right-8 w-16 h-16 rounded-full border-2 border-white/30 text-2xl flex items-center justify-center shadow-xl z-40 transition-all duration-300 hover:scale-110 active:scale-95 backdrop-blur-md ${
          audioEnabled 
            ? 'bg-gradient-to-br from-emerald-500/80 to-green-600/80' 
            : 'bg-gradient-to-br from-red-500/80 to-red-600/80'
        }`}
      >
        {audioEnabled ? '🔊' : '🔇'}
      </button>

      {/* Pet Switcher - Only show if user owns multiple pets */}
      {ownedPets.length > 1 && (
        <div className="fixed top-24 left-8 z-20 flex flex-col gap-3">
          <div className="text-xs font-semibold text-white/80 drop-shadow-md mb-1 backdrop-blur-sm px-3 py-1 rounded-full bg-white/10 border border-white/20">
            Your Pets
          </div>
          {ownedPets.map((petId) => {
            const petEmoji = petId === 'dog' ? '🐶' : petId === 'bobo' ? '🐵' : petId === 'feather' ? '🦜' : '🐾';
            const isActive = currentPet === petId;
            
            return (
              <button
                key={petId}
                onClick={() => setCurrentPet(petId)}
                className={`w-16 h-16 rounded-full border-2 text-2xl flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 backdrop-blur-md ${
                  isActive 
                    ? 'bg-gradient-to-br from-blue-500/80 to-purple-600/80 border-white' 
                    : 'bg-white/20 border-white/30 hover:bg-white/30'
                }`}
                title={`Switch to ${petId === 'dog' ? 'Dog' : petId === 'bobo' ? 'Bobo' : petId === 'feather' ? 'Feather' : petId}`}
              >
                {petEmoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Pet Shop Overlay */}
      {showPetShop && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-slate-50 rounded-3xl p-6 max-w-md w-11/12 max-h-[85vh] overflow-y-auto shadow-2xl relative border-2 border-gray-200">
            {/* Close button */}
            <button
              onClick={() => setShowPetShop(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white border-none cursor-pointer text-lg flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            >
              ×
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                🏪 Pet Shop
              </h2>
              <p className="text-sm text-gray-600 font-medium">
                Adopt new animal friends!
              </p>
              <p className="text-xs text-blue-600 font-medium mt-2">
                ✨ All pets evolve as you feed them cookies! ✨
              </p>
            </div>



            {/* Available Pets */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: 16
            }}>
              {availablePets.map((pet) => {
                const isOwned = isPetOwned(pet.id);
                const canAfford = hasEnoughCoins(pet.cost);
                
                return (
                  <div
                    key={pet.id}
                    style={{
                      background: isOwned 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                      borderRadius: 16,
                      padding: '16px',
                      textAlign: 'center',
                      position: 'relative',
                      cursor: isOwned ? 'default' : canAfford ? 'pointer' : 'not-allowed',
                      transition: 'all 200ms ease',
                      border: '2px solid rgba(255,255,255,0.2)',
                      opacity: isOwned ? 1 : canAfford ? 0.9 : 0.6
                    }}
                    onClick={() => !isOwned && canAfford && handlePetPurchase(pet.id, pet.cost)}
                    onMouseEnter={(e) => {
                      if (!isOwned && canAfford) {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isOwned && canAfford) {
                        e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {/* Lock overlay for all unowned pets */}
                    {!isOwned && (
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 40,
                        height: 40,
                        background: canAfford ? 'rgba(59, 130, 246, 0.9)' : 'rgba(0,0,0,0.7)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        border: '2px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                      }}>
                        {canAfford ? '💰' : '🔒'}
                      </div>
                    )}

                    {/* Pet emoji */}
                    <div style={{
                      fontSize: 48,
                      marginBottom: 8,
                      filter: isOwned ? 'none' : !canAfford ? 'grayscale(100%) opacity(0.7)' : 'grayscale(50%) opacity(0.9)'
                    }}>
                      {pet.emoji}
                    </div>

                    {/* Pet name */}
                    <h3 style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: 'white',
                      margin: 0,
                      marginBottom: 6,
                      fontFamily: 'Quicksand, system-ui, sans-serif'
                    }}>
                      {pet.name}
                    </h3>

                    {/* Status/Price */}
                    <div style={{
                      fontSize: 14,
                      color: 'rgba(255,255,255,0.9)',
                      fontWeight: 500
                    }}>
                      {isOwned ? '✅ Owned' : canAfford ? `🪙 ${pet.cost} coins` : `🔒 Need ${pet.cost} coins`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Current coins display */}
            <div className="text-center p-4 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl text-white font-semibold text-base shadow-lg">
              💰 Your coins: {coins}
            </div>
          </div>
        </div>
      )}

      {/* Add floating stars animation */}
      <div className="stars-container absolute inset-0 pointer-events-none z-0">
        {[...Array(15)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="star"
            style={{
              '--delay': `${Math.random() * 5}s`,
              '--position': `${Math.random() * 100}%`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <style>
        {`
          @keyframes petGrow {
            0% {
              opacity: 0.7;
              transform: scale(0.95);
            }
            50% {
              opacity: 0.9;
              transform: scale(1.05);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }
          
          @keyframes petEvolve {
            0% {
              opacity: 0.6;
              transform: scale(0.9) rotate(-2deg);
            }
            25% {
              opacity: 0.8;
              transform: scale(1.1) rotate(1deg);
            }
            50% {
              opacity: 0.9;
              transform: scale(0.98) rotate(-0.5deg);
            }
            75% {
              opacity: 0.95;
              transform: scale(1.02) rotate(0.5deg);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotate(0deg);
            }
          }
          
          @keyframes heartbeat {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.1);
            }
          }
          
          @keyframes heartFlyFromPet1 {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            50% {
              transform: translate(200px, -150px) scale(0.8);
              opacity: 0.8;
            }
            100% {
              transform: translate(350px, -280px) scale(0.3);
              opacity: 0;
            }
          }
          
          @keyframes heartFlyFromPet2 {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            50% {
              transform: translate(180px, -120px) scale(0.7);
              opacity: 0.9;
            }
            100% {
              transform: translate(330px, -300px) scale(0.2);
              opacity: 0;
            }
          }
          
          @keyframes heartFlyFromPet3 {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            50% {
              transform: translate(220px, -180px) scale(0.9);
              opacity: 0.7;
            }
            100% {
              transform: translate(370px, -260px) scale(0.4);
              opacity: 0;
            }
          }
          
          @keyframes thoughtBubble {
            0%, 100% {
              transform: scale(1);
              opacity: 0.7;
            }
            50% {
              transform: scale(1.2);
              opacity: 1;
            }
          }

          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .animate-fade-in {
            animation: fade-in 0.3s ease-out forwards;
          }

          @keyframes gentle-bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }

          @keyframes sparkle {
            0%, 100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.1);
              opacity: 0.8;
            }
          }

          @keyframes spin-slow {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          .animate-gentle-bounce {
            animation: gentle-bounce 3s ease-in-out infinite;
          }

          .animate-sparkle {
            animation: sparkle 2s ease-in-out infinite;
          }

          .animate-spin-slow {
            animation: spin-slow 4s linear infinite;
          }

          .hover\\:scale-102:hover {
            transform: scale(1.02);
          }

          @keyframes float {
            0%, 100% {
              transform: translateY(0) rotate(0deg);
              opacity: 0;
            }
            25% {
              opacity: 1;
            }
            75% {
              opacity: 0.5;
            }
            50% {
              transform: translateY(-400px) rotate(360deg);
              opacity: 0;
            }
          }

          .magical-particles {
            position: absolute;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: 0;
          }

          .particle {
            position: absolute;
            bottom: -20px;
            left: var(--left);
            width: var(--size);
            height: var(--size);
            background: radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%);
            border-radius: 50%;
            animation: float 10s linear infinite;
            animation-delay: var(--delay);
          }

          /* Add shimmer effect to the background */
          @keyframes shimmer {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          .min-h-screen {
            animation: shimmer 15s ease infinite;
            background-size: 200% 200%;
          }

          @keyframes happy-bounce {
            0%, 100% {
              transform: translateY(0) rotate(0deg);
            }
            25% {
              transform: translateY(-15px) rotate(-5deg);
            }
            50% {
              transform: translateY(-5px) rotate(5deg);
            }
            75% {
              transform: translateY(-10px) rotate(-3deg);
            }
          }

          @keyframes nom-nom {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
          }

          .animate-happy-bounce {
            animation: happy-bounce 1s ease-in-out;
          }

          .animate-nom-nom {
            animation: nom-nom 0.3s ease-in-out 3;
          }

          .cookie-particle {
            font-size: 1.5rem;
            opacity: 0;
            animation: cookie-particle 0.6s ease-out forwards;
            transform-origin: center;
          }

          @keyframes cookie-particle {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(0.5);
            }
            50% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: 
                translate(
                  calc(cos(var(--angle)) * var(--distance)),
                  calc(sin(var(--angle)) * var(--distance))
                )
                scale(0.2);
            }
          }

          .cookie-particles {
            pointer-events: none;
            z-index: 30;
          }

          @keyframes thinking-dot {
            0%, 100% {
              transform: translateY(0) scale(1);
              opacity: 0.5;
            }
            50% {
              transform: translateY(-4px) scale(1.2);
              opacity: 1;
            }
          }

          .animate-thinking-dot {
            animation: thinking-dot 1s ease-in-out infinite;
          }

          /* Add twinkling stars animation */
          .stars-container {
            overflow: hidden;
          }

          .star {
            position: absolute;
            width: 20px;
            height: 20px;
            left: var(--position);
            top: -20px;
            background: radial-gradient(circle at center, #fff 0%, rgba(255,255,255,0) 70%);
            animation: twinkle 3s linear infinite;
            animation-delay: var(--delay);
          }

          @keyframes twinkle {
            0% {
              transform: translateY(0) rotate(0deg) scale(0);
              opacity: 0;
            }
            50% {
              transform: translateY(40vh) rotate(180deg) scale(1);
              opacity: 0.8;
            }
            100% {
              transform: translateY(80vh) rotate(360deg) scale(0);
              opacity: 0;
            }
          }

          /* Rainbow gradient animation for borders */
          @keyframes rainbow-border {
            0% { border-color: rgba(255, 0, 0, 0.3); }
            20% { border-color: rgba(255, 165, 0, 0.3); }
            40% { border-color: rgba(255, 255, 0, 0.3); }
            60% { border-color: rgba(0, 255, 0, 0.3); }
            80% { border-color: rgba(0, 0, 255, 0.3); }
            100% { border-color: rgba(255, 0, 0, 0.3); }
          }

          /* Add rainbow animation to dashed borders */
          .border-dashed {
            animation: rainbow-border 10s linear infinite;
          }

          /* Enhance particle effects */
          .particle {
            box-shadow: 0 0 10px rgba(255,255,255,0.8);
            background: radial-gradient(circle at center, 
              rgba(255,255,255,0.9) 0%, 
              rgba(255,182,193,0.6) 50%, 
              rgba(255,255,255,0) 70%
            );
          }

          /* Add a subtle pulse effect to buttons */
          button {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          button:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
          }

          button:active {
            transform: translateY(1px) scale(0.98);
          }

          /* Enhance magical particles */
          .magical-particles {
            mix-blend-mode: screen;
          }

          .magical-particles .particle {
            filter: blur(1px);
          }
        `}
      </style>
    </div>
  );
}
