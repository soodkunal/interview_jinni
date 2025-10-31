'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

// Type for a pending request
type PendingRequest = {
  id: number // request id
  created_at: string
  session_id: number
  mock_interview_sessions: { 
    recording_url: string | null
    questions_asked: any[] | null
  }[] | null // Correct Type: Array of Session Objects
  users: {
    full_name: string | null
    email: string | null
  }[] | null // Correct Type: Array of User Objects
}

// Type for the session data we are interested in for rendering
type SessionRenderData = {
  recording_url: string | null
  questions_asked: any[] | null
}


// Safely gets the single session object from the array returned by the join
const getSessionForRender = (request: PendingRequest): SessionRenderData | null => {
  if (request.mock_interview_sessions && request.mock_interview_sessions.length > 0) {
    return request.mock_interview_sessions[0];
  }
  return null;
}
// -------------------------------------------------------------------


export default function ReviewHubPage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- SEARCH STATE ---
  const [searchId, setSearchId] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchedRequest, setSearchedRequest] = useState<PendingRequest | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  // ------------------------

  const fetchPendingRequests = useCallback(async (myUserId: number) => {
    setLoading(true)
    setRequests([])
    setSearchedRequest(null) 
    
    // 3. Fetch all pending requests *not* from the current user (SINGLE LINE QUERY)
    const { data: requestData, error: requestError } = await supabase
      .from('peer_review_requests')
      .select(`id, created_at, session_id, mock_interview_sessions:session_id ( recording_url, questions_asked ), users:requester_id ( full_name, email )`)
      .eq('status', 'pending')
      .not('requester_id', 'eq', myUserId) 
      .order('created_at', { ascending: true })

    if (requestError) {
      console.error('Error fetching requests:', requestError)
      setError('Could not load pending requests.')
    } else if (requestData) {
      setRequests(requestData as PendingRequest[]) 
    }
    setLoading(false)
  }, [supabase])
  
  // --- Search Logic (Single Line Query) ---
  const handleSearch = async () => {
    setSearchedRequest(null)
    setSearchError(null)
    setIsSearching(true)
    
    const id = parseInt(searchId.trim())
    if (isNaN(id) || id <= 0) {
      setSearchError('Please enter a valid numeric User ID.')
      setIsSearching(false);
      return
    }
    
    if (id === currentUserId) {
        setSearchError("You cannot review your own sessions.");
        setIsSearching(false);
        return
    }

    // Fetch a pending request made by the user ID (SINGLE LINE QUERY)
    const { data: requestData, error: requestError } = await supabase
      .from('peer_review_requests')
      .select(`id, created_at, session_id, mock_interview_sessions:session_id ( recording_url, questions_asked ), users:requester_id ( full_name, email )`)
      .eq('requester_id', id)
      .eq('status', 'pending')
      .limit(1)
      .single() 

    if (requestError || !requestData) {
      setSearchError(`User ID ${id} found, but they have no pending review requests or you lack permission to see them.`);
    } else {
      setSearchedRequest(requestData as PendingRequest); // This line is now safe
    }
    setIsSearching(false)
  }

  // --- useEffect to load user and initial list (Unchanged) ---
  useEffect(() => {
    const setupPage = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      const { data: publicProfile } = await supabase
        .from('users').select('id').eq('auth_id', user.id).single()
      
      if (!publicProfile) { return }
      
      setCurrentUserId(publicProfile.id)
      await fetchPendingRequests(publicProfile.id)
    }

    setupPage()
  }, [supabase, router, fetchPendingRequests])

  const renderContent = () => {
    // --- Get single session object from the array for rendering ---
    const getSessionForRender = (request: PendingRequest): SessionRenderData | null => {
      if (request.mock_interview_sessions && request.mock_interview_sessions.length > 0) {
        return request.mock_interview_sessions[0];
      }
      return null;
    }
    
    // If a specific search result is active, show only that
    if (searchedRequest) {
      const request = searchedRequest
      const session = getSessionForRender(request)
      // FIX: Safely access user data from the array
      const requester = request.users ? request.users[0] : null
      
      if (!session) return <p className="text-red-500 mt-4">Session data is missing for this request.</p>

      return (
        <div className="space-y-4">
            <h2 className="text-xl font-heading font-semibold text-climby-700">Search Result</h2>
            <a 
              key={request.id}
              href={`/review/${request.id}`}
              className="block p-4 bg-white shadow-md rounded-lg hover:bg-climby-50 transition-colors border-2 border-climby-500"
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
              <p className="mt-2 text-sm text-climby-600 font-medium">Click to start review</p>
            </a>
            <button 
                onClick={() => setSearchedRequest(null)}
                className="text-gray-500 text-sm hover:underline mt-4"
            >
                &larr; View full list
            </button>
        </div>
      )
    }


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

    // Render Full List
    return (
      <div className="space-y-4">
        {requests.map((request) => {
          const session = getSessionForRender(request)
          const requester = request.users ? request.users[0] : null
          
          return (
            <a 
              key={request.id}
              href={`/review/${request.id}`}
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
        <h1 className="text-3xl font-bold font-heading mb-6">Peer Review Hub</h1>
        <p className="text-gray-600 mb-6">
          Help your peers! Select a pending request to submit your feedback, or search by User ID.
        </p>
        
        {/* --- NEW SEARCH INPUT --- */}
        <div className="mb-8 p-4 bg-white shadow-md rounded-lg">
          <h2 className="text-xl font-heading font-semibold mb-2">Search by Requester ID</h2>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter Requester's User ID (e.g., 1001)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-grow p-2 border rounded-md text-black"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-white text-climby-600 border border-climby-500 py-2 px-4 rounded-md hover:bg-climby-50 disabled:bg-gray-400 disabled:text-white"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
          {searchError && <p className="text-red-500 mt-2 text-sm">{searchError}</p>}
        </div>
        {/* ------------------------ */}
        
        {renderContent()}
      </div>
    </div>
  )
}