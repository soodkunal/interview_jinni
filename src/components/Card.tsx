import React from 'react'

// This component is a simple wrapper to make all our cards look consistent
export default function Card({ 
  children, 
  className = '' // <-- Fix: Should be className, not className_
}: { 
  children: React.ReactNode, 
  className?: string // <-- Fix: Should be className, not className_
}) {
  return (
    <div 
      className={`bg-white shadow-md rounded-lg p-6 ${className}`} // <-- Fix: Should use className
    >
      {children}
    </div>
  )
}