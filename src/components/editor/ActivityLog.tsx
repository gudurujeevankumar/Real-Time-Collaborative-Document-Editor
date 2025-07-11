
import { useEffect, useState } from 'react';
import { Clock, Edit, FileText, UserPlus, Share } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface Activity {
  id: string;
  action: string;
  details: any;
  created_at: string;
  user_profile?: {
    display_name: string;
  };
}

interface ActivityLogProps {
  documentId: string;
}

export const ActivityLog = ({ documentId }: ActivityLogProps) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    
    // Set up real-time subscription
    const channel = supabase
      .channel(`activity-${documentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'document_activity',
        filter: `document_id=eq.${documentId}`
      }, () => {
        fetchActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId]);

  const fetchActivities = async () => {
    try {
      console.log('Fetching activities for document:', documentId);
      
      // Get activities for the document
      const { data: activityData, error: activityError } = await supabase
        .from('document_activity')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (activityError) {
        console.error('Error fetching activities:', activityError);
        return;
      }

      console.log('Fetched activities:', activityData);

      if (!activityData || activityData.length === 0) {
        setActivities([]);
        return;
      }

      // Get user profiles for the activities
      const userIds = [...new Set(activityData.map(activity => activity.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        // Don't return, just proceed without profiles
      }

      // Combine activities with user profiles
      const activitiesWithProfiles = activityData.map(activity => ({
        ...activity,
        user_profile: profiles?.find(profile => profile.id === activity.user_id)
      }));

      setActivities(activitiesWithProfiles);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'edited':
        return <Edit className="h-4 w-4" />;
      case 'renamed':
        return <FileText className="h-4 w-4" />;
      case 'shared':
        return <Share className="h-4 w-4" />;
      case 'collaborator_added':
        return <UserPlus className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActivityDescription = (activity: Activity) => {
    switch (activity.action) {
      case 'edited':
        return 'edited the document';
      case 'renamed':
        return `renamed document from "${activity.details?.old_title}" to "${activity.details?.new_title}"`;
      case 'shared':
        return 'shared the document';
      case 'collaborator_added':
        return 'added a collaborator';
      default:
        return activity.action;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] mt-4">
      <div className="space-y-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>No activity yet</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border">
              <div className="flex-shrink-0 mt-0.5">
                {getActivityIcon(activity.action)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-sm">
                    {activity.user_profile?.display_name || 'Unknown User'}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {formatTime(activity.created_at)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {getActivityDescription(activity)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
};
