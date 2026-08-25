export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  dailyGoal: number;
  dailyProtein: number;
  dailyFat: number;
  dailyCarbs: number;
  createdAt: Date;
}

export interface MealLog {
  id?: string;
  userId: string;
  description: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  timestamp: Date;
  confirmed: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'estimate';
  estimate?: {
    description: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}
