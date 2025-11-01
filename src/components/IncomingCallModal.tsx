'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

// Type for our profile
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}

// Type for the incoming call payload
type CallRequest = {
  id: number
  requester_id: number
  // --- FIX 1: MARK 'users' as an ARRAY ---
  users: {
    full_name: string | null
    email: string | null
  }[] | null // <-- Changed from object to ARRAY of objects
}

export default function IncomingCallModal() {
  const supabase = createClient()
  const router = useRouter()
  
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [incomingCall, setIncomingCall] = useState<CallRequest | null>(null)

  // 1. Fetch the user's own profile on load (Unchanged)
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profileData } = await supabase
          .from('users')
          .select('id, auth_id')
          .eq('auth_id', user.id)
          .single()
        
        if (profileData) {
          setProfile(profileData)
        }
      }
    }
    fetchProfile()
  }, [supabase])

  // 2. When the profile is loaded, subscribe to the real-time channel (Logic Unchanged)
  useEffect(() => {
    // Don't subscribe until we know who we are
    if (!profile) return

    const channel = supabase
      .channel('call-requests-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'peer_call_requests',
          // Only listen for inserts where WE are the 'responder'
          filter: `responder_id=eq.${profile.id}` 
        },
        async (payload) => {
          console.log('Incoming call!', payload)
          
          // The payload only has the IDs. We need to fetch the requester's name.
          const callRequestId = (payload.new as any).id
          const requesterId = (payload.new as any).requester_id
          
          const { data: requestData } = await supabase
            .from('peer_call_requests')
            .select(`id, requester_id, users:requester_id ( full_name, email )`) // <-- CLEANED QUERY
            .eq('id', callRequestId)
            .single()
            
          if (requestData) {
            setIncomingCall(requestData as CallRequest)
          }
        }
      )
      .subscribe()

    // Cleanup
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, profile])

  // --- Modal Button Handlers (Unchanged) ---

  const handleAccept = async () => {
    if (!incomingCall) return
    
    // 1. Update the request status to 'accepted'
    const { error } = await supabase
      .from('peer_call_requests')
      .update({ status: 'accepted' })
      .eq('id', incomingCall.id)
      
    if (error) {
      console.error('Error accepting call:', error)
    } else {
      // 2. Redirect to the call page
      router.push(`/live/${incomingCall.id}`)
    }
    setIncomingCall(null)
  }

  const handleReject = async () => {
    if (!incomingCall) return
    
    // 1. Update the request status to 'rejected'
    await supabase
      .from('peer_call_requests')
      .update({ status: 'rejected' })
      .eq('id', incomingCall.id)
      
    // 2. Just close the modal
    setIncomingCall(null)
  }

  // --- Render Logic (UPDATED) ---
  if (!incomingCall) {
    return null // Don't render anything if there's no call
  }

  // --- FIX 2: Safely access the first element of the users array ---
  const requesterProfile = incomingCall.users ? incomingCall.users[0] : null
  const requesterName = requesterProfile?.full_name || requesterProfile?.email || 'Someone'
  // -----------------------------------------------------------------

  return (
    // This is the modal container
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm mx-auto">
        <h2 className="text-2xl font-bold text-gray-800">Incoming Call</h2>
        <p className="text-gray-600 my-4">
          <span className="font-semibold">{requesterName}</span> is calling you.
        </p>
        <div className="flex justify-end space-x-4">
          <button
            onClick={handleReject}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}