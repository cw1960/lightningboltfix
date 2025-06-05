import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://myqbmklllyhjvasqstbz.supabase.co'
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cWJta2xsbHloanZhc3FzdGJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDc0MTY5MSwiZXhwIjoyMDYwMzE3NjkxfQ.Y5O5BKrzA0MkqZSB5c658QNykint3EQjHp5gHDHLdPk'

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Supabase URL and Service Role Key must be provided.')
}

// Create a Supabase client with the service role key
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Delete a user and their related data
 * @param userId The ID of the user to delete
 * @returns Object containing success status and any error message
 */
export async function deleteUser(userId: string) {
  try {
    // First delete related data from other tables
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.error('Error deleting user profile:', profileError)
      return { success: false, error: 'Failed to delete user profile' }
    }

    // Delete the user from auth.users
    const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (userError) {
      console.error('Error deleting user:', userError)
      return { success: false, error: 'Failed to delete user' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in deleteUser:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
} 