
-- Fix the infinite recursion in document_collaborators policies
-- Drop the problematic policies first
DROP POLICY IF EXISTS "Users can view collaborators for documents they have access to" ON public.document_collaborators;
DROP POLICY IF EXISTS "Users can view activity for documents they have access to" ON public.document_activity;
DROP POLICY IF EXISTS "Users can create activity logs for documents they can edit" ON public.document_activity;
DROP POLICY IF EXISTS "Users can update documents they own or have edit permission" ON public.documents;
DROP POLICY IF EXISTS "Users can view documents they own or collaborate on" ON public.documents;

-- Recreate the policies without circular references
-- Document policies
CREATE POLICY "Users can view documents they own or collaborate on" 
  ON public.documents 
  FOR SELECT 
  USING (
    auth.uid() = owner_id OR 
    is_public = true OR
    id IN (
      SELECT document_id FROM public.document_collaborators 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents they own or have edit permission" 
  ON public.documents 
  FOR UPDATE 
  USING (
    auth.uid() = owner_id OR 
    id IN (
      SELECT document_id FROM public.document_collaborators 
      WHERE user_id = auth.uid() AND permission = 'edit'
    )
  );

-- Document collaborators policies (simplified to avoid recursion)
CREATE POLICY "Users can view collaborators for documents they have access to" 
  ON public.document_collaborators 
  FOR SELECT 
  USING (
    document_id IN (
      SELECT id FROM public.documents 
      WHERE owner_id = auth.uid()
    ) OR
    user_id = auth.uid()
  );

-- Document activity policies (simplified)
CREATE POLICY "Users can view activity for documents they have access to" 
  ON public.document_activity 
  FOR SELECT 
  USING (
    document_id IN (
      SELECT id FROM public.documents 
      WHERE owner_id = auth.uid() OR is_public = true
    ) OR
    document_id IN (
      SELECT document_id FROM public.document_collaborators 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create activity logs for documents they can edit" 
  ON public.document_activity 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id AND (
      document_id IN (
        SELECT id FROM public.documents 
        WHERE owner_id = auth.uid()
      ) OR
      document_id IN (
        SELECT document_id FROM public.document_collaborators 
        WHERE user_id = auth.uid() AND permission = 'edit'
      )
    )
  );
