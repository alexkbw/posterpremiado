
-- Roles enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payment status enum
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed');

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  transaction_id TEXT,
  week_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Draws table
CREATE TABLE public.draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date TIMESTAMPTZ NOT NULL,
  total_pot NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_cut NUMERIC(10,2) NOT NULL DEFAULT 0,
  prize_pool NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view draws" ON public.draws FOR SELECT USING (true);
CREATE POLICY "Admins can manage draws" ON public.draws FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update draws" ON public.draws FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Draw participants / winners
CREATE TABLE public.draw_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  prize_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draw_id, user_id)
);
ALTER TABLE public.draw_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own participation" ON public.draw_participants FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage participants" ON public.draw_participants FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update participants" ON public.draw_participants FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Promotions / campaigns
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promotions" ON public.promotions FOR SELECT USING (true);
CREATE POLICY "Admins can manage promotions" ON public.promotions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update promotions" ON public.promotions FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete promotions" ON public.promotions FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Public chat messages
CREATE TABLE public.public_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.public_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view public chat" ON public.public_chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can send public chat" ON public.public_chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Private chat messages (user <-> admin)
CREATE TABLE public.private_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.private_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own private messages" ON public.private_chat_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can send private messages" ON public.private_chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can mark own messages read" ON public.private_chat_messages FOR UPDATE USING (auth.uid() = receiver_id OR public.has_role(auth.uid(), 'admin'));

-- Enable realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_chat_messages;

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
