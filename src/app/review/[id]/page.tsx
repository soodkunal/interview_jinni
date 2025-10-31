'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

// Type for the reviewer's profile
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}

// Type for the session data we're reviewing
type SessionToReview = {
  id: number
  recording_url: string | null
  questions_asked: any[] | null
  typed_answers: Record<number, string> | null
}

// Type for the request
type ReviewRequest = {
  id: number // request id
  session_id: number
  users: { // The requester
    full_name: string | null
  } | null
  mock_interview_sessions: SessionToReview | null
}

export default function ReviewDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const { id } = params // This is the 'id' of the peer_review_request

  const [request, setRequest] = useState<ReviewRequest | null>(null)
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null) // For the secure URL
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Form State ---
  const [peerScore, setPeerScore] = useState(8) // Default score
  const [peerComments, setPeerComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return

    const fetchRequestDetails = async () => {
      setLoading(true)
      
      // 1. Get the current user (the reviewer)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }
      const { data: publicProfile, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()

      if (profileError || !publicProfile) {
        setError('Could not load your user profile.'); setLoading(false); return
      }
      setProfile(publicProfile)

      // 2. Fetch the review request and the session data
      const { data: requestData, error: requestError } = await supabase
        .from('peer_review_requests')
        .select(`
          id,
          session_id,
          users:requester_id ( full_name ),
          mock_interview_sessions:session_id ( * )
        `)
        .eq('id', id)
        .eq('status', 'pending') // Only load pending requests
        .single()
        
      if (requestError || !requestData) {
        setError('Could not find this review request.'); setLoading(false); return
      }
      
      const typedData = requestData as ReviewRequest
      setRequest(typedData)
      
      // 3. If it's an audio file, create a secure, temporary URL to play it
      const session = typedData.mock_interview_sessions
      if (session && session.recording_url) {
        const { data, error: urlError } = await supabase.storage
          .from('recordings')
          .createSignedUrl(session.recording_url, 3600) // Expires in 1 hour
          
        if (urlError) {
          console.error('Error creating signed URL:', urlError)
          setError('Could not load audio file.')
        } else {
          setAudioUrl(data.signedUrl)
        }
      }
      
      setLoading(false)
    }

    fetchRequestDetails()
  }, [supabase, router, id])
  
  // --- Handle Submit ---
  const handleSubmitReview = async () => {
    if (!profile || !request || !request.mock_interview_sessions) {
      setError('Missing data to submit review.'); return
    }
    if (peerComments.trim().length < 10) {
      setError('Please provide at least 10 characters of feedback.'); return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      // Step 1: Insert the new feedback
      const { error: insertError } = await supabase
        .from('mock_interview_feedback')
        .insert({
          session_id: request.session_id,
          reviewer_id: profile.id, // The current user is the reviewer
          peer_score: peerScore,
          comments: peerComments
        })
      if (insertError) throw insertError
      
      // Step 2: Update the request to 'completed'
      const { error: updateError } = await supabase
        .from('peer_review_requests')
        .update({
          status: 'completed',
          assignee_id: profile.id // Assign it to the reviewer
        })
        .eq('id', request.id) // The request ID
      if (updateError) throw updateError
      
      // Step 3: Success! Go back to the hub.
      router.push('/review')
      
    } catch (err) {
      console.error('Error submitting review:', err)
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center p-8">Loading...</div>
    }
    if (error) {
      return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
    }
    if (!request || !request.mock_interview_sessions) {
      return <p>Session data not found.</p>
    }
    
    const session = request.mock_interview_sessions

    return (
      <div className="space-y-6">
        {/* --- 1. Session Content --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">
            Reviewing Session for {request.users?.full_name || 'Anonymous'}
          </h2>
          
          {/* Show Audio Player */}
          {audioUrl && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Audio Submission:</h3>
              <audio src={audioUrl} controls className="w-full mt-2" />
            </div>
          )}
          
          {/* Show Text Answers */}
          {session.typed_answers && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Written Answers:</h3>
              <div className="space-y-3 mt-2">
                {session.questions_asked?.map(q => (
                  <div key={q.id} className="p-3 bg-gray-50 rounded-md">
                    <p className="font-medium text-gray-800">{q.question_text}</p>
                    <p className="text-gray-600 mt-2 pl-4 border-l-2 border-blue-500">
                      {session.typed_answers![q.id] || <i>No answer provided.</i>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* --- 2. Feedback Form --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Your Review</h2>
          {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
          <div className_="space-y-4">
            <div>
              <label htmlFor="score" className="block text-sm font-medium text-gray-700">
                Score (1-10)
              </label>
              <input
                type="number"
                id="score"
                min="1"
                max="10"
                value={peerScore}
                onChange={(e) => setPeerScore(parseInt(e.target.value))}
                className="w-full p-2 border rounded-md mt-1 text-black"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="comments" className="block text-sm font-medium text-gray-700">
                Comments
              </label>
              <textarea
                id="comments"
                rows={5}
                value={peerComments}
                onChange={(e) => setPeerComments(e.target.value)}
                className="w-full p-2 border rounded-md mt-1 text-black"
                placeholder="Provide constructive feedback..."
              />
            </div>
            <button
              onClick={handleSubmitReview}
              disabled={isSubmitting}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 mt-4"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <a href="/review" className="text-blue-600 hover:underline mb-4 block">&larr; Back to Review Hub</a>
        {renderContent()}
      </div>
    </div>
  )
}