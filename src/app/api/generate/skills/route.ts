import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

// Get the API key from your .env.local file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: Request) {
  try {
    // Get the prompt (job title) from the request body
    const { prompt } = await request.json()

    // Initialize the generative model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Send the generated text back to the frontend
    return NextResponse.json({ skillsText: text })
  } catch (error) {
    console.error('Error in Gemini API route:', error)
    // Send a more detailed error response
    return NextResponse.json(
      { 
        error: 'Failed to generate skills', 
        details: (error as Error).message 
      }, 
      { status: 500 }
    )
  }
}