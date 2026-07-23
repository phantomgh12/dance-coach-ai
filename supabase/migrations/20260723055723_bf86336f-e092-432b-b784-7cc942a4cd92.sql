
-- Backfill: grant admin to listed emails if account already exists
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) IN (
  'leonacquaye73@gmail.com',
  'leonacquaye737@gmail.com',
  'leonforge123@gmail.com',
  'phantomgh12@gmail.com'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Also make sure they have profile + subscription rows
INSERT INTO public.profiles (id, display_name)
SELECT u.id, split_part(u.email, '@', 1)
FROM auth.users u
WHERE lower(u.email) IN (
  'leonacquaye73@gmail.com','leonacquaye737@gmail.com','leonforge123@gmail.com','phantomgh12@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subscriptions (user_id, plan, status)
SELECT u.id, 'premium', 'active'
FROM auth.users u
WHERE lower(u.email) IN (
  'leonacquaye73@gmail.com','leonacquaye737@gmail.com','leonforge123@gmail.com','phantomgh12@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE SET plan = 'premium', status = 'active';

-- Update handle_new_user to grant admin automatically on signup for these emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) IN (
    'leonacquaye73@gmail.com','leonacquaye737@gmail.com','leonforge123@gmail.com','phantomgh12@gmail.com'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'premium', 'active')
    ON CONFLICT (user_id) DO UPDATE SET plan = 'premium', status = 'active';
  ELSE
    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
