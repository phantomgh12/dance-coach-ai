
CREATE TABLE IF NOT EXISTS public.algo_training_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dance','vocal')),
  features jsonb NOT NULL,
  labels jsonb NOT NULL,
  quality numeric NOT NULL DEFAULT 0,
  accepted boolean NOT NULL DEFAULT false,
  rejection_reason text,
  credits_awarded int NOT NULL DEFAULT 0,
  effort int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.algo_training_samples TO authenticated;
GRANT ALL ON public.algo_training_samples TO service_role;
ALTER TABLE public.algo_training_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trains select" ON public.algo_training_samples FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own trains insert" ON public.algo_training_samples FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.algo_weights (
  kind text PRIMARY KEY,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.algo_weights TO authenticated, anon;
GRANT ALL ON public.algo_weights TO service_role;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weights readable" ON public.algo_weights FOR SELECT USING (true);

INSERT INTO public.algo_weights (kind, weights) VALUES
  ('dance', '{"timing":0.28,"accuracy":0.32,"energy":0.2,"posture":0.2}'::jsonb),
  ('vocal', '{"pitch":0.28,"timing":0.22,"breath":0.18,"tone":0.16,"expression":0.16}'::jsonb)
ON CONFLICT (kind) DO NOTHING;

-- Daily reward cap per user
CREATE OR REPLACE FUNCTION public.award_training_credits(
  _user_id uuid, _amount int
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _today_awarded int; _cap int := 100; _cur int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(credits_awarded),0) INTO _today_awarded
    FROM public.algo_training_samples
    WHERE user_id = _user_id AND created_at >= date_trunc('day', now());

  IF _today_awarded >= _cap THEN
    RETURN 0;
  END IF;

  _amount := LEAST(_amount, _cap - _today_awarded);

  UPDATE public.profiles SET credits = COALESCE(credits,0) + _amount WHERE id = _user_id
    RETURNING credits INTO _cur;

  RETURN _amount;
END;
$$;
