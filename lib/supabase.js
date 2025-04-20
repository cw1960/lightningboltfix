// Supabase client library
console.log("Supabase.js script loaded");

(function() {
  // Create a global supabase object
  window.supabase = {
    createClient: function(url, key) {
      console.log("Creating Supabase client with URL:", url);
      return {
        auth: {
          signUp: async function(credentials) {
            try {
              console.log("Signing up with credentials:", { email: credentials.email });
              
              const response = await fetch(`${url}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': key,
                  'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify(credentials)
              });
              
              const data = await response.json();
              
              if (!response.ok) {
                console.error("Sign up error:", data);
                return { error: data };
              }
              
              console.log("Sign up successful:", data);
              return { data };
            } catch (error) {
              console.error("Exception during sign up:", error);
              return { error };
            }
          },
          
          signInWithPassword: async function(credentials) {
            try {
              console.log("Signing in with password:", { email: credentials.email });
              
              const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': key,
                  'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify(credentials)
              });
              
              const data = await response.json();
              
              if (!response.ok) {
                console.error("Sign in error:", data);
                return { error: data };
              }
              
              console.log("Sign in successful:", data);
              
              // Store session in localStorage
              localStorage.setItem('supabase.auth.token', JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Date.now() + data.expires_in * 1000
              }));
              
              return { 
                data: {
                  session: {
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_at: Date.now() + data.expires_in * 1000,
                    user: data.user
                  },
                  user: data.user
                }
              };
            } catch (error) {
              console.error("Exception during sign in:", error);
              return { error };
            }
          },
          
          signOut: async function() {
            try {
              console.log("Signing out");
              
              // Get the current session
              const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
              
              if (!session) {
                console.log("No session found, nothing to sign out from");
                return { error: null };
              }
              
              const response = await fetch(`${url}/auth/v1/logout`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': key,
                  'Authorization': `Bearer ${session.access_token}`
                }
              });
              
              // Remove session from localStorage
              localStorage.removeItem('supabase.auth.token');
              
              if (!response.ok) {
                const data = await response.json();
                console.error("Sign out error:", data);
                return { error: data };
              }
              
              console.log("Sign out successful");
              return { error: null };
            } catch (error) {
              console.error("Exception during sign out:", error);
              return { error };
            }
          },
          
          getSession: async function() {
            try {
              console.log("Getting session");
              
              // Get the current session from localStorage
              const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
              
              if (!session) {
                console.log("No session found");
                return { data: { session: null } };
              }
              
              console.log("Session found:", session);
              
              // Check if the session is expired
              if (session.expires_at < Date.now()) {
                console.log("Session expired, refreshing");
                
                // Try to refresh the session
                const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': key,
                    'Authorization': `Bearer ${key}`
                  },
                  body: JSON.stringify({
                    refresh_token: session.refresh_token
                  })
                });
                
                if (!response.ok) {
                  console.error("Session refresh failed");
                  // Session refresh failed, remove the session
                  localStorage.removeItem('supabase.auth.token');
                  return { data: { session: null } };
                }
                
                const data = await response.json();
                console.log("Session refreshed:", data);
                
                // Update the session in localStorage
                const newSession = {
                  access_token: data.access_token,
                  refresh_token: data.refresh_token,
                  expires_at: Date.now() + data.expires_in * 1000
                };
                
                localStorage.setItem('supabase.auth.token', JSON.stringify(newSession));
                
                return { 
                  data: {
                    session: {
                      ...newSession,
                      user: data.user
                    }
                  }
                };
              }
              
              // Session is still valid
              console.log("Session is still valid");
              return { 
                data: {
                  session: {
                    ...session,
                    user: JSON.parse(atob(session.access_token.split('.')[1])).sub
                  }
                }
              };
            } catch (error) {
              console.error("Exception in getSession:", error);
              return { error };
            }
          },
          
          onAuthStateChange: function(callback) {
            console.log("Setting up auth state change listener");
            
            // This is a simplified implementation
            // In a real implementation, this would set up event listeners
            
            // Return an unsubscribe function
            return function() {
              console.log("Unsubscribing from auth state change");
              // Cleanup logic would go here
            };
          }
        },
        
        from: function(table) {
          console.log("Creating query builder for table:", table);
          
          return {
            select: function(columns) {
              console.log("Creating select query for columns:", columns);
              
              return {
                eq: function(column, value) {
                  console.log("Adding equality filter:", column, "=", value);
                  
                  return {
                    single: async function() {
                      try {
                        console.log("Executing single query");
                        
                        const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
                        
                        if (!session) {
                          console.error("Not authenticated");
                          return { error: { message: 'Not authenticated' } };
                        }
                        
                        const response = await fetch(`${url}/rest/v1/${table}?${column}=eq.${value}&select=${columns || '*'}`, {
                          method: 'GET',
                          headers: {
                            'apikey': key,
                            'Authorization': `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json'
                          }
                        });
                        
                        const data = await response.json();
                        
                        if (!response.ok) {
                          console.error("Query error:", data);
                          return { error: data };
                        }
                        
                        console.log("Query result:", data);
                        return { data: data[0] || null };
                      } catch (error) {
                        console.error("Exception in query:", error);
                        return { error };
                      }
                    }
                  };
                }
              };
            },
            
            insert: async function(data) {
              try {
                console.log("Inserting data:", data);
                
                const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
                
                if (!session) {
                  console.error("Not authenticated");
                  return { error: { message: 'Not authenticated' } };
                }
                
                const response = await fetch(`${url}/rest/v1/${table}`, {
                  method: 'POST',
                  headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify(data)
                });
                
                const responseData = await response.json();
                
                if (!response.ok) {
                  console.error("Insert error:", responseData);
                  return { error: responseData };
                }
                
                console.log("Insert successful:", responseData);
                return { data: responseData };
              } catch (error) {
                console.error("Exception in insert:", error);
                return { error };
              }
            },
            
            update: function(data) {
              console.log("Creating update query with data:", data);
              
              return {
                eq: async function(column, value) {
                  try {
                    console.log("Updating where", column, "=", value);
                    
                    const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
                    
                    if (!session) {
                      console.error("Not authenticated");
                      return { error: { message: 'Not authenticated' } };
                    }
                    
                    const response = await fetch(`${url}/rest/v1/${table}?${column}=eq.${value}`, {
                      method: 'PATCH',
                      headers: {
                        'apikey': key,
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                      },
                      body: JSON.stringify(data)
                    });
                    
                    const responseData = await response.json();
                    
                    if (!response.ok) {
                      console.error("Update error:", responseData);
                      return { error: responseData };
                    }
                    
                    console.log("Update successful:", responseData);
                    return { data: responseData };
                  } catch (error) {
                    console.error("Exception in update:", error);
                    return { error };
                  }
                }
              };
            },
            
            upsert: async function(data) {
              try {
                console.log("Upserting data:", data);
                
                const session = JSON.parse(localStorage.getItem('supabase.auth.token'));
                
                if (!session) {
                  console.error("Not authenticated");
                  return { error: { message: 'Not authenticated' } };
                }
                
                const response = await fetch(`${url}/rest/v1/${table}`, {
                  method: 'POST',
                  headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                  },
                  body: JSON.stringify(data)
                });
                
                const responseData = await response.json();
                
                if (!response.ok) {
                  console.error("Upsert error:", responseData);
                  return { error: responseData };
                }
                
                console.log("Upsert successful:", responseData);
                return { data: responseData };
              } catch (error) {
                console.error("Exception in upsert:", error);
                return { error };
              }
            }
          };
        }
      };
    }
  };
  
  console.log("Supabase client library initialized");
})();
