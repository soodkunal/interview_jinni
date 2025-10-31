import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin' // Our admin client

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Define the type for the expected JSON from Gemini
type InterviewQuestion = {
  question_text: string
  question_type: 'technical' | 'behavioral' | 'situational'
}

export async function POST(request: Request) {
  try {
    // jobRoleId is now optional
    const { jobRoleId, skillNames, jobTitle } = await request.json()

    if (!skillNames || !jobTitle) {
      return NextResponse.json(
        { error: 'Missing jobTitle or skillNames' },
        { status: 400 }
      )
    }

    // --- 1. Call Gemini API ---
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })
    
    const prompt = `
      You are an expert technical recruiter and hiring manager.
      Generate 5 high-quality interview questions for a candidate applying for a "${jobTitle}" role.
      The ideal candidate must have these skills: ${skillNames.join(', ')}.
      Include a mix of "technical", "behavioral", and "situational" questions.
      Return the response as a valid JSON array.
      Each object in the array must have the following exact structure:
      {
        "question_text": "The full interview question",
        "question_type": "technical"
      }
      Do not include any text, markdown, or backticks outside of the JSON array.
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // --- 2. Parse and Save to Supabase ---
    
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const questions: InterviewQuestion[] = JSON.parse(cleanedText)

    // Map to our database schema
    const newDbRows = questions.map(q => ({
      job_role_id: jobRoleId || null, // <-- Use null if jobRoleId is not provided
      skill_name: skillNames[0] || 'general',
      question_text: q.question_text,
      question_type: q.question_type,
      created_by: 'ai_generated',
    }))

    // Insert new questions into the 'interview_questions' table
    const { data, error: dbError } = await supabaseAdmin
      .from('interview_questions')
      .insert(newDbRows)
      .select()

    if (dbError) {
      console.error('Supabase DB error:', dbError)
      throw new Error(`Failed to save questions to database: ${dbError.message}`)
    }

    // --- 3. Return the new questions to the frontend ---
    return NextResponse.json(data)

  } catch (error) {
    console.error('Error in Gemini interview question route:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate interview questions', 
        details: (error as Error).message 
      }, 
      { status: 500 }
    )
  }
}