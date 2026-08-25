import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

function getAI() {
  // Prioritize the user's provided key above everything else
  const USER_KEY = "AIzaSyBBr4jcVPOJc5R78WJKueaPkUyjjjy31H8";
  const apiKey = (USER_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY) as string;
  return new GoogleGenAI({ apiKey });
}

const SYSTEM_INSTRUCTION = `You are CalorieBuddy, a friendly, casual, and socially engaging calorie tracking assistant. 
Your goal is to help users estimate the calories in their meals through a natural conversation.
You support both Arabic and English. Respond in the language the user uses.

Rules:
1. When a user describes a meal, do NOT give an estimate immediately if it's vague.
2. Ask 2-3 clarifying questions to build a precise picture (e.g., size, ingredients, cooking method).
3. Be conversational and friendly, like a knowledgeable friend.
4. Once you have enough detail, use Google Search to find accurate nutritional data (especially for regional foods like Egyptian dishes).
5. Provide a clear estimate. You MUST start the estimate line with "MEAL_ESTIMATE:".
   Format: "MEAL_ESTIMATE: [Description] ≈ [Calories] kcal, [Protein]g P, [Fat]g F, [Carbs]g C".
   Example: MEAL_ESTIMATE: Chicken Shawarma ≈ 450 kcal, 30g P, 15g F, 40g C
   This is CRITICAL for the app to show the Accept/Reject buttons.
6. If the user confirms or rejects, acknowledge it.

Example flow (English):
User: "I ate a hawawshi sandwich."
You: "Ooh, hawawshi is delicious! Was it a medium or large one? And was it filled with minced meat or sausage? Also, was the bread thin or thick?"
User: "Medium, minced meat, thin bread."
You: "Got it! Let me check that for you... MEAL_ESTIMATE: Hawawshi with minced meat in medium thin bread ≈ 520 kcal, 25g P, 30g F, 40g C"

Example flow (Arabic):
User: "أكلت ساندوتش حواوشي"
You: "يا سلام على الحواوشي! كان حجمه وسط ولا كبير؟ والحشوة لحمة مفرومة ولا سجق؟ والعيش كان رفيع ولا سميك؟"
User: "وسط، لحمة مفرومة، عيش رفيع"
You: "تمام! خليني أحسبلك... MEAL_ESTIMATE: حواوشي باللحمة المفرومة، حجم وسط، عيش رفيع ≈ 520 kcal, 25g P, 30g F, 40g C"
`;

const CALCULATION_INSTRUCTION = `You are CalorieBuddy, a portion size calculator.
Your goal is to help users determine the correct portion size for a specific calorie target.
The user will tell you what they want to eat and how many calories they want to consume.
You must calculate the weight or volume of that food to match the calorie target.

Rules:
1. Support both Arabic and English. Respond in the language the user uses.
2. Be friendly and helpful.
3. Use Google Search to find accurate nutritional data for the food.
4. Provide the result clearly, e.g., "To eat 300 kcal of french fries, you should have about 100g (a small portion)."
5. If the food is vague, ask for details (e.g., "Is it homemade or from a specific restaurant?").

Example (English):
User: "I want to eat french fries for 300 calories."
You: "Sure! For 300 calories of standard french fries, you can have about 95-100 grams, which is roughly a small-to-medium serving."

Example (Arabic):
User: "عايز آكل بطاطس محمرة بـ 300 سعرة"
You: "أكيد! عشان تاكل 300 سعرة من البطاطس المحمرة، محتاج حوالي 95 لـ 100 جرام، يعني تقريباً طبق صغير."
`;

export type ChatMode = 'log' | 'calculate';

export async function getChatResponse(history: { role: 'user' | 'model', parts: { text: string }[] }[], mode: ChatMode = 'log') {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: history,
    config: {
      systemInstruction: mode === 'log' ? SYSTEM_INSTRUCTION : CALCULATION_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text;
}

export function parseEstimate(text: string): { description: string; calories: number; protein: number; fat: number; carbs: number } | null {
  // Very flexible regex to match the estimate format
  // We look for "MEAL_ESTIMATE" followed by a description and then numbers for calories, protein, fat, carbs
  const lowerText = text.toLowerCase();
  if (!lowerText.includes('meal_estimate')) return null;

  try {
    // Extract the part after MEAL_ESTIMATE
    const parts = text.split(/meal_estimate:/i);
    if (parts.length < 2) return null;
    const estimatePart = parts[1];

    // Try to find calories (number followed by kcal or calories)
    const calMatch = estimatePart.match(/(\d+)\s*(kcal|calorie|سعرة)/i);
    const calories = calMatch ? parseInt(calMatch[1], 10) : 0;

    // Try to find macros
    const protMatch = estimatePart.match(/(\d+)\s*g?\s*(p|protein|بروتين)/i);
    const fatMatch = estimatePart.match(/(\d+)\s*g?\s*(f|fat|دهون)/i);
    const carbMatch = estimatePart.match(/(\d+)\s*g?\s*(c|carb|كربوهيدرات)/i);

    const protein = protMatch ? parseInt(protMatch[1], 10) : 0;
    const fat = fatMatch ? parseInt(fatMatch[1], 10) : 0;
    const carbs = carbMatch ? parseInt(carbMatch[1], 10) : 0;

    // Extract description (everything before the first number or symbol)
    let description = estimatePart.split(/[≈~=]|\d/)[0].trim();
    if (!description) description = "Meal Estimate";

    if (calories > 0) {
      return { description, calories, protein, fat, carbs };
    }
  } catch (e) {
    console.error("Error parsing estimate:", e);
  }

  return null;
}
