

import { useState, useEffect } from 'react';
import { Plus, FileText, Users, Clock, MoreVertical, Search, Filter, Grid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Document {
  id: string;
  title: string;
  content: any;
  owner_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  owner_profile?: {
    display_name: string;
  };
}

interface DocumentDashboardProps {
  onDocumentSelect: (documentId: string) => void;
}

export const DocumentDashboard = ({ onDocumentSelect }: DocumentDashboardProps) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated');
  const [filterBy, setFilterBy] = useState<'all' | 'owned' | 'shared' | 'public'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchDocuments();
      setupRealtimeSubscription();
    }
  }, [user, sortBy, filterBy]);

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('documents-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'documents'
      }, () => {
        fetchDocuments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchDocuments = async () => {
    try {
      console.log('Fetching documents for user:', user?.id);
      
      let query = supabase
        .from('documents')
        .select('*');

      // Apply filters
      switch (filterBy) {
        case 'owned':
          query = query.eq('owner_id', user?.id);
          break;
        case 'public':
          query = query.eq('is_public', true);
          break;
        case 'shared':
          // For shared documents, we would need to join with collaborators table
          // For now, showing all accessible documents
          break;
        default:
          // Show all accessible documents (owned + public)
          break;
      }

      // Apply sorting
      const sortColumn = sortBy === 'updated' ? 'updated_at' : 
                        sortBy === 'created' ? 'created_at' : 'title';
      const sortOrder = sortBy === 'title' ? { ascending: true } : { ascending: false };
      
      query = query.order(sortColumn, sortOrder);

      const { data: userDocuments, error: docsError } = await query;

      if (docsError) {
        console.error('Error fetching documents:', docsError);
        throw docsError;
      }

      console.log('Fetched documents:', userDocuments);

      if (!userDocuments || userDocuments.length === 0) {
        setDocuments([]);
        return;
      }

      // Get owner profiles for the documents
      const ownerIds = [...new Set(userDocuments.map(doc => doc.owner_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ownerIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        // Don't throw here, just proceed without profiles
      }

      // Combine documents with owner profiles
      const documentsWithProfiles = userDocuments.map(doc => ({
        ...doc,
        owner_profile: profiles?.find(profile => profile.id === doc.owner_id)
      }));

      setDocuments(documentsWithProfiles);
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      toast({
        title: "Error",
        description: `Failed to load documents: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createDocument = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create documents",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      console.log('Creating document for user:', user.id);
      
      const { data, error } = await supabase
        .from('documents')
        .insert([{
          title: 'Untitled Document',
          owner_id: user.id,
          content: {},
          is_public: false
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating document:', error);
        throw error;
      }

      console.log('Document created:', data);

      // Log the creation activity
      await supabase
        .from('document_activity')
        .insert([{
          document_id: data.id,
          user_id: user.id,
          action: 'created',
          details: { title: data.title }
        }]);

      toast({
        title: "Document created",
        description: "New document has been created successfully.",
      });

      // Navigate to the new document
      onDocumentSelect(data.id);
    } catch (error: any) {
      console.error('Failed to create document:', error);
      toast({
        title: "Error",
        description: `Failed to create document: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      toast({
        title: "Document deleted",
        description: "Document has been deleted successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const duplicateDocument = async (doc: Document) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('documents')
        .insert([{
          title: `${doc.title} (Copy)`,
          owner_id: user.id,
          content: doc.content,
          is_public: false
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Document duplicated",
        description: "Document has been duplicated successfully.",
      });

      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to duplicate document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Collaborative Editor</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {user?.email}
            </span>
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Documents</h2>
            <p className="text-muted-foreground">
              Create and collaborate on documents in real-time
            </p>
          </div>
          <Button 
            onClick={createDocument} 
            disabled={creating}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>{creating ? 'Creating...' : 'New Document'}</span>
          </Button>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
              <SelectTrigger className="w-32">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="owned">Owned</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Last Modified</SelectItem>
                <SelectItem value="created">Date Created</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Documents */}
        {filteredDocuments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No documents found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'Try adjusting your search terms' : 'Create your first document to get started'}
              </p>
              {!searchTerm && (
                <Button onClick={createDocument} disabled={creating}>
                  <Plus className="h-4 w-4 mr-2" />
                  {creating ? 'Creating...' : 'Create Document'}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
            : "space-y-4"
          }>
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1" onClick={() => onDocumentSelect(doc.id)}>
                      <CardTitle className="text-lg line-clamp-1">
                        {doc.title}
                      </CardTitle>
                      <CardDescription className="flex items-center space-x-2 mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(doc.updated_at)}</span>
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onDocumentSelect(doc.id)}>
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateDocument(doc)}>
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {doc.owner_id === user?.id && (
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDocument(doc.id);
                            }}
                            className="text-destructive"
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent onClick={() => onDocumentSelect(doc.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {doc.owner_profile?.display_name || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {doc.is_public && (
                        <Badge variant="secondary">Public</Badge>
                      )}
                      {doc.owner_id === user?.id && (
                        <Badge variant="outline">Owner</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
