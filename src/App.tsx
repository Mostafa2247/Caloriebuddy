import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  User,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  orderBy, 
  Timestamp, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, MealLog, ChatMessage } from './types';
import { getChatResponse, parseEstimate, ChatMode } from './lib/gemini';
import { 
  Plus, 
  Send, 
  LogOut, 
  Utensils, 
  Check, 
  X, 
  User as UserIcon, 
  Flame, 
  History, 
  ChevronRight,
  TrendingUp,
  MessageCircle,
  Settings,
  Calculator
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Instead of throwing a raw JSON string that might break the UI, 
  // we'll throw a more descriptive error but also log the JSON for debugging.
  throw new Error(`A database error occurred during ${operationType}. Please try again later.`);
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <X size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-500 mb-6">
              We've encountered an unexpected error. Please try refreshing the page.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-orange-200"
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

const AuthForm = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google Auth error:", err);
      let message = "Failed to sign in with Google. Please try again.";
      if (err.code === 'auth/unauthorized-domain') {
        message = "This domain is not authorized for Firebase Auth. Please contact support.";
      } else if (err.code === 'auth/popup-closed-by-user') {
        message = "Sign-in popup was closed before completion.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Flame size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">CalorieBuddy</h1>
          <p className="text-slate-500 mt-2">Your intelligent meal tracking assistant</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-4 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
      </motion.div>
    </div>
  );
};

