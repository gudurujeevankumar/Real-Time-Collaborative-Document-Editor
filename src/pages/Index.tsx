
import { useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/auth/AuthForm';
import { DocumentDashboard } from '@/components/dashboard/DocumentDashboard';
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor';

const AppContent = () => {
  const { user, loading } = useAuth();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  if (selectedDocumentId) {
    return (
      <CollaborativeEditor
        documentId={selectedDocumentId}
        onBack={() => setSelectedDocumentId(null)}
      />
    );
  }

  return (
    <DocumentDashboard
      onDocumentSelect={setSelectedDocumentId}
    />
  );
};

const Index = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default Index;
