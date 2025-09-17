import OpenAI from 'openai';
import { getRandomSpellingQuestion, SpellingQuestion } from './questionBankUtils';

// Initialize OpenAI configuration
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Enable browser usage
});

const CHAT_HISTORY_STORAGE_KEY = 'petAI_chatHistory';
const MAX_CHAT_HISTORY = 30; // Maximum number of messages to keep in history

interface PetPersonality {
  name: string;
  type: 'dog' | 'monkey' | 'bird';
  traits: string[];
  speakingStyle: string;
}

const PET_PERSONALITIES: Record<string, PetPersonality> = {
  'dog': {
    name: 'April',
    type: 'dog',
    traits: ['friendly', 'playful', 'loyal', 'enthusiastic'],
    speakingStyle: 'Uses lots of happy expressions, often says "woof" or "ruff", and loves talking about playing and making friends'
  },
  'bobo': {
    name: 'Bobo',
    type: 'monkey',
    traits: ['curious', 'energetic', 'clever', 'mischievous'],
    speakingStyle: 'Says "ooh ooh" occasionally, talks about swinging and climbing, very expressive and animated'
  },
  'feather': {
    name: 'Feather',
    type: 'bird',
    traits: ['cheerful', 'musical', 'graceful', 'social'],
    speakingStyle: 'Often chirps or tweets, talks about flying and singing, very melodic way of speaking'
  }
};

interface PetResponse {
  message: string;
  spellingQuestion: SpellingQuestion | null;
}

export class PetAIService {
  private static instance: PetAIService;
  private chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  private constructor() {
    // Load chat history from localStorage if it exists
    const savedHistory = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (savedHistory) {
      try {
        // Load and limit history to most recent MAX_CHAT_HISTORY messages
        const parsedHistory = JSON.parse(savedHistory);
        this.chatHistory = parsedHistory.slice(-MAX_CHAT_HISTORY);
      } catch (error) {
        console.error('Error loading chat history from localStorage:', error);
        this.chatHistory = [];
      }
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(this.chatHistory));
    } catch (error) {
      console.error('Error saving chat history to localStorage:', error);
    }
  }

  public static getInstance(): PetAIService {
    if (!PetAIService.instance) {
      PetAIService.instance = new PetAIService();
    }
    return PetAIService.instance;
  }

  private getPetPersonality(petType: string): PetPersonality {
    return PET_PERSONALITIES[petType] || PET_PERSONALITIES['dog'];
  }

  private createPrompt(petType: string, userMessage: string, spellingWord?: string): string {
    const pet = this.getPetPersonality(petType);
    console.log('spellingWord', spellingWord);
    console.log('userMessage', userMessage);
    
    let basePrompt = `You are ${pet.name}, a ${pet.type}. You have the following traits: ${pet.traits.join(', ')}. 
${pet.speakingStyle}.
Your goal is to engage the kid in conversations. They are usually asking you questions. Tell them interesting stories about your day.
You should make kids laugh, and make them want to talk to you more.

Keep your responses:
- Short and sweet (3-4 sentences)
- Age-appropriate for children
- Always in character
- Include an emoji or two
- Engaging and encouraging further conversation`;

    if (spellingWord) {
      basePrompt += `\n\nIMPORTANT: Include the word "${spellingWord}" naturally in your first or second sentence, only ONCE. Use it exactly as written. This is to make the kids learn spelling words while talking to you.`;
    }

    basePrompt += `\n\nUser's message: "${userMessage}"\n\nRespond as ${pet.name}. Think step by step and then answer.`;
    
    return basePrompt;
  }

  public async generateResponse(petType: string, userMessage: string): Promise<PetResponse> {
    try {
      const spellingQuestion = getRandomSpellingQuestion();
      const prompt = this.createPrompt(petType, userMessage, spellingQuestion?.audio);

      console.log('prompt', prompt);
      console.log('spellingQuestion', spellingQuestion);

      // Add user message to chat history and maintain size limit
      this.chatHistory.push({ role: "user", content: userMessage });
      if (this.chatHistory.length > MAX_CHAT_HISTORY) {
        this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
      }
      this.saveHistoryToStorage();

      console.log('chatHistory', this.chatHistory);

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: prompt
          },
          ...this.chatHistory.slice(-3)
        ],
        temperature: 0.7,
        max_tokens: 200, // Keep responses concise
        presence_penalty: 0.6, // Encourage varied responses
      });

      const petResponse = response.choices[0]?.message?.content?.trim() || "Hmm... *looks confused*";
      
      // Add AI response to chat history and maintain size limit
      this.chatHistory.push({ role: "assistant", content: petResponse });
      if (this.chatHistory.length > MAX_CHAT_HISTORY) {
        this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
      }
      this.saveHistoryToStorage();

      return {
        message: petResponse,
        spellingQuestion
      };

    } catch (error) {
      console.error('Error generating pet response:', error);
      return {
        message: "I'm having trouble thinking right now. Can we try again? 🤔",
        spellingQuestion: null
      };
    }
  }

  public clearHistory(): void {
    this.chatHistory = [];
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  }
}

export const petAIService = PetAIService.getInstance(); 