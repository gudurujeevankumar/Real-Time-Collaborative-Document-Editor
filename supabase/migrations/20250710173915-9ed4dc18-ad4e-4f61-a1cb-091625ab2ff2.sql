-- This project is now in supabase with login of my first ever mail i created 

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content JSONB DEFAULT '{}',
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create document collaborators table for sharing permissions
CREATE TABLE public.document_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission TEXT CHECK (permission IN ('view', 'edit')) DEFAULT 'view',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id)
);

-- Create document activity log
CREATE TABLE public.document_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user profiles table for storing display names and avatars
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY "Users can view documents they own or collaborate on" 
  ON public.documents 
  FOR SELECT 
  USING (
    auth.uid() = owner_id OR 
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_id = id AND user_id = auth.uid()
    ) OR
    is_public = true
  );

CREATE POLICY "Users can create their own documents" 
  ON public.documents 
  FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update documents they own or have edit permission" 
  ON public.documents 
  FOR UPDATE 
  USING (
    auth.uid() = owner_id OR 
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_id = id AND user_id = auth.uid() AND permission = 'edit'
    )
  );

CREATE POLICY "Users can delete their own documents" 
  ON public.documents 
  FOR DELETE 
  USING (auth.uid() = owner_id);

-- RLS Policies for document_collaborators
CREATE POLICY "Users can view collaborators for documents they have access to" 
  ON public.document_collaborators 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id AND (
        owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM public.document_collaborators dc 
          WHERE dc.document_id = id AND dc.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Document owners can manage collaborators" 
  ON public.document_collaborators 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id AND owner_id = auth.uid()
    )
  );

-- RLS Policies for document_activity
CREATE POLICY "Users can view activity for documents they have access to" 
  ON public.document_activity 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id AND (
        owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM public.document_collaborators 
          WHERE document_id = id AND user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create activity logs for documents they can edit" 
  ON public.document_activity 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id AND (
        owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM public.document_collaborators 
          WHERE document_id = id AND user_id = auth.uid() AND permission = 'edit'
        )
      )
    )
  );

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone" 
  ON public.profiles 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles 
  FOR ALL 
  USING (auth.uid() = id);

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for collaborative features
ALTER TABLE public.documents REPLICA IDENTITY FULL;
ALTER TABLE public.document_collaborators REPLICA IDENTITY FULL;
ALTER TABLE public.document_activity REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_activity;

-- Create function to update document timestamp
CREATE OR REPLACE FUNCTION public.update_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_document_updated_at();
