
import { useState } from 'react';
import { Share, Copy, Mail, Link, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DocumentShareProps {
  documentId: string;
  isPublic: boolean;
  onPublicToggle: (isPublic: boolean) => void;
}

export const DocumentShare = ({ documentId, isPublic, onPublicToggle }: DocumentShareProps) => {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [isInviting, setIsInviting] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const { toast } = useToast();

  const shareUrl = `${window.location.origin}/?doc=${documentId}`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const inviteCollaborator = async () => {
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);
    try {
      // First, check if user exists
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('id', `%${email}%`); // This is a simplified check - in reality you'd need email in profiles

      if (profileError) throw profileError;

      // For demo purposes, we'll simulate adding a collaborator
      // In a real app, you'd send an invitation email
      toast({
        title: "Invitation sent!",
        description: `Invitation sent to ${email}`,
      });
      setEmail('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to send invitation: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const togglePublic = async () => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ is_public: !isPublic })
        .eq('id', documentId);

      if (error) throw error;

      onPublicToggle(!isPublic);
      toast({
        title: "Updated",
        description: `Document is now ${!isPublic ? 'public' : 'private'}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to update visibility: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Public/Private Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Public Access</Label>
              <div className="text-sm text-muted-foreground">
                Anyone on the internet can view this document
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={togglePublic} />
          </div>

          {/* Share Link */}
          <div className="space-y-2">
            <Label>Share Link</Label>
            <div className="flex">
              <Input
                value={shareUrl}
                readOnly
                className="rounded-r-none"
              />
              <Button
                onClick={() => copyToClipboard(shareUrl)}
                className="rounded-l-none"
                variant="outline"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Invite Collaborators */}
          <div className="space-y-2">
            <Label>Invite People</Label>
            <div className="flex space-x-2">
              <Input
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && inviteCollaborator()}
              />
              <Select value={permission} onValueChange={(value: 'view' | 'edit') => setPermission(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={inviteCollaborator} disabled={isInviting}>
                {isInviting ? 'Sending...' : 'Invite'}
              </Button>
            </div>
          </div>

          {/* Access Level Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Access Level
              </span>
              <Badge variant={isPublic ? 'default' : 'secondary'}>
                {isPublic ? 'Public' : 'Private'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPublic 
                ? 'Anyone with the link can view this document'
                : 'Only invited people can access this document'
              }
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
