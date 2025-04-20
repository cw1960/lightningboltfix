import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

// Define structure for a fix record
interface FixRecord {
  id: string;
  created_at: string;
  error_message: string | null;
  llm_provider: string | null;
  // Add other fields if needed for display
}

interface AnalyticsTabProps {
  session: Session;
  refreshTrigger: number;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ session, refreshTrigger }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixCount, setFixCount] = useState<number>(0);
  const [recentFixes, setRecentFixes] = useState<FixRecord[]>([]);

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch total count
        const { count, error: countError } = await supabase
          .from('fixes')
          .select('*' , { count: 'exact', head: true }) // Use head:true for count only
          .eq('user_id', session.user.id);
        
        if (countError) throw new Error(`Error fetching count: ${countError.message}`);
        setFixCount(count ?? 0);

        // Fetch recent 5 fixes
        const { data: fixesData, error: fixesError } = await supabase
          .from('fixes')
          .select('id, created_at, error_message, llm_provider')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (fixesError) throw new Error(`Error fetching recent fixes: ${fixesError.message}`);
        setRecentFixes(fixesData || []);

      } catch (err: any) {
        console.error('Error fetching analytics data:', err);
        setError('Failed to load analytics data.');
      } finally {
        setLoading(false);
      }
    };
    console.log("AnalyticsTab: Fetching data due to session/trigger change.");
    fetchAnalyticsData();
  }, [session.user.id, refreshTrigger]);

  return (
    <div className="box">
      <h2>Analytics</h2>

      {loading && <p><span className="loading"></span> Loading analytics...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <>
          <h3>Total Fixes Run: {fixCount}</h3>

          <h3 style={{ marginTop: '20px' }}>Recent Fixes:</h3>
          {recentFixes.length === 0 ? (
            <p>No fixes recorded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {recentFixes.map((fix) => (
                <li key={fix.id} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #444' }}>
                  <strong>{new Date(fix.created_at).toLocaleString()}</strong> - 
                  ({fix.llm_provider || 'N/A'}) 
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', color: '#ccc' }}>
                    {/* Truncate long error messages */} 
                    Error: {fix.error_message ? (fix.error_message.length > 100 ? fix.error_message.substring(0, 97) + '...' : fix.error_message) : 'N/A'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default AnalyticsTab; 