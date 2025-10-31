'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'

// Type for our profile
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}

// Configuration for the STUN server
const stunConfiguration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302', // Google's public STUN server
    },
  ],
}

export default function CallPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const callId = params.id as string

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [callStatus, setCallStatus] = useState('Connecting...')

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const callChannelRef = useRef<any>(null)

  // --- NEW: Refs for robust ICE candidate buffering ---
  const iceCandidateBufferRef = useRef<RTCIceCandidate[]>([])
  const remoteDescriptionSetRef = useRef(false)
  // ---------------------------------------------------

  // --- 1. Hang Up Function (Memoized) ---
  const hangUp = useCallback(() => {
    setCallStatus('Call Ended');
    
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    pcRef.current?.close();
    pcRef.current = null;

    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    
    router.push('/live');
  }, [router, supabase]);

  // --- 2. Main WebRTC Setup Function (UPDATED with Buffering) ---
  const setupWebRTC = useCallback((
    myProfile: PublicUserProfile, 
    callData: any,
    stream: MediaStream
  ) => {
    
    pcRef.current = new RTCPeerConnection(stunConfiguration);

    // Reset refs for new call
    iceCandidateBufferRef.current = []
    remoteDescriptionSetRef.current = false

    stream.getTracks().forEach(track => {
      pcRef.current?.addTrack(track, stream);
    });

    pcRef.current.ontrack = (event) => {
      setCallStatus('Connected');
      console.log('Got remote track!');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate...');
        callChannelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'ice-candidate',
            payload: event.candidate,
          }
        });
      }
    };

    // --- 3. Set up Supabase Realtime Signaling (UPDATED) ---
    const channel = supabase.channel(`call-${callId}`);
    callChannelRef.current = channel;

    channel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      if (!pcRef.current) return;

      try {
        if (payload.type === 'offer') {
          console.log('Received offer');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
          remoteDescriptionSetRef.current = true; // --- 1. Mark remote as set
          
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          
          console.log('Sending answer');
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: {
              type: 'answer',
              payload: { sdp: answer },
            }
          });
          
          // --- 2. Process buffered candidates ---
          iceCandidateBufferRef.current.forEach(candidate => {
            pcRef.current?.addIceCandidate(candidate);
          });
          iceCandidateBufferRef.current = []; // Clear buffer
        } 
        else if (payload.type === 'answer') {
          console.log('Received answer');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
          remoteDescriptionSetRef.current = true; // --- 1. Mark remote as set
          
          // --- 2. Process buffered candidates ---
          iceCandidateBufferRef.current.forEach(candidate => {
            pcRef.current?.addIceCandidate(candidate);
          });
          iceCandidateBufferRef.current = []; // Clear buffer
        } 
        else if (payload.type === 'ice-candidate') {
          console.log('Received ICE candidate');
          // --- 3. Check buffer before adding ---
          if (remoteDescriptionSetRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.payload));
          } else {
            // Buffer it
            iceCandidateBufferRef.current.push(payload.payload);
          }
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        if (callData.requester_id === myProfile.id) {
          console.log('I am the caller, creating offer...');
          const offer = await pcRef.current?.createOffer();
          await pcRef.current?.setLocalDescription(offer);
          
          console.log('Sending offer');
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: {
              type: 'offer',
              payload: { sdp: offer },
            }
          });
        }
      }
    });

  }, [callId, supabase]);

  // --- 3. Initialization useEffect (Unchanged) ---
  useEffect(() => {
    let initialized = false; 
    const init = async () => {
      if (initialized || !callId) return;
      initialized = true;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/'); return;
      }
      const { data: profileData, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single();
      
      if (profileError || !profileData) {
        setError('Could not load user profile.'); setLoading(false); return;
      }
      
      const { data: callData, error: callError } = await supabase
        .from('peer_call_requests')
        .select('*')
        .eq('id', callId)
        .single();
      
      if (callError || !callData) {
        setError('This call does not exist or has expired.'); setLoading(false); return;
      }
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error getting media:', err);
        setError('Could not access your camera or microphone.'); setLoading(false); return;
      }
      
      setLoading(false);
      setupWebRTC(profileData, callData, stream);
    };
    
    init();
    
    return () => {
      if (initialized) {
        hangUp();
      }
    };
  }, [callId, supabase, router, setupWebRTC, hangUp]);

  // --- Render Logic (Unchanged) ---
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Loading...</div>
  }
  if (error) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Error: {error}</div>
  }

  return (
    <div className="h-screen w-screen bg-gray-900 flex flex-col p-4">
      {/* Remote Video */}
      <div className="relative flex-1 bg-black rounded-lg overflow-hidden">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover" 
        />
        <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
          {callStatus}
        </div>
      </div>
      
      {/* Local Video */}
      <div className="absolute top-8 right-8 w-48 h-36 bg-black rounded-lg overflow-hidden border-2 border-gray-700">
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted
          className="w-full h-full object-cover" 
        />
      </div>
      
      {/* Controls */}
      <div className="flex justify-center p-4">
        <button
          onClick={hangUp}
          className="bg-red-600 text-white py-3 px-6 rounded-full font-bold text-lg hover:bg-red-700"
        >
          Hang Up
        </button>
      </div>
    </div>
  )
}