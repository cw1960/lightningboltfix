import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://myqbmklllyhjvasqstbz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cWJta2xsbHloanZhc3FzdGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3NDE2OTAsImV4cCI6MjA2MDMxNzY5MH0.epcZM5t5oFKg-u03kqafwXdeiMKQs_32qTsuejd8zr0'

// Basic check to ensure environment variables are loaded (though we are using constants here)
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be provided.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 