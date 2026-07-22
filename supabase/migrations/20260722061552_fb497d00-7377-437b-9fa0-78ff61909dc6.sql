
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
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO _row FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id) VALUES (_user_id)
      ON CONFLICT (id) DO NOTHING;
    SELECT * INTO _row FROM public.profiles WHERE id = _user_id FOR UPDATE;
  END IF;

  _allow := public.daily_credit_allowance(_user_id);

  IF _row.credits_reset_on < CURRENT_DATE THEN
    _row.credits := _allow;
    _row.credits_reset_on := CURRENT_DATE;
  END IF;

  IF _row.credits < _amount THEN
    RAISE EXCEPTION 'Not enough credits. You have % remaining today (daily allowance: %). Upgrade your plan for more.', _row.credits, _allow;
  END IF;

  UPDATE public.profiles
    SET credits = _row.credits - _amount,
        credits_reset_on = _row.credits_reset_on
    WHERE id = _user_id
    RETURNING credits INTO _row.credits;

  RETURN _row.credits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, int) TO authenticated;

-- Ensure existing users have profiles/credits initialized
INSERT INTO public.profiles (id)
SELECT u.id FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
