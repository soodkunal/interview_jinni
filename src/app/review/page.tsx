'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Type for a pending request
// We use a complex select query to get job and user info
type PendingRequest = {
  id: number // request id
  created_at: string
  session_id: number
  mock_interview_sessions: {
    recording_url: string | null
    questions_asked: any[] | null
  } | null
  users: {
    full_name: string | null
    email: string | null
  } | null // This is the requester
}

export default function ReviewHubPage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPendingRequests = async () => {
      setLoading(true)
      
      // 1. Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      // 2. Get their public profile to find their bigint 'id'
      const { data: publicProfile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (profileError || !publicProfile) {
        console.error('Error fetching profile:', profileError)
        setError('Could not load your user profile.')
        setLoading(false); return
      }
      
      // 3. Fetch all pending requests *not* from the current user
      const { data: requestData, error: requestError } = await supabase
        .from('peer_review_requests')
        .select(`
          id,
          created_at,
          session_id,
          mock_interview_sessions:session_id ( recording_url, questions_asked ),
          users:requester_id ( full_name, email )
        `)
        .eq('status', 'pending') // Only get pending requests
        .not('requester_id', 'eq', publicProfile.id) // Don't show your own requests
        .order('created_at', { ascending: true }) // Show oldest first

      if (requestError) {
        console.error('Error fetching requests:', requestError)
        setError('Could not load pending requests.')
      } else if (requestData) {
        setRequests(requestData as PendingRequest[])
      }
      setLoading(false)
    }

    fetchPendingRequests()
  }, [supabase, router])

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center p-8">Loading requests...</div>
    }
    
    if (error) {
      return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
    }

    if (requests.length === 0) {
      return (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <h2 className="text-xl font-medium text-gray-700">No Pending Reviews</h2>
          <p className="text-gray-500 mt-2">
            Looks like you're all caught up! There are no pending peer reviews from other students.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {requests.map((request) => {
          const session = request.mock_interview_sessions
          const requester = request.users
          
          return (
            <a 
              key={request.id}
              href={`/review/${request.id}`} // <-- Will link to the review page
              className="block p-4 bg-white shadow-md rounded-lg hover:bg-gray-50 transition-colors"
            >
              <p className="text-lg font-semibold text-gray-800">
                Review Request from {requester?.full_name || 'Anonymous'}
              </p>
              <div className="text-sm text-gray-500 mt-2 flex space-x-4">
                <span>
                  Submitted: {new Date(request.created_at).toLocaleDateString()}
                </span>
                <span>
                  Type: {session?.recording_url ? 'Audio' : 'Text'}
                </span>
                <span>
                  Questions: {session?.questions_asked?.length || 0}
                </span>
              </div>
            </a>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Peer Review Hub</h1>
        <p className="text-gray-600 mb-6">
          Help your peers! Select a pending request to submit your feedback.
        </p>
        {renderContent()}
      </div>
    </div>
  )
}