export type PlanId = "starter" | "pro" | "premium" | "elite" | "studio" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  currency: "GHS";
  dailyCredits: number;
  features: string[];
  highlight?: boolean;
  badge?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 40,
    currency: "GHS",
    dailyCredits: 150,
    features: [
      "150 AI credits per day",
      "Unlimited uploads",
      "Basic AI lesson breakdowns",
      "Progress tracking",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 80,
    currency: "GHS",
    dailyCredits: 400,
    features: [
      "400 AI credits per day",
      "Advanced AI coaching",
      "Practice scoring",
      "Skeleton replay tools",
    ],
    highlight: true,
    badge: "Most popular",
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 200,
    currency: "GHS",
    dailyCredits: 1000,
    features: [
      "1,000 AI credits per day",
      "Priority AI processing",
      "AI Personal Coach",
      "Downloadable reports",
    ],
  },
  elite: {
    id: "elite",
    name: "Elite",
    price: 500,
    currency: "GHS",
    dailyCredits: 2500,
    features: [
      "2,500 AI credits per day",
      "1-on-1 style feedback",
      "Advanced comparisons",
      "Early access to new features",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: 1000,
    currency: "GHS",
    dailyCredits: 6000,
    features: [
      "6,000 AI credits per day",
      "Team dashboards (up to 10)",
      "Batch analysis",
      "Priority support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 2000,
    currency: "GHS",
    dailyCredits: 20000,
    features: [
      "20,000 AI credits per day",
      "Unlimited seats",
      "Custom onboarding",
      "Dedicated success manager",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "pro", "premium", "elite", "studio", "enterprise"];

export const FREE_DAILY_CREDITS = 50;
export const AI_COST_PER_USE = 10;

// Merchant / mobile-money instructions
export const PAYMENT_INFO = {
  provider: "MTN Mobile Money",
  number: "0206395966",
  accountName: "PATIENCE QUARSHIE",
  currency: "GHS",
};
