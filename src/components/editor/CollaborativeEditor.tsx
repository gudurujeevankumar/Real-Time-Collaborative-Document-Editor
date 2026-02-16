import { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { ArrowLeft, Save, Users, Activity, Settings, Share, AlertCircle, Edit3, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLog } from './ActivityLog';
import { DocumentShare } from './DocumentShare';
import { DocumentSettings } from './DocumentSettings';
import { RichTextToolbar } from './RichTextToolbar';

interface Document {
  id: string;
  title: string;
  content: any;
  owner_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface CollaborativeEditorProps {
  documentId: string;
  onBack: () => void;
}

export const CollaborativeEditor = ({ documentId, onBack }: CollaborativeEditorProps) => {
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState(10);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Color.configure({
        types: ['textStyle'],
      }),
      TextStyle,
      FontFamily,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-4',
      },
    },
    onUpdate: ({ editor }) => {
      setHasUnsavedChanges(true);
    },
  });

  // Keyboard shortcut for save (Ctrl+S or Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (hasUnsavedChanges) {
          saveDocument();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        event.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveEnabled && hasUnsavedChanges && !saving) {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      
      const timer = setTimeout(() => {
        saveDocument();
      }, autoSaveInterval * 1000);
      
      setAutoSaveTimer(timer);
    }

    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
    };
  }, [hasUnsavedChanges, autoSaveEnabled, autoSaveInterval, saving]);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
      fetchCollaborators();
    }
  }, [documentId]);

  useEffect(() => {
    // Set up real-time subscriptions
    if (documentId) {
      const channel = supabase
        .channel(`document-${documentId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `id=eq.${documentId}`
        }, handleDocumentChange)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'document_collaborators',
          filter: `document_id=eq.${documentId}`
        }, handleCollaboratorsChange)
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [documentId]);

  const fetchDocument = async () => {
    try {
      console.log('Fetching document:', documentId);
      
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        console.error('Error fetching document:', error);
        throw error;
      }

      console.log('Fetched document:', data);
      setDocument(data);
      setTitle(data.title);
      
      if (editor && data.content) {
        // Handle different content formats with proper type checking
        if (typeof data.content === 'string') {
          editor.commands.setContent(data.content);
        } else if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
          // Check if it's a TipTap JSON object
          const contentObj = data.content as { [key: string]: any };
          if (contentObj.type || contentObj.content) {
            editor.commands.setContent(data.content);
          } else {
            // Convert object to string as fallback
            editor.commands.setContent(JSON.stringify(data.content));
          }
        } else if (Array.isArray(data.content)) {
          // Handle array content
          editor.commands.setContent(JSON.stringify(data.content));
        } else {
          // Fallback for null or other types
          editor.commands.setContent('');
        }
      }
      
      // Reset unsaved changes flag after loading
      setHasUnsavedChanges(false);
    } catch (error: any) {
      console.error('Failed to load document:', error);
      toast({
        title: "Error",
        description: `Failed to load document: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCollaborators = async () => {
    try {
      // Get collaborators for the document
      const { data: collabData, error: collabError } = await supabase
        .from('document_collaborators')
        .select('*')
        .eq('document_id', documentId);

      if (collabError) {
        console.error('Error fetching collaborators:', collabError);
        return;
      }

      // Get profiles for the collaborators
      const userIds = collabData?.map(collab => collab.user_id) || [];
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          return;
        }

        // Combine collaborators with profiles
        const collaboratorsWithProfiles = collabData?.map(collab => ({
          ...collab,
          profile: profiles?.find(profile => profile.id === collab.user_id)
        })) || [];

        setCollaborators(collaboratorsWithProfiles);
      } else {
        setCollaborators([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch collaborators:', error);
    }
  };

  const handleDocumentChange = useCallback((payload: any) => {
    if (payload.new && payload.new.id === documentId) {
      setDocument(payload.new);
      setTitle(payload.new.title);
      
      // Only update editor content if it's from another user
      if (editor && payload.new.content && payload.new.updated_at !== lastSaved?.toISOString()) {
        if (typeof payload.new.content === 'string') {
          editor.commands.setContent(payload.new.content);
        } else if (payload.new.content && typeof payload.new.content === 'object' && !Array.isArray(payload.new.content)) {
          const contentObj = payload.new.content as { [key: string]: any };
          if (contentObj.type || contentObj.content) {
            editor.commands.setContent(payload.new.content);
          } else {
            editor.commands.setContent(JSON.stringify(payload.new.content));
          }
        } else {
          editor.commands.setContent(JSON.stringify(payload.new.content || ''));
        }
      }
    }
  }, [documentId, editor, lastSaved]);

  const handleCollaboratorsChange = useCallback(() => {
    fetchCollaborators();
  }, []);

  const saveDocument = async () => {
    if (!editor || !document || saving || !user) return;

    setSaving(true);
    try {
      const content = editor.getJSON();
      const now = new Date();

      console.log('Saving document with content:', content);

      const { error } = await supabase
        .from('documents')
        .update({
          title,
          content,
          updated_at: now.toISOString()
        })
        .eq('id', documentId);

      if (error) {
        console.error('Error saving document:', error);
        throw error;
      }

      // Log the activity
      await supabase
        .from('document_activity')
        .insert([{
          document_id: documentId,
          user_id: user.id,
          action: 'edited',
          details: { type: 'content_update' }
        }]);

      setLastSaved(now);
      setHasUnsavedChanges(false);
      toast({
        title: "Saved",
        description: "Document saved successfully",
      });
    } catch (error: any) {
      console.error('Failed to save document:', error);
      toast({
        title: "Error",
        description: `Failed to save document: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateTitle = async (newTitle: string) => {
    if (!document || !user || !newTitle.trim()) return;

    try {
      const trimmedTitle = newTitle.trim();
      
      const { error } = await supabase
        .from('documents')
        .update({ title: trimmedTitle })
        .eq('id', documentId);

      if (error) throw error;

      await supabase
        .from('document_activity')
        .insert([{
          document_id: documentId,
          user_id: user.id,
          action: 'renamed',
          details: { old_title: title, new_title: trimmedTitle }
        }]);

      setTitle(trimmedTitle);
      setIsEditingTitle(false);
      
      toast({
        title: "Title updated",
        description: "Document title has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to update title: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleTitleEdit = () => {
    setTempTitle(title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (tempTitle.trim() && tempTitle !== title) {
      updateTitle(tempTitle);
    } else {
      setIsEditingTitle(false);
    }
  };

  const handleTitleCancel = () => {
    setTempTitle(title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      toast({
        title: "Document deleted",
        description: "Document has been deleted successfully",
      });

      onBack();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handlePublicToggle = (isPublic: boolean) => {
    if (document) {
      setDocument({ ...document, is_public: isPublic });
    }
  };

  const handleSettingsChange = (settings: {
    autoSaveEnabled: boolean;
    autoSaveInterval: number;
  }) => {
    setAutoSaveEnabled(settings.autoSaveEnabled);
    setAutoSaveInterval(settings.autoSaveInterval);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading document...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Document not found</h2>
          <p className="text-muted-foreground mb-4">The document you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            {/* Editable Title */}
            <div className="flex items-center space-x-2">
              {isEditingTitle ? (
                <div className="flex items-center space-x-2">
                  <Input
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    className="text-lg font-semibold"
                    placeholder="Document title..."
                    autoFocus
                  />
                  <Button size="sm" onClick={handleTitleSave}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleTitleCancel}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-semibold cursor-pointer hover:bg-muted px-2 py-1 rounded" onClick={handleTitleEdit}>
                    {title}
                  </h1>
                  <Button variant="ghost" size="sm" onClick={handleTitleEdit}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Unsaved changes
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Collaborators */}
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="flex -space-x-2">
                {collaborators.slice(0, 3).map((collab, index) => (
                  <div
                    key={collab.id}
                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium border-2 border-background"
                    title={collab.profile?.display_name}
                  >
                    {collab.profile?.display_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                ))}
                {collaborators.length > 3 && (
                  <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium border-2 border-background">
                    +{collaborators.length - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Save button */}
            <Button 
              onClick={saveDocument} 
              disabled={saving || !hasUnsavedChanges} 
              size="sm"
              variant={hasUnsavedChanges ? "default" : "outline"}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>

            {/* Auto-save status */}
            <div className="flex items-center space-x-2">
              {saving ? (
                <Badge variant="secondary">Saving...</Badge>
              ) : lastSaved ? (
                <Badge variant="outline">
                  Saved {lastSaved.toLocaleTimeString()}
                </Badge>
              ) : null}
            </div>

            {/* Actions */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Activity className="h-4 w-4 mr-2" />
                  Activity
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Document Activity</SheetTitle>
                </SheetHeader>
                <ActivityLog documentId={documentId} />
              </SheetContent>
            </Sheet>

            <DocumentShare 
              documentId={documentId} 
              isPublic={document.is_public} 
              onPublicToggle={handlePublicToggle}
            />

            <DocumentSettings
              documentId={documentId}
              title={title}
              isPublic={document.is_public}
              autoSaveEnabled={autoSaveEnabled}
              autoSaveInterval={autoSaveInterval}
              onTitleChange={setTitle}
              onDelete={handleDelete}
              onSettingsChange={handleSettingsChange}
            />
          </div>
        </div>
      </header>

      {/* Rich Text Toolbar */}
      <RichTextToolbar editor={editor} />

      {/* Editor */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-0">
            <style>{`
              .ProseMirror [style*="font-size"] {
                font-size: inherit !important;
              }
              .ProseMirror *[data-font-size] {
                font-size: var(--font-size) !important;
              }
            `}</style>
            <EditorContent editor={editor} />
          </CardContent>
        </Card>
      </main>

      {/* Save Status Footer */}
      <footer className="fixed bottom-4 right-4 z-10">
        <div className="bg-background/80 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            {saving ? (
              <>
                <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-muted-foreground">Saving...</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">Unsaved changes</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">
                  All changes saved
                  {lastSaved && (
                    <span className="ml-1">
                      at {lastSaved.toLocaleTimeString()}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
