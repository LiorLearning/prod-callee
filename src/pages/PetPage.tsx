import React, { useState, useEffect, useMemo } from 'react';
import { useCoins } from '@/pages/coinSystem';
import { ttsService } from '@/lib/tts-service';
import { useTTSSpeaking } from '@/hooks/use-tts-speaking';
import { usePetData } from '@/lib/pet-data-service';
import { usePetVoiceInteraction } from '@/hooks/use-pet-voice-interaction';
import { useAuth } from '@/hooks/use-auth';
import { useUnifiedAIStreaming } from '@/hooks/use-unified-ai-streaming';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import pupOpen from '@/assets/faceSwap (1).gif';
import littleKid from '@/assets/little-kid.png';
import { EvolutionMenu } from '@/components/ui/evolution-menu';

type Props = {};

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
  const [previousCoins, setPreviousCoins] = useState(coins);
  const [previousCoinsSpentForStage, setPreviousCoinsSpentForStage] = useState(0);
  const [showPetShop, setShowPetShop] = useState(false);
  const [lastSpokenMessage, setLastSpokenMessage] = useState('');
  const [transcribedMessage, setTranscribedMessage] = useState('');
  const [aiResponse, setAiResponse] = useState(''); // Add this line
  const [messageTimestamp, setMessageTimestamp] = useState<number | null>(null);

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

  // Get user ID for voice interaction
  const { user } = useAuth();

  // Voice interaction state
  const {
    isListening,
    isProcessing,
    isSpeaking: isVoiceSpeaking,
    startListening,
    cancelListening,
    processVoiceInput,
    stopAll,
    transcribedText
  } = usePetVoiceInteraction({
    userId: user?.uid || 'anonymous',
    voiceId: 'cgSgspJ2msm6clMCkdW9', // Jessica voice for now
    stability: 0.7,
    similarityBoost: 0.8,
    speed: 0.9
  });

  // Add effect to update transcribed message when transcribedText changes
  useEffect(() => {
    if (transcribedText) {
      setTranscribedMessage(transcribedText);
      setMessageTimestamp(Date.now());
    }
  }, [transcribedText]);

  // Get the unified AI streaming service
  const { sendMessage } = useUnifiedAIStreaming({
    userId: user?.uid || 'anonymous',
    onResponseComplete: (response) => {
      if (response?.textContent) {
        setAiResponse(response.textContent);
      }
    }
  });

  // Update the voice action handler
  const handleActionClick = (actionId: string) => {
    if (actionId === 'voice') {
      if (isListening) {
        // When stopping, first cancel listening then process the voice input
        cancelListening();
        processVoiceInput().then(async () => {
          if (transcribedText) {
            // Create a pet-specific prompt
            const petPrompt = `I am ${currentPet === 'dog' ? 'April the dog' : currentPet === 'bobo' ? 'Bobo the monkey' : 'Feather the bird'}. I am your virtual pet friend. You just said: "${transcribedText}". I should respond in a friendly, playful way that matches my personality. If you ask about my feelings, I should reference my current state (based on coins spent: ${getCurrentPetCoinsSpent()}/50 coins spent on feeding).`;
            
            try {
              const response = await sendMessage(
                petPrompt,
                [], // Empty chat history for now
                {} as any // No spelling question for pet interactions
              );
              
              if (response?.textContent) {
                setAiResponse(response.textContent);
              }
            } catch (error) {
              console.error('Failed to get AI response:', error);
            }
          }
        });
      } else {
        setTranscribedMessage(''); // Clear previous message
        setAiResponse(''); // Clear previous AI response
        startListening();
      }

      // Update the voice action button with new icon and status
      setActionStates(prev => prev.map(action => 
        action.id === 'voice' 
          ? { 
              ...action, 
              icon: <Mic className={cn("text-white", !isListening && "animate-pulse")} style={{ height: '2rem', width: '2rem' }} />,
              status: !isListening ? 'happy' : 'neutral',
              label: !isListening ? 'Stop & Send' : 'Talk'
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

    // Check if player has enough coins for feeding actions
    if (!hasEnoughCoins(10)) {
      alert("Not enough coins! You need 10 coins to perform this action.");
      return;
    }

    // Play feeding sound
    playFeedingSound();

    // Deduct coins and increase care level
    spendCoins(10);
    setCareLevel(Math.min(careLevel + 1, 6), currentStreak); // Max 6 actions, pass current streak
    
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

  // Waveform Visualizer Component
  const WaveformVisualizer = () => {
    return (
      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 rounded-xl border border-foreground/30 w-64 bg-white/90 backdrop-blur-sm text-sm h-9 focus:border-foreground/60 flex items-center justify-center gap-1 px-4 shadow-lg">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="w-1 bg-primary rounded-full animate-pulse"
            style={{
              height: `${Math.random() * 16 + 6}px`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`
            }}
          />
        ))}
      </div>
    );
  };

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

    // Helper function to randomly select from an array of thoughts
    const getRandomThought = (thoughts: string[]) => {
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    };
    
    // Different thoughts for different pets
    if (currentPet === 'bobo' && isPetOwned('bobo')) {
      const boboCoinsSpent = getPetCoinsSpent('bobo');
      
      if (boboCoinsSpent === 0) {
        const hungryThoughts = [
          "Oook ook! 🐵 I'm Bobo! My banana belly is empty... can you feed me some cookies?",
          "Hey there, Callee! 🍌 Bobo here! I'm swinging from hunger... got any treats?",
          "Oook! It's me, your monkey friend Bobo! 🐵 My tummy is rumbling for some cookies!",
          "Hi Callee! Bobo needs some yummy cookies! 🍪 My monkey appetite is huge!",
          "Oook ook! 🐵 Bobo is starving! Can you help your monkey friend with some treats?",
          "Callee! 🍌 Your monkey Bobo is so hungry... cookies would make me do happy flips!"
        ];
        return getRandomThought(hungryThoughts);
      } else if (boboCoinsSpent < 30) {
        const satisfiedThoughts = [
          "Mmm banana-licious! 🍌 More cookies will make this monkey swing with joy!",
          "Oook ook! Those cookies were amazing! 🐵 But Bobo could eat more!",
          "Yum yum! 🍪 These treats are perfect for a growing monkey like me!",
          "Oook! Those cookies hit the spot! 🐵 But my monkey appetite is still growing!",
          "Thank you, Callee! 🥰 Those cookies were perfect, but Bobo is still a little peckish!",
          "Delicious! 🍪 My tail is wagging so fast! More cookies would make me flip with happiness!"
        ];
        return getRandomThought(satisfiedThoughts);
      } else if (boboCoinsSpent < 50) {
        const growingThoughts = [
          "Oook ook! I'm growing stronger! 🐵 Keep feeding me - I'm getting bigger and more agile!",
          "Look at me swing! 💪 I can feel myself getting stronger with each cookie!",
          "Amazing! I'm growing so fast! 🌱 More cookies will help me become the ultimate monkey!",
          "Callee, I feel so energetic! ⚡ These cookies are making me bigger and more acrobatic!",
          "Oook ook! I'm transforming! 🦋 Keep the cookies coming - I'm almost ready for the next stage!",
          "Incredible! My monkey body is changing! 🐵 More cookies will help me reach my full potential!"
        ];
        return getRandomThought(growingThoughts);
      } else {
        const happyThoughts = [
          "Oook ook! 🥳 I feel amazing, Callee! Now... could you get me some monkey friends to play with!",
          "Oook ook! I'm so strong now! 💪 Maybe it's time to find some playmates to swing with?",
          "I feel fantastic! 🌟 All those cookies worked! Now I'm ready for some monkey business with friends!",
          "Amazing! I'm at my best! ✨ Callee, can you help me find some buddies to climb trees with?",
          "Hooray! I'm fully grown! 🎉 Can you help me find some monkey friends to play with?",
          "Perfect! I feel incredible! 🚀 Maybe it's time to find some playmates for jungle adventures?"
        ];
        return getRandomThought(happyThoughts);
      }
    }

    // Feather-specific thoughts based on coins spent
    if (currentPet === 'feather' && isPetOwned('feather')) {
      const featherCoinsSpent = getPetCoinsSpent('feather');
      
      if (featherCoinsSpent === 0) {
        const hungryThoughts = [
          "Chirp chirp! 🦜 I'm Feather! My little bird belly is empty... can you feed me some seeds?",
          "Tweet tweet! 🌟 Feather here! I'm fluttering from hunger... got any treats?",
          "Chirp! It's me, your feathered friend Feather! 🦜 My tummy is chirping for some seeds!",
          "Hi Callee! Feather needs some yummy seeds! 🌱 My bird appetite is huge!",
          "Tweet tweet! 🦜 Feather is starving! Can you help your bird friend with some treats?",
          "Callee! 🌟 Your bird Feather is so hungry... seeds would make me sing beautiful songs!"
        ];
        return getRandomThought(hungryThoughts);
      } else if (featherCoinsSpent < 30) {
        const satisfiedThoughts = [
          "Tweet tweet! 🌱 More seeds will make this bird sing with joy!",
          "Chirp chirp! Those seeds were amazing! 🦜 But Feather could eat more!",
          "Yum yum! 🌾 These treats are perfect for a growing bird like me!",
          "Tweet! Those seeds hit the spot! 🦜 But my bird appetite is still growing!",
          "Thank you, Callee! 🥰 Those seeds were perfect, but Feather is still a little peckish!",
          "Delicious! 🌱 My wings are flapping so fast! More seeds would make me soar with happiness!"
        ];
        return getRandomThought(satisfiedThoughts);
      } else if (featherCoinsSpent < 50) {
        const growingThoughts = [
          "Tweet tweet! I'm growing stronger! 🦜 Keep feeding me - I'm getting bigger and more colorful!",
          "Look at me fly! 💪 I can feel myself getting stronger with each seed!",
          "Amazing! I'm growing so fast! 🌱 More seeds will help me become the ultimate bird!",
          "Callee, I feel so energetic! ⚡ These seeds are making me bigger and more graceful!",
          "Tweet tweet! I'm transforming! 🦋 Keep the seeds coming - I'm almost ready for the next stage!",
          "Incredible! My feathers are changing! 🦜 More seeds will help me reach my full potential!"
        ];
        return getRandomThought(growingThoughts);
      } else {
        const happyThoughts = [
          "Tweet tweet! 🥳 I feel amazing, Callee! Now... could you get me some bird friends to fly with!",
          "Tweet tweet! I'm so strong now! 💪 Maybe it's time to find some playmates to soar with?",
          "I feel fantastic! 🌟 All those seeds worked! Now I'm ready for some aerial adventures with friends!",
          "Amazing! I'm at my best! ✨ Callee, can you help me find some buddies to fly through clouds with?",
          "Hooray! I'm fully grown! 🎉 Can you help me find some bird friends to play with?",
          "Perfect! I feel incredible! 🚀 Maybe it's time to find some playmates for sky adventures?"
        ];
        return getRandomThought(happyThoughts);
      }
    }
    
    // Default dog thoughts
    const coinsSpentOnFeeding = getCoinsSpentForCurrentStage(currentStreak);
    
    // Pet thoughts based on coins spent on feeding
    if (coinsSpentOnFeeding === 0) {
      // No coins spent on feeding yet
      const hungryThoughts = [
        "Hi Callee... I'm April 🐶 and my tummy's rumbling sadly. Could you please feed me some cookies?",
        "Woof... It's me, April! 🐕 I'm so hungry and feeling down... could you spare some cookies for me?",
        "Hey there, Callee... April here 🐶 My belly is making sad noises... feed me, please?",
        "Hi friend... I'm April and I'm starving... 🍪 Do you have any cookies to cheer me up?",
        "Callee... It's your puppy April! 🐶 I haven't eaten yet and I'm feeling so low... can you help me out?",
        "Callee... 🐕 My tummy feels so empty and sad... cookies would really lift my spirits!"
      ];
      return getRandomThought(hungryThoughts);
    } else if (coinsSpentOnFeeding < 30) {
      // 10-20 coins spent on feeding (1-2 feedings)
      const satisfiedThoughts = [
        "Mmm… yummy! 🍪 More cookies will make me wag my tail even faster!",
        "That was delicious! 😋 But I could definitely eat more cookies, Callee!",
        "Nom nom nom! 🍪 These cookies are amazing! Can I have another one?",
        "Woof! Those cookies hit the spot! 🐶 But my appetite is still growing!",
        "Thank you, Callee! 🥰 Those cookies were perfect, but I'm still a little peckish!",
        "Yum yum! 🍪 My tail is wagging so fast! More cookies would make me even happier!"
      ];
      return getRandomThought(satisfiedThoughts);
    } else if (coinsSpentOnFeeding < 50) {
      // 30-40 coins spent on feeding (3-4 feedings)
      const growingThoughts = [
        "Woof woof! I'm growing stronger! 🐶 Keep feeding me - I'm getting bigger!",
        "Look at me go! 💪 I can feel myself getting stronger with each cookie!",
        "Amazing! I'm growing so fast! 🌱 More cookies will help me grow even more!",
        "Callee, I feel so energetic! ⚡ These cookies are making me bigger and stronger!",
        "Wag wag! I'm transforming! 🦋 Keep the cookies coming - I'm almost ready for the next stage!",
        "Incredible! My body is changing! 🐕 More cookies will help me reach my full potential!"
      ];
      return getRandomThought(growingThoughts);
    } else {
      // 50+ coins spent on feeding (5+ feedings)
      const happyThoughts = [
        "Yippee! 🥳 I feel amazing, Callee! Now… could you get me some friends to play with!",
        "Woof woof! I'm so strong now! 💪 Maybe it's time to find some playmates?",
        "I feel fantastic! 🌟 All those cookies worked! Now I'm ready for some friends!",
        "Amazing! I'm at my best! ✨ Callee, can you help me find some buddies to play with?",
        "Hooray! I'm fully grown! 🎉 Can you help me find some buddies to play with?",
        "Perfect! I feel incredible! 🚀 Maybe it's time to find some playmates?"
      ];
      return getRandomThought(happyThoughts);
    }
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
    stopAll();
  }, [currentPet, showPetShop, stopAll]);

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
      <div className="absolute top-5 right-10 z-20">
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
              color: '#E5E7EB'
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
            <div className="relative drop-shadow-2xl animate-gentle-bounce">
              <img 
                src={getPetImage()}
                alt="Pet"
                className="w-72 h-72 object-contain rounded-2xl transition-all duration-700 ease-out hover:scale-105"
                style={{
                  animation: careLevel * 10 >= 30 && careLevel * 10 < 50 ? 'petGrow 800ms ease-out' : 
                            careLevel * 10 >= 50 ? 'petEvolve 800ms ease-out' : 'none'
                }}
              />
            </div>
            
            {/* Food bowl moved under pet with sparkle effect */}
            {/* <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-5xl drop-shadow-lg animate-sparkle">
              🥣
              <div className="absolute -top-2 -right-2 text-2xl animate-spin-slow">✨</div>
            </div> */}
          </div>

          {/* Chat Area - Right Side */}
          <div className="flex-1 max-w-2xl">
            {/* Pet's Chat Bubble */}
            {!showPetShop && (
              <div className="relative bg-gradient-to-br from-blue-50 to-cyan-50 rounded-3xl p-6 mb-8 border-3 border-blue-400 shadow-xl w-full backdrop-blur-sm bg-white/90 hover:scale-102 transition-transform">
                {/* Speech bubble tail pointing to pet */}
                <div className="absolute top-1/2 -left-3 transform -translate-y-1/2 w-0 h-0 border-t-[12px] border-b-[12px] border-r-[12px] border-t-transparent border-b-transparent border-r-blue-400"></div>
                
                {/* Pet name badge */}
                <div className="absolute -top-3 left-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
                  {currentPet === 'dog' ? 'April 🐶' : currentPet === 'bobo' ? 'Bobo 🐵' : 'Feather 🦜'}
                </div>

                <div className="text-lg text-slate-800 font-medium leading-relaxed mt-2">
                  {currentPetThought}
                </div>

                {/* Animated dots under chat */}
                <div className="absolute -bottom-6 left-4 flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{animationDelay: '0s'}}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{animationDelay: '0.3s'}}></div>
                  <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{animationDelay: '0.6s'}}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Chat Area - Bottom Right */}
        <div className="fixed bottom-24 right-8 flex flex-row-reverse items-end gap-4 z-30">
          {/* User Avatar */}
          <div className="relative">
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

          {/* User's transcribed message */}
          {transcribedMessage && (
            <div className="max-w-md animate-fade-in">
              <div className="relative bg-gradient-to-br from-purple-500/90 to-indigo-600/90 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-white/20">
                {/* Speech bubble tail pointing to kid */}
                <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 w-0 h-0 border-t-[12px] border-b-[12px] border-l-[12px] border-t-transparent border-b-transparent border-l-purple-500/90"></div>
                <div className="text-sm text-white font-medium leading-relaxed">
                  {transcribedMessage}
                </div>
                {messageTimestamp && (
                  <div className="text-xs text-white/50 mt-1">
                    {new Date(messageTimestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          )}
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
        <div className="flex gap-6 px-8 py-6 bg-white/10 backdrop-blur-md rounded-full border-2 border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.3)] transition-all duration-300">
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
        `}
      </style>
    </div>
  );
}
