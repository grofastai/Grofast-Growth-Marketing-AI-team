export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: { id: string; name: string; slug: string; plan: string; created_at: string }
        Insert: { id?: string; name: string; slug: string; plan?: string; created_at?: string }
        Update: { id?: string; name?: string; slug?: string; plan?: string; created_at?: string }
        Relationships: []
      }
      departments: {
        Row: { id: string; company_id: string; name: string; created_at: string }
        Insert: { id?: string; company_id: string; name: string; created_at?: string }
        Update: { id?: string; company_id?: string; name?: string; created_at?: string }
        Relationships: []
      }
      users: {
        Row: {
          id: string; company_id: string; department_id: string | null
          employee_id: string; role: 'ADMIN' | 'MEMBER'; name: string
          email: string | null; phone: string | null
          status: 'active' | 'inactive'; created_at: string
        }
        Insert: {
          id: string; company_id: string; department_id?: string | null
          employee_id: string; role: 'ADMIN' | 'MEMBER'; name: string
          email?: string | null; phone?: string | null
          status?: 'active' | 'inactive'; created_at?: string
        }
        Update: {
          company_id?: string; department_id?: string | null; employee_id?: string
          role?: 'ADMIN' | 'MEMBER'; name?: string; email?: string | null
          phone?: string | null; status?: 'active' | 'inactive'; created_at?: string
        }
        Relationships: []
      }
      daily_updates: {
        Row: {
          id: string; company_id: string; user_id: string; date: string
          attendance_status: 'present' | 'absent' | 'holiday' | 'outside'
          work_type: 'office' | 'outside' | 'wfh' | null
          working_hours: number | null; learning_hours: number
          shoot_count: number; notes: string | null; created_at: string
        }
        Insert: {
          id?: string; company_id: string; user_id: string; date?: string
          attendance_status?: 'present' | 'absent' | 'holiday' | 'outside'
          work_type?: 'office' | 'outside' | 'wfh' | null
          working_hours?: number | null; learning_hours?: number
          shoot_count?: number; notes?: string | null; created_at?: string
        }
        Update: {
          company_id?: string; user_id?: string; date?: string
          attendance_status?: 'present' | 'absent' | 'holiday' | 'outside'
          work_type?: 'office' | 'outside' | 'wfh' | null
          working_hours?: number | null; learning_hours?: number
          shoot_count?: number; notes?: string | null
        }
        Relationships: []
      }
      shoot_entries: {
        Row: {
          id: string; company_id: string; user_id: string; daily_update_id: string
          client_name: string; shoot_type: string; video_count: number
          notes: string | null; created_at: string
        }
        Insert: {
          id?: string; company_id: string; user_id: string; daily_update_id: string
          client_name: string; shoot_type: string; video_count?: number
          notes?: string | null; created_at?: string
        }
        Update: {
          client_name?: string; shoot_type?: string; video_count?: number; notes?: string | null
        }
        Relationships: []
      }
      editing_entries: {
        Row: {
          id: string; company_id: string; user_id: string; daily_update_id: string
          client_name: string; editing_hours: number; folder_link: string | null; created_at: string
        }
        Insert: {
          id?: string; company_id: string; user_id: string; daily_update_id: string
          client_name: string; editing_hours: number; folder_link?: string | null; created_at?: string
        }
        Update: {
          client_name?: string; editing_hours?: number; folder_link?: string | null
        }
        Relationships: []
      }
      leaves: {
        Row: {
          id: string; company_id: string; user_id: string
          from_date: string; to_date: string; reason: string
          status: 'pending' | 'approved' | 'rejected'; created_at: string
        }
        Insert: {
          id?: string; company_id: string; user_id: string
          from_date: string; to_date: string; reason: string
          status?: 'pending' | 'approved' | 'rejected'; created_at?: string
        }
        Update: {
          from_date?: string; to_date?: string; reason?: string
          status?: 'pending' | 'approved' | 'rejected'
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
