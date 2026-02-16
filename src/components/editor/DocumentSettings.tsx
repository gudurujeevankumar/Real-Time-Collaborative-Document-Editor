
import { useState, useEffect } from 'react';
import { Settings, Trash2, Download, Save, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DocumentSettingsProps {
  documentId: string;
  title: string;
  isPublic: boolean;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onSettingsChange: (settings: { autoSaveEnabled: boolean; autoSaveInterval: number }) => void;
}

export const DocumentSettings = ({ 
  documentId, 
  title, 
  isPublic, 
  autoSaveEnabled,
  autoSaveInterval,
  onTitleChange, 
  onDelete,
  onSettingsChange
}: DocumentSettingsProps) => {
  const [localTitle, setLocalTitle] = useState(title);
  const [localAutoSaveEnabled, setLocalAutoSaveEnabled] = useState(autoSaveEnabled);
  const [localAutoSaveInterval, setLocalAutoSaveInterval] = useState(autoSaveInterval);
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  useEffect(() => {
    setLocalAutoSaveEnabled(autoSaveEnabled);
    setLocalAutoSaveInterval(autoSaveInterval);
  }, [autoSaveEnabled, autoSaveInterval]);

  const saveSettings = async () => {
    try {
      // Update document title if changed
      if (localTitle !== title) {
        const { error } = await supabase
          .from('documents')
          .update({ title: localTitle })
          .eq('id', documentId);

        if (error) throw error;
        onTitleChange(localTitle);
      }

      // Update auto-save settings
      onSettingsChange({
        autoSaveEnabled: localAutoSaveEnabled,
        autoSaveInterval: localAutoSaveInterval
      });

      toast({
        title: "Settings saved",
        description: "Document settings have been updated",
      });
      
      setIsOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to save settings: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const exportAsJson = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      const exportData = {
        title: data.title,
        content: data.content,
        created_at: data.created_at,
        updated_at: data.updated_at,
        is_public: data.is_public
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.title}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Document exported as JSON",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to export document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const exportAsText = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      // Convert TipTap content to plain text with proper type checking
      let textContent = '';
      if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
        const contentObj = data.content as { [key: string]: any };
        const extractText = (node: any): string => {
          if (node.text) return node.text;
          if (node.content && Array.isArray(node.content)) {
            return node.content.map(extractText).join('');
          }
          return '';
        };
        
        if (contentObj.content && Array.isArray(contentObj.content)) {
          textContent = contentObj.content.map(extractText).join('\n');
        }
      } else if (typeof data.content === 'string') {
        textContent = data.content;
      }

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.title}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Document exported as text file",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to export document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Document Information */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Document Information</h4>
            
            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                placeholder="Document title..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this document..."
                rows={3}
              />
            </div>
          </div>

          <Separator />

          {/* Auto-Save Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Auto-Save Settings
            </h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Enable Auto-Save</Label>
                <div className="text-xs text-muted-foreground">
                  Automatically save changes after a period of inactivity
                </div>
              </div>
              <Switch 
                checked={localAutoSaveEnabled} 
                onCheckedChange={setLocalAutoSaveEnabled} 
              />
            </div>

            {localAutoSaveEnabled && (
              <div className="space-y-2">
                <Label htmlFor="interval">Auto-Save Interval (seconds)</Label>
                <Input
                  id="interval"
                  type="number"
                  min="5"
                  max="300"
                  value={localAutoSaveInterval}
                  onChange={(e) => setLocalAutoSaveInterval(Math.max(5, parseInt(e.target.value) || 10))}
                  placeholder="10"
                />
                <div className="text-xs text-muted-foreground">
                  Changes will be saved automatically after {localAutoSaveInterval} seconds of inactivity
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Export Options */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Export Document</h4>
            
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={exportAsJson} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export as JSON
              </Button>
              
              <Button onClick={exportAsText} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export as Text
              </Button>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <Button onClick={saveSettings} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Document
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete "{title}"
                    and remove all associated data including collaborators and activity logs.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => {
                      onDelete();
                      setIsOpen(false);
                    }} 
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