const SetupProfile = ({ user, initialData, onComplete, onCancel }: { 
  user: User; 
  initialData?: UserProfile | null;
  onComplete: () => void;
  onCancel?: () => void;
}) => {
  const [calories, setCalories] = useState(initialData?.dailyGoal?.toString() || '2000');
  const [protein, setProtein] = useState(initialData?.dailyProtein?.toString() || '150');
  const [fat, setFat] = useState(initialData?.dailyFat?.toString() || '70');
  const [carbs, setCarbs] = useState(initialData?.dailyCarbs?.toString() || '200');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const calNum = parseInt(calories);
    const protNum = parseInt(protein);
    const fatNum = parseInt(fat);
    const carbNum = parseInt(carbs);

    if (isNaN(calNum) || isNaN(protNum) || isNaN(fatNum) || isNaN(carbNum) || 
        calNum <= 0 || protNum <= 0 || fatNum <= 0 || carbNum <= 0) {
      setError('Please enter valid positive numbers for all fields');
      setLoading(false);
      return;
    }

    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || 'User',
        email: user.email,
        dailyGoal: calNum,
        dailyProtein: protNum,
        dailyFat: fatNum,
        dailyCarbs: carbNum,
        createdAt: initialData?.createdAt ? Timestamp.fromDate(initialData.createdAt) : Timestamp.now()
      }, { merge: true });
      onComplete();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      setError("Failed to save your profile. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "flex items-center justify-center p-4",
      !initialData ? "min-h-screen bg-slate-50" : "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
    )}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 border border-slate-100"
      >
        <div className="flex justify-between items-start mb-2">
          <h2 className="text-2xl font-bold text-slate-900">
            {initialData ? 'Update Your Goals' : 'Set Your Daily Goals'}
          </h2>
          {onCancel && (
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1">
              <X size={20} />
            </button>
          )}
        </div>
        <p className="text-slate-500 mb-6">
          {initialData ? 'Adjust your daily nutritional targets below.' : 'Tell us your daily nutritional needs to get started.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Daily Calories (kcal)</label>
            <input
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Protein (g)</label>
              <input
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fat (g)</label>
              <input
                type="number"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Carbs (g)</label>
              <input
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {loading ? 'Saving...' : initialData ? 'Update Goals' : 'Start Tracking'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ProgressCard = ({ profile, consumed }: { profile: UserProfile; consumed: { calories: number; protein: number; fat: number; carbs: number } }) => {
  const goal = profile.dailyGoal;
  const percentage = Math.min((consumed.calories / goal) * 100, 100);
  const remaining = Math.max(goal - consumed.calories, 0);
  
  const data = [
    { name: 'Consumed', value: consumed.calories },
    { name: 'Remaining', value: remaining },
  ];
  
  const COLORS = ['#ea580c', '#f1f5f9'];

  const MacroProgress = ({ label, current, target, color }: { label: string; current: number; target: number; color: string }) => {
    const pct = Math.min((current / target) * 100, 100);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
          <span>{label}</span>
          <span>{current}/{target}g</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            className={cn("h-full rounded-full", color)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daily Progress</h2>
          <div className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-xs font-bold uppercase tracking-wider">
            Today
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="w-24 h-24 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={45}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold text-slate-900">{Math.round(percentage)}%</span>
            </div>
          </div>
          
          <div className="flex-1 space-y-2">
            <div>
              <p className="text-slate-500 text-[10px] uppercase font-bold">Calories</p>
              <p className="text-xl font-bold text-slate-900">{consumed.calories} <span className="text-xs font-normal text-slate-400">/ {goal}</span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-slate-50">
        <MacroProgress label="Protein" current={consumed.protein} target={profile.dailyProtein} color="bg-blue-500" />
        <MacroProgress label="Fat" current={consumed.fat} target={profile.dailyFat} color="bg-yellow-500" />
        <MacroProgress label="Carbs" current={consumed.carbs} target={profile.dailyCarbs} color="bg-green-500" />
      </div>
    </div>
  );
};

const MealHistory = ({ meals, onDelete }: { meals: MealLog[]; onDelete: (id: string) => void }) => {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm overflow-hidden">
      <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <History size={20} className="text-orange-500" />
        Recent Meals
      </h2>
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {meals.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No meals logged yet today</p>
        ) : (
          meals.map((meal) => (
            <div key={meal.id} className="group flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-orange-500 transition-colors shadow-sm">
                  <Utensils size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{meal.description}</p>
                  <div className="flex gap-2 text-[10px] text-slate-400">
                    <span>{meal.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>•</span>
                    <span>{meal.protein}g P</span>
                    <span>{meal.fat}g F</span>
                    <span>{meal.carbs}g C</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-orange-600">{meal.calories} kcal</p>
                <button 
                  onClick={() => meal.id && onDelete(meal.id)}
                  className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('log');
  const [hasPermissionError, setHasPermissionError] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const handleOpenChat = (mode: ChatMode = 'log') => {
    setChatMode(mode);
    setIsChatOpen(true);
    setIsMenuOpen(false);
    if (messages.length === 0) {
      const initialMessage = mode === 'log' 
        ? "Hi! I'm CalorieBuddy. What did you eat today?" 
        : "Hi! I'm your Portion Calculator. Tell me what you want to eat and how many calories you're aiming for, and I'll tell you the portion size!";
      setMessages([{ role: 'assistant', content: initialMessage }]);
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
    setMessages([]);
    setHasPermissionError(false);
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      try {
        setUser(u);
        if (!u) {
          setProfile(null);
          setMeals([]);
          setIsAuthReady(true);
        }
      } catch (error) {
        console.error("Auth state change error:", error);
        setIsAuthReady(true);
      }
    });

    // Fallback to ensure app loads even if auth state takes too long
    const timeout = setTimeout(() => {
      setIsAuthReady(true);
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Fetch profile and meals when user changes
  useEffect(() => {
    if (!user) return;

    // Listen to profile changes
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile({
            uid: user.uid,
            name: data.name,
            email: data.email,
            dailyGoal: data.dailyGoal,
            dailyProtein: data.dailyProtein || 0,
            dailyFat: data.dailyFat || 0,
            dailyCarbs: data.dailyCarbs || 0,
            createdAt: data.createdAt.toDate()
          });
        }
        setIsAuthReady(true);
      } catch (err) {
        console.error("Error processing profile data:", err);
        setIsAuthReady(true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setIsAuthReady(true);
    });

    // Fetch today's meals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, 'meals'),
      where('userId', '==', user.uid),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeMeals = onSnapshot(q, (snapshot) => {
      try {
        const mealList: MealLog[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          mealList.push({
            id: doc.id,
            userId: data.userId,
            description: data.description,
            calories: data.calories,
            protein: data.protein || 0,
            fat: data.fat || 0,
            carbs: data.carbs || 0,
            timestamp: data.timestamp.toDate(),
            confirmed: data.confirmed
          });
        });
        setMeals(mealList);
      } catch (err) {
        console.error("Error processing meals data:", err);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
    });

    return () => {
      unsubscribeProfile();
      unsubscribeMeals();
    };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.concat(userMessage).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }]
      }));

      const responseText = await getChatResponse(history, chatMode);
      const estimate = chatMode === 'log' ? parseEstimate(responseText) : null;

      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: responseText,
        type: estimate ? 'estimate' : 'text',
        estimate: estimate || undefined
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("Chat error:", err);
      let errorMessage = "I'm sorry, I encountered an error while processing your request. Please try again in a moment.";
      
      if (err.message?.includes('permission denied') || err.message?.includes('API_KEY_INVALID')) {
        setHasPermissionError(true);
        errorMessage = "It looks like there's a permission issue with the Gemini API. Please make sure your API key is correctly set in the settings, or try selecting a different model.";
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMeal = async (estimate: { description: string; calories: number; protein: number; fat: number; carbs: number }) => {
    if (!user) return;

    try {
      await addDoc(collection(db, 'meals'), {
        userId: user.uid,
        description: estimate.description,
        calories: estimate.calories,
        protein: estimate.protein,
        fat: estimate.fat,
        carbs: estimate.carbs,
        timestamp: Timestamp.now(),
        confirmed: true
      });

      const isArabic = estimate.description.match(/[\u0600-\u06FF]/);
      const content = isArabic 
        ? `تمام! سجلت لك **${estimate.description}** (${estimate.calories} سعرة، ${estimate.protein} جرام بروتين، ${estimate.fat} جرام دهون، ${estimate.carbs} جرام كربوهيدرات).`
        : `Great! I've logged **${estimate.description}** (${estimate.calories} kcal, ${estimate.protein}g P, ${estimate.fat}g F, ${estimate.carbs}g C) for you.`;

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: content
      }]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'meals');
    }
  };

  const handleDeleteMeal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'meals', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `meals/${id}`);
    }
  };

  const totals = meals.reduce((acc, m) => ({
    calories: acc.calories + m.calories,
    protein: acc.protein + (m.protein || 0),
    fat: acc.fat + (m.fat || 0),
    carbs: acc.carbs + (m.carbs || 0),
  }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  if (user && isAuthReady && !profile) {
    return <SetupProfile user={user} onComplete={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar / Topbar */}
      <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-6 flex flex-col h-auto md:h-screen sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
            <Flame size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">CalorieBuddy</h1>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
          {profile && <ProgressCard profile={profile} consumed={totals} />}
          <MealHistory meals={meals} onDelete={handleDeleteMeal} />
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
              <UserIcon size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{profile?.name || 'User'}</p>
              <p className="text-xs text-slate-500 truncate w-32">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {isEditingGoals && (
        <SetupProfile 
          user={user} 
          initialData={profile} 
          onComplete={() => setIsEditingGoals(false)} 
          onCancel={() => setIsEditingGoals(false)}
        />
      )}

      {/* Main Dashboard Area */}
      <main className="flex-1 p-4 md:p-12 overflow-y-auto custom-scrollbar relative">
        {/* Settings Button - Fixed Top Right */}
        <div className="fixed top-4 right-4 md:top-8 md:right-8 z-30">
          <button 
            onClick={() => setIsEditingGoals(true)}
            className="p-3 text-slate-400 hover:text-orange-600 transition-all bg-white rounded-2xl shadow-lg border border-slate-100"
            title="Edit Goals"
          >
            <Settings size={24} />
          </button>
        </div>

        <div className="max-w-5xl mx-auto space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Welcome back, {profile?.name}!</h2>
              <p className="text-slate-500">Here's your nutritional summary for today.</p>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              {profile && <ProgressCard profile={profile} consumed={totals} />}
            </div>
            <div className="lg:col-span-2">
              <MealHistory meals={meals} onDelete={handleDeleteMeal} />
            </div>
          </div>
        </div>
      </main>

      {/* Chat Modal Overlay */}
      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseChat}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl h-[85vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                    {chatMode === 'log' ? <MessageCircle size={24} /> : <Calculator size={24} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{chatMode === 'log' ? 'CalorieBuddy AI' : 'Portion Calculator'}</h3>
                    <p className="text-xs text-slate-500">{chatMode === 'log' ? 'Describe your meal to get an estimate' : 'Tell me what you want to eat and your calorie target'}</p>
                  </div>
                </div>
                <button 
                  onClick={handleCloseChat}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              {hasPermissionError && (
                <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <X size={16} className="text-red-500" />
                    <p className="text-sm text-red-600 font-medium">Gemini API Permission Denied</p>
                  </div>
                  <button 
                    onClick={() => (window as any).aistudio?.openSelectKey()}
                    className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm"
                  >
                    Select API Key
                  </button>
                </div>
              )}

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
                {messages.length === 1 && chatMode === 'log' && (
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 text-sm text-blue-700 flex items-start gap-3">
                    <MessageCircle size={18} className="mt-0.5 shrink-0" />
                    <p>
                      {messages[0].content.match(/[\u0600-\u06FF]/) 
                        ? "أوصف وجبتك بالتفصيل (زي: ساندوتش حواوشي وسط) عشان أقدر أحسبلك السعرات وتظهر لك أزرار القبول."
                        : "Describe your meal in detail (e.g., medium hawawshi sandwich) so I can estimate the calories and show you the Accept/Reject buttons."}
                    </p>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div 
                        dir="auto"
                        className={cn(
                          "max-w-[85%] md:max-w-[70%] rounded-3xl p-5 shadow-sm",
                          msg.role === 'user' 
                            ? "bg-orange-600 text-white rounded-tr-none" 
                            : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                        )}
                      >
                        <div className="prose prose-sm max-w-none prose-slate">
                          <div className={cn(msg.role === 'user' ? "text-white" : "text-slate-800")}>
                            <ReactMarkdown>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {msg.type === 'estimate' && msg.estimate && (
                          <div className="mt-4 p-5 bg-orange-50 rounded-2xl border border-orange-100">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Calorie Estimate</span>
                              <Utensils size={16} className="text-orange-400" />
                            </div>
                            <p className="text-slate-900 font-bold text-lg mb-1">{msg.estimate.description}</p>
                            <p className="text-orange-600 font-black text-3xl mb-3">{msg.estimate.calories} <span className="text-sm font-normal">kcal</span></p>
                            
                            <div className="grid grid-cols-3 gap-3 mb-5">
                              <div className="bg-white p-2.5 rounded-xl text-center shadow-sm">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Prot</p>
                                <p className="text-xs font-bold text-slate-700">{msg.estimate.protein}g</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl text-center shadow-sm">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Fat</p>
                                <p className="text-xs font-bold text-slate-700">{msg.estimate.fat}g</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl text-center shadow-sm">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Carbs</p>
                                <p className="text-xs font-bold text-slate-700">{msg.estimate.carbs}g</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-3">
                              <button 
                                onClick={() => handleConfirmMeal(msg.estimate!)}
                                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                              >
                                <Check size={18} /> {msg.content.match(/[\u0600-\u06FF]/) ? 'قبول' : 'Accept'}
                              </button>
                              <button 
                                onClick={() => setMessages(prev => [...prev, { 
                                  role: 'assistant', 
                                  content: msg.content.match(/[\u0600-\u06FF]/) 
                                    ? "ولا يهمك! خلينا نحاول تاني. قولي تفاصيل أكتر عن اللي أكلته." 
                                    : "No problem! Let's try again. Tell me more about what you ate." 
                                }])}
                                className="flex-1 bg-white hover:bg-slate-50 text-slate-600 text-sm font-bold py-3 rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-2"
                              >
                                <X size={18} /> {msg.content.match(/[\u0600-\u06FF]/) ? 'رفض' : 'Reject'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-100 rounded-3xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Modal Input Area */}
              <div className="p-6 bg-white border-t border-slate-100">
                <form 
                  onSubmit={handleSendMessage}
                  className="max-w-3xl mx-auto relative group"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    dir="auto"
                    placeholder={chatMode === 'log' ? "Describe your meal (e.g., medium hawawshi sandwich)..." : "What do you want to eat and how many calories? (e.g., fries for 300 kcal)"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-16 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:border-transparent outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="absolute right-2 top-2 bottom-2 w-12 bg-orange-600 hover:bg-orange-700 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:bg-slate-300"
                  >
                    <Send size={20} />
                  </button>
                </form>
                <p className="text-center text-[10px] text-slate-400 mt-3 uppercase tracking-widest font-bold">
                  Powered by Gemini AI • Grounded by Google Search
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Button with Menu */}
      <div className="fixed bottom-8 right-6 md:right-8 z-40 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col gap-3 mb-2"
            >
              <button
                onClick={() => handleOpenChat('calculate')}
                className="flex items-center gap-3 bg-white text-slate-700 px-4 py-3 rounded-2xl shadow-xl border border-slate-100 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <span className="text-sm font-bold">Portion Calculator</span>
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                  <Calculator size={20} />
                </div>
              </button>
              <button
                onClick={() => handleOpenChat('log')}
                className="flex items-center gap-3 bg-white text-slate-700 px-4 py-3 rounded-2xl shadow-xl border border-slate-100 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <span className="text-sm font-bold">Log Direct Meal</span>
                <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                  <Plus size={20} />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-16 h-16 ${isMenuOpen ? 'bg-slate-800' : 'bg-orange-600'} text-white rounded-full shadow-2xl flex items-center justify-center transition-colors`}
        >
          <motion.div
            animate={{ rotate: isMenuOpen ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <Plus size={32} />
          </motion.div>
        </motion.button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
