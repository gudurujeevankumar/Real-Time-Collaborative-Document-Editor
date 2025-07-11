
-- Complete fix for infinite recursion in RLS policies
-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view documents they own or collaborate on" ON public.documents;
DROP POLICY IF EXISTS "Users can create their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update documents they own or have edit permission" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view collaborators for documents they have access to" ON public.document_collaborators;
DROP POLICY IF EXISTS "Document owners can manage collaborators" ON public.document_collaborators;
DROP POLICY IF EXISTS "Users can view activity for documents they have access to" ON public.document_activity;
DROP POLICY IF EXISTS "Users can create activity logs for documents they can edit" ON public.document_activity;

-- Create security definer functions to avoid circular references
CREATE OR REPLACE FUNCTION public.user_can_access_document(document_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = document_id 
    AND (owner_id = user_id OR is_public = true)
  ) OR EXISTS (
    SELECT 1 FROM public.document_collaborators 
    WHERE document_id = document_id AND user_id = user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_edit_document(document_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = document_id AND owner_id = user_id
  ) OR EXISTS (
    SELECT 1 FROM public.document_collaborators 
    WHERE document_id = document_id AND user_id = user_id AND permission = 'edit'
  );
$$;

-- Recreate document policies using security definer functions
CREATE POLICY "Users can view their own documents and public documents" 
  ON public.documents 
  FOR SELECT 
  USING (auth.uid() = owner_id OR is_public = true);

CREATE POLICY "Users can create their own documents" 
  ON public.documents 
  FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own documents" 
  ON public.documents 
  FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own documents" 
  ON public.documents 
  FOR DELETE 
  USING (auth.uid() = owner_id);

-- Recreate collaborator policies
CREATE POLICY "Users can view collaborators for their own documents" 
  ON public.document_collaborators 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id AND owner_id = auth.uid()
    ) OR user_id = auth.uid()
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

-- Recreate activity policies
CREATE POLICY "Users can view activity for accessible documents" 
  ON public.document_activity 
  FOR SELECT 
  USING (public.user_can_access_document(document_id, auth.uid()));

CREATE POLICY "Users can create activity for editable documents" 
  ON public.document_activity 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id AND 
    public.user_can_edit_document(document_id, auth.uid())
  );
