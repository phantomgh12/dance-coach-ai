
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS credits_reset_on date NOT NULL DEFAULT CURRENT_DATE;

CREATE OR REPLACE FUNCTION public.daily_credit_allowance(_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE COALESCE((SELECT plan::text FROM public.subscriptions WHERE user_id = _user_id), 'free')
    WHEN 'free' THEN 50
    WHEN 'starter' THEN 150
    WHEN 'pro' THEN 400
    WHEN 'premium' THEN 1000
    WHEN 'elite' THEN 2500
    WHEN 'studio' THEN 6000
    WHEN 'enterprise' THEN 20000
    ELSE 50
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.daily_credit_allowance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_credit_allowance(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_credits(_user_id uuid, _amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.profiles%ROWTYPE;
  _allow int;
BEGIN
  SELECT * INTO _row FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile missing';
  END IF;

  _allow := public.daily_credit_allowance(_user_id);

  IF _row.credits_reset_on < CURRENT_DATE THEN
    _row.credits := _allow;
    _row.credits_reset_on := CURRENT_DATE;
  END IF;

  IF _row.credits < _amount THEN
    RAISE EXCEPTION 'Not enough credits. You have % credits remaining today (daily allowance: %). Upgrade your plan for more.', _row.credits, _allow
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles
    SET credits = _row.credits - _amount,
        credits_reset_on = _row.credits_reset_on
    WHERE id = _user_id
    RETURNING credits INTO _row.credits;

  RETURN _row.credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, int) TO service_role;
