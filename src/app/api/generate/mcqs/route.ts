import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin' // Our new admin client

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Define the type for the expected JSON from Gemini
type McqQuestion = {
  question_text: string
  options: { [key: string]: string } // e.g., { "a": "...", "b": "..." }
  correct_answer: string // e.g., "a"
  explanation: string
}

export async function POST(request: Request) {
  try {
    const { skillName, difficulty } = await request.json()

    if (!skillName || !difficulty) {
      return NextResponse.json(
        { error: 'Missing skillName or difficulty' },
        { status: 400 }
      )
    }

    // --- 1. Call Gemini API ---
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })

    const prompt = `
      You are an expert technical quiz creator.
      Generate 20 multiple-choice questions for the skill: "${skillName}" at a "${difficulty}" difficulty level.
      Return the response as a valid JSON array.
      Each object in the array must have the following exact structure:
      {
        "question_text": "The question content",
        "options": { "a": "Option A", "b": "Option B", "c": "Option C", "d": "Option D" },
        "correct_answer": "a",
        "explanation": "A brief explanation of why this is the correct answer."
      }
      Do not include any text, markdown, or backticks outside of the JSON array.
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // --- 2. Parse and Save to Supabase ---

    // Clean the text in case Gemini adds markdown backticks
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const questions: McqQuestion[] = JSON.parse(cleanedText)

    // Map to our database schema (they are very similar)
    const newDbRows = questions.map(q => ({
      skill_name: skillName,
      difficulty: difficulty,
      question_text: q.question_text,
      options: q.options, // 'options' is jsonb, so the object is perfect
      correct_answer: q.correct_answer,
      explanation: q.explanation,
    }))

    // Insert new questions into the 'mcqs' table
    const { data, error: dbError } = await supabaseAdmin
      .from('mcqs')
      .insert(newDbRows)
      .select() // Return the new rows

    if (dbError) {
      console.error('Supabase DB error:', dbError)
      throw new Error(`Failed to save MCQs to database: ${dbError.message}`)
    }

    // --- 3. Return the new questions to the frontend ---
    return NextResponse.json(data)

  } catch (error) {
    console.error('Error in Gemini MCQ route:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate MCQs', 
        details: (error as Error).message 
      }, 
      { status: 500 }
    )
  }
}