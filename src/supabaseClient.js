import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if credentials are placeholders or empty
const isMock = !supabaseUrl || 
               supabaseUrl.includes('your-project-id') || 
               supabaseUrl === '' ||
               !supabaseAnonKey || 
               supabaseAnonKey.includes('your-anon-key-here') || 
               supabaseAnonKey === '';

let supabase = null;
if (!isMock) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error("Failed to initialize Supabase client. Running in Mock Mode.", err);
  }
} else {
  console.log("Supabase credentials not configured or placeholder detected. App is running in Mock Mode.");
}

export { supabase, isMock };
