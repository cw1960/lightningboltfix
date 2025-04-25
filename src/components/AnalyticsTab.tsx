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

// Structure for aggregated data
interface AggregatedCount {
    key: string; // Could be error message snippet or provider name
    count: number;
}

interface AnalyticsTabProps {
  session: Session;
  refreshTrigger: number;
}

// --- Constants for Estimated Savings --- 
const ESTIMATED_BOLT_FIX_COST = 0.20; // Estimated cost using Bolt.new default (e.g., Anthropic)
const ESTIMATED_EXTENSION_FIX_COST = 0; // Cost using this extension (e.g., free Gemini Flash)
// Updated savings calculation to reflect the full cost difference
const ESTIMATED_SAVINGS_PER_FIX = ESTIMATED_BOLT_FIX_COST - ESTIMATED_EXTENSION_FIX_COST; // Should now be $0.20

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ session, refreshTrigger }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixCount, setFixCount] = useState<number>(0);
  const [allFetchedFixes, setAllFetchedFixes] = useState<FixRecord[]>([]); // Store all fetched for calculation
  const [topErrors, setTopErrors] = useState<AggregatedCount[]>([]); // State for top errors
  const [llmUsage, setLlmUsage] = useState<AggregatedCount[]>([]); // State for LLM usage

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setLoading(true);
      setError(null);
      setTopErrors([]); // Reset derived state
      setLlmUsage([]); // Reset derived state
      try {
        // Fetch total count
        const { count, error: countError } = await supabase
          .from('fixes')
          .select('*' , { count: 'exact', head: true }) // Use head:true for count only
          .eq('user_id', session.user.id);
        
        if (countError) throw new Error(`Error fetching count: ${countError.message}`);
        const totalFixCount = count ?? 0;
        setFixCount(totalFixCount);

        // Fetch up to last 100 fixes for analysis (if count > 0)
        let fetchedFixes: FixRecord[] = [];
        if (totalFixCount > 0) {
            const { data: fixesData, error: fixesError } = await supabase
            .from('fixes')
            .select('id, created_at, error_message, llm_provider')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(100); // Fetch more for analysis

            if (fixesError) throw new Error(`Error fetching recent fixes: ${fixesError.message}`);
            fetchedFixes = fixesData || [];
        }
        setAllFetchedFixes(fetchedFixes);

        // --- Process Data for Top Errors and LLM Usage ---
        if (fetchedFixes.length > 0) {
            // Calculate Top Errors
            const errorCounts = new Map<string, number>();
            fetchedFixes.forEach(fix => {
                const errorKey = fix.error_message?.split('\n')[0]?.trim() || 'Unknown Error';
                errorCounts.set(errorKey, (errorCounts.get(errorKey) || 0) + 1);
            });
            const sortedErrors = Array.from(errorCounts.entries())
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count);
            setTopErrors(sortedErrors.slice(0, 3)); // Get top 3

            // Calculate LLM Usage
            const providerCounts = new Map<string, number>();
            fetchedFixes.forEach(fix => {
                const providerKey = fix.llm_provider || 'Unknown';
                 // Normalize 'Custom' vs 'custom' if needed, e.g., by lowercasing or specific mapping
                const normalizedProvider = providerKey.toLowerCase() === 'custom' ? 'Custom' : providerKey;
                providerCounts.set(normalizedProvider, (providerCounts.get(normalizedProvider) || 0) + 1);
            });
            const sortedProviders = Array.from(providerCounts.entries())
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count); // Sort by count
            setLlmUsage(sortedProviders);
        }
        // --- End Processing ---

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

  // Calculate total estimated savings
  const totalEstimatedSavings = (fixCount * ESTIMATED_SAVINGS_PER_FIX).toFixed(2); // Format to 2 decimal places
  const recentFixesToDisplay = allFetchedFixes.slice(0, 5); // Slice for display

  return (
    <div className="box">
      <h2>Analytics</h2>

      {loading && <p><span className="loading"></span> Loading analytics...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <>
          {/* Display Total Fixes and Savings */}
          <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '1px solid #555' }}>
            <p style={{ fontSize: '1.1em', marginBottom: '5px' }}>Total Fixes Run: <strong>{fixCount}</strong></p>
            <p style={{ fontSize: '1.1em', marginBottom: '0' }}>Total Estimated Savings: <strong style={{ color: '#4ade80' }}>${totalEstimatedSavings}</strong></p> {/* Highlight savings */}
            <small style={{ color: '#aaa' }}>(Based on estimated $${ESTIMATED_SAVINGS_PER_FIX.toFixed(2)} saved per fix compared to paid alternatives like Bolt.new's default)</small>
          </div>
          
          {/* --- LLM Usage Section --- */} 
          {llmUsage.length > 0 && (
            <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '1px solid #555' }}>
                <h3>LLM Usage:</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {llmUsage.map((usage) => (
                        <li key={usage.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                           <span>{usage.key}:</span>
                           <strong>{usage.count} fix{usage.count === 1 ? '' : 'es'}</strong>
                        </li>
                    ))}
                </ul>
            </div>
          )}

          {/* --- Top Errors Section --- */} 
          {topErrors.length > 0 && (
            <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '1px solid #555' }}>
                <h3>Most Frequent Errors (Top 3):</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {topErrors.map((errorItem) => (
                        <li key={errorItem.key} style={{ marginBottom: '8px' }}>
                           <strong style={{ marginRight: '10px' }}>{errorItem.count}x:</strong>
                           <span style={{ color: '#ccc', display: 'block', fontSize: '0.9em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{errorItem.key}</span> 
                        </li>
                    ))}
                </ul>
            </div>
          )}

          <h3>Recent Fixes (Last 5):</h3>
          {recentFixesToDisplay.length === 0 ? (
            <p>No fixes recorded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {recentFixesToDisplay.map((fix) => (
                <li key={fix.id} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #444' }}>
                  <div>
                    <strong>{new Date(fix.created_at).toLocaleString()}</strong> - 
                    ({fix.llm_provider || 'N/A'}) 
                  </div>
                  <div style={{ margin: '5px 0', fontSize: '0.9em', color: '#ccc' }}>
                    {/* Truncate long error messages */}
                    Error: {fix.error_message ? (fix.error_message.length > 100 ? fix.error_message.substring(0, 97) + '...' : fix.error_message) : 'N/A'}
                  </div>
                  {/* Add estimated savings per fix */}
                  <div style={{ fontSize: '0.9em', color: '#4ade80', marginTop: '5px' }}> {/* Green color for savings */}
                      Est. Savings: ${ESTIMATED_SAVINGS_PER_FIX.toFixed(2)}
                  </div>
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