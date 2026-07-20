export type PlanId = "pro" | "premium";

export const PLANS: Record<PlanId, {
  id: PlanId;
  name: string;
  price: number;
  currency: "GHS";
  features: string[];
  highlight?: boolean;
}> = {
  pro: {
    id: "pro",
    name: "Pro",
    price: 40,
    currency: "GHS",
    features: [
      "Unlimited uploads",
      "Advanced AI coaching",
      "Skeleton replay tools",
      "Progress analytics",
    ],
    highlight: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 80,
    currency: "GHS",
    features: [
      "Everything in Pro",
      "Priority AI processing",
      "AI Personal Coach",
      "Downloadable reports",
      "Advanced comparisons",
    ],
  },
};

// Merchant / mobile-money instructions
export const PAYMENT_INFO = {
  provider: "MTN Mobile Money",
  number: "0206395966",
  accountName: "PATIENCE QUARSHIE",
  currency: "GHS",
};
