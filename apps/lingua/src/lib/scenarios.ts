/**
 * Conversation settings. Free conversation is a chat with the partner as
 * themselves; the rest are role-plays where the partner takes on a role and
 * the learner has a few practical goals to reach.
 */

export type Goal = { id: string; label: string };

export type Scenario = {
  id: string;
  title: string;
  emoji: string;
  /** One line for the picker. */
  blurb: string;
  /** Who the partner plays. Empty for free conversation (they are themselves). */
  partnerRole: string;
  /** The situation, told to the model. */
  setting: string;
  goals: Goal[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: "free",
    title: "Free conversation",
    emoji: "💬",
    blurb: "Get to know your partner and talk about anything.",
    partnerRole: "",
    setting:
      "You just met the learner through a language-exchange app and are chatting for the first time on a call. Talk about yourselves, daily life, plans and interests. Follow the learner's lead.",
    goals: [
      { id: "introduce", label: "Introduce yourself" },
      { id: "ask-back", label: "Ask your partner about their life" },
      { id: "opinion", label: "Share an opinion on something" },
    ],
  },
  {
    id: "cafe",
    title: "Ordering at a café",
    emoji: "☕",
    blurb: "Order drinks and a snack, ask questions, pay.",
    partnerRole: "the friendly server at a busy neighborhood café in your city",
    setting:
      "The learner walks up to the counter. Greet them, take their order, suggest something, mention one item is sold out, and handle payment.",
    goals: [
      { id: "greet", label: "Greet the server" },
      { id: "order", label: "Order a drink and something to eat" },
      { id: "ask", label: "Ask a question about the menu" },
      { id: "pay", label: "Pay and say goodbye" },
    ],
  },
  {
    id: "airport",
    title: "Airport check-in",
    emoji: "✈️",
    blurb: "Check in, handle a bag problem, find your gate.",
    partnerRole: "an airline check-in agent at your city's airport",
    setting:
      "The learner is checking in for an international flight. Ask for their passport and destination, handle a checked bag that is slightly overweight, offer a seat choice, and explain the gate and boarding time.",
    goals: [
      { id: "check-in", label: "Check in for the flight" },
      { id: "bag", label: "Solve the overweight bag" },
      { id: "seat", label: "Choose a seat" },
      { id: "gate", label: "Confirm gate and boarding time" },
    ],
  },
  {
    id: "hotel",
    title: "Hotel front desk",
    emoji: "🏨",
    blurb: "Check in and sort out a problem with the room.",
    partnerRole: "the receptionist at a small boutique hotel",
    setting:
      "The learner arrives to check in. Their reservation has a small mix-up (wrong number of nights). Resolve it, explain breakfast and Wi-Fi, and respond to a request.",
    goals: [
      { id: "check-in", label: "Check in" },
      { id: "fix", label: "Fix the reservation mix-up" },
      { id: "info", label: "Ask about breakfast or Wi-Fi" },
    ],
  },
  {
    id: "directions",
    title: "Asking for directions",
    emoji: "🗺️",
    blurb: "Find your way to a landmark on foot or by transit.",
    partnerRole: "a local passer-by who knows the area well",
    setting:
      "The learner stops you on the street, lost, looking for a well-known place in your city. Give directions with landmarks, suggest transit, and make small talk.",
    goals: [
      { id: "ask", label: "Politely stop someone and ask" },
      { id: "understand", label: "Confirm the directions back" },
      { id: "transit", label: "Ask about public transit" },
    ],
  },
  {
    id: "doctor",
    title: "At the doctor",
    emoji: "🩺",
    blurb: "Describe symptoms and understand advice.",
    partnerRole: "a calm, kind general practitioner",
    setting:
      "The learner has had a sore throat and fever for two days. Ask about symptoms, give simple advice and explain how to take a medicine. Keep it everyday and non-alarming.",
    goals: [
      { id: "symptoms", label: "Describe your symptoms" },
      { id: "duration", label: "Say how long you've felt ill" },
      { id: "advice", label: "Understand the advice and dosage" },
    ],
  },
  {
    id: "market",
    title: "Shopping at a market",
    emoji: "🧺",
    blurb: "Ask prices, quantities, and haggle a little.",
    partnerRole: "a cheerful stallholder at an open-air market",
    setting:
      "The learner is buying fruit, vegetables and a small souvenir. Talk about quality, quantities and prices; allow a little friendly bargaining where culturally natural.",
    goals: [
      { id: "prices", label: "Ask prices" },
      { id: "quantity", label: "Ask for specific quantities" },
      { id: "bargain", label: "Negotiate or ask for a deal" },
    ],
  },
  {
    id: "interview",
    title: "Job interview",
    emoji: "💼",
    blurb: "Talk about your experience and strengths.",
    partnerRole: "a hiring manager at a mid-sized company",
    setting:
      "The learner is interviewing for a role that suits their background. Ask about experience, strengths, a challenge they overcame and their questions for you. Use a professional register.",
    goals: [
      { id: "intro", label: "Introduce your background" },
      { id: "strength", label: "Describe a strength with an example" },
      { id: "question", label: "Ask the interviewer a question" },
    ],
  },
  {
    id: "phone",
    title: "Rescheduling by phone",
    emoji: "📞",
    blurb: "Call to move an appointment to another day.",
    partnerRole: "the receptionist at a hair salon, answering the phone",
    setting:
      "The learner calls to move tomorrow's appointment. Offer a few alternative times, confirm details, and handle the call naturally without visual cues.",
    goals: [
      { id: "explain", label: "Explain why you're calling" },
      { id: "choose", label: "Agree on a new time" },
      { id: "confirm", label: "Confirm and close the call" },
    ],
  },
  {
    id: "dinner",
    title: "Dinner with friends",
    emoji: "🍽️",
    blurb: "Casual chat over a meal: plans, stories, opinions.",
    partnerRole: "a close friend having dinner with the learner at a local restaurant",
    setting:
      "You and the learner are friends catching up over dinner. Tell a short story about your week, ask about theirs, make weekend plans, and comment on the food.",
    goals: [
      { id: "story", label: "Tell a short story" },
      { id: "react", label: "React to your friend's story" },
      { id: "plans", label: "Make plans for the weekend" },
    ],
  },
];

const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

export function scenario(id: string): Scenario | undefined {
  return BY_ID.get(id);
}

export function resolveScenario(id?: string): Scenario {
  return (id && BY_ID.get(id)) || SCENARIOS[0];
}
