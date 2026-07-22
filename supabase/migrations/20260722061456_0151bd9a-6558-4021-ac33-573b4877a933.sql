
-- Extend subscription plans
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'elite';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'studio';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'enterprise';
