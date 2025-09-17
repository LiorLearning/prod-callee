import OpenAI from 'openai';

// Initialize OpenAI configuration
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Enable browser usage
});

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

export class PetAIService {
  private static instance: PetAIService;
  private chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  private constructor() {}

  public static getInstance(): PetAIService {
    if (!PetAIService.instance) {
      PetAIService.instance = new PetAIService();
    }
    return PetAIService.instance;
  }

  private getPetPersonality(petType: string): PetPersonality {
    return PET_PERSONALITIES[petType] || PET_PERSONALITIES['dog'];
  }

  private createPrompt(petType: string, userMessage: string): string {
    const pet = this.getPetPersonality(petType);
    
    return `You are ${pet.name}, a ${pet.type}. You have the following traits: ${pet.traits.join(', ')}. 
${pet.speakingStyle}.

Keep your responses:
- Short and sweet (1-2 sentences)
- Age-appropriate for children
- Always in character
- Include an emoji or two
- Engaging and encouraging further conversation

User's message: "${userMessage}"

Respond as ${pet.name}:`;
  }

  public async generateResponse(petType: string, userMessage: string): Promise<string> {
    try {
      const prompt = this.createPrompt(petType, userMessage);

      console.log('prompt', prompt);

      // Add user message to chat history
      this.chatHistory.push({ role: "user", content: userMessage });

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: prompt
          },
          ...this.chatHistory.slice(-4) // Keep last 4 messages for context
        ],
        temperature: 0.7,
        max_tokens: 60, // Keep responses concise
        presence_penalty: 0.6, // Encourage varied responses
      });

      const petResponse = response.choices[0]?.message?.content?.trim() || "Hmm... *looks confused*";
      
      // Add AI response to chat history
      this.chatHistory.push({ role: "assistant", content: petResponse });

      return petResponse;

    } catch (error) {
      console.error('Error generating pet response:', error);
      return "I'm having trouble thinking right now. Can we try again? 🤔";
    }
  }

  public clearHistory(): void {
    this.chatHistory = [];
  }
}

export const petAIService = PetAIService.getInstance(); 