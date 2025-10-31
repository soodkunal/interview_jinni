import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Use the gemini-2.5-pro model as you requested
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })

type AnalysisResponse = {
  overall_score: number
  overall_feedback: string
  question_feedback: {
    question: string
    feedback: string
  }[]
}

export async function POST(request: Request) {
  let sessionId: number | null = null;
  try {
    const body = await request.json()
    sessionId = body.sessionId

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // 1. Fetch the session data
    const { data: sessionData, error: fetchError } = await supabaseAdmin
      .from('mock_interview_sessions')
      .select('recording_url, questions_asked, typed_answers') // <-- Get all possible inputs
      .eq('id', sessionId)
      .single()

    if (fetchError || !sessionData) {
      throw new Error(`Failed to fetch session: ${fetchError?.message}`)
    }

    const { recording_url, questions_asked, typed_answers } = sessionData
    const questions = questions_asked as any[] // Cast for ease of use
    
    let prompt: string;
    let modelInput: any; // This will be the prompt OR [prompt, audio]
    
    // ---
    // FLOW 1: AUDIO ANALYSIS
    // ---
    if (recording_url) {
      // Download the file directly from storage
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('recordings')
        .download(recording_url) // 'recording_url' is the path

      if (downloadError) {
        throw new Error(`Failed to download audio file: ${downloadError.message}`)
      }

      const audioBlob = fileData;
      const audioBuffer = await audioBlob.arrayBuffer()
      const audioBase64 = Buffer.from(audioBuffer).toString('base64')

      const audioFileDataPart = {
        inlineData: { data: audioBase64, mimeType: audioBlob.type || 'audio/webm' },
      }

      const questionsText = questions.map((q, i) => `${i + 1}. ${q.question_text}`).join('\n')
      
      prompt = `
        You are an expert technical recruiter and speech analyst.
        A student has submitted an audio recording answering a set of interview questions.
        Your task is to analyze their entire performance.
        Here are the questions they were asked:
        ${questionsText}

        Please analyze the attached audio file. Evaluate the student's answers for clarity, confidence, relevance to the questions, and depth of knowledge.
        Return your analysis as a single, valid JSON object. Do not include any text, markdown, or backticks outside of the JSON object.
        The JSON object must have this exact structure:
        {
          "overall_score": [A single integer score from 1 (poor) to 10 (excellent)],
          "overall_feedback": "One paragraph of constructive feedback on their performance.",
          "question_feedback": [
            { "question": "The full text of the first question", "feedback": "Specific feedback for their answer to this question." }
          ]
        }
      `
      modelInput = [prompt, audioFileDataPart]; // Multimodal input
      
    // ---
    // FLOW 2: TEXT ANALYSIS
    // ---
    } else if (typed_answers) {
      
      const typedAnswersObject = typed_answers as Record<number, string>
      
      // Format the questions and answers for the prompt
      const qaText = questions.map((q, i) => {
        const answer = typedAnswersObject[q.id] || "No answer provided."
        return `
          Question ${i + 1}: ${q.question_text}
          Student's Answer: ${answer}
        `
      }).join('\n')
      
      prompt = `
        You are an expert technical recruiter and hiring manager.
        A student has submitted written answers to a set of interview questions.
        Your task is to analyze their entire performance based on their text.

        Here are the questions and their corresponding answers:
        ${qaText}

        Please analyze their written answers. Evaluate them for correctness, clarity, relevance, and depth of knowledge.
        Return your analysis as a single, valid JSON object. Do not include any text, markdown, or backticks outside of the JSON object.
        The JSON object must have this exact structure:
        {
          "overall_score": [A single integer score from 1 (poor) to 10 (excellent)],
          "overall_feedback": "One paragraph of constructive feedback on their performance.",
          "question_feedback": [
            { "question": "The full text of the first question", "feedback": "Specific feedback for their answer to this question." }
          ]
        }
      `
      modelInput = prompt; // Text-only input

    } else {
      throw new Error('Session has no audio or text answers to analyze.')
    }

    // 4. Call the Gemini API
    const result = await model.generateContent(modelInput)
    const response = await result.response
    const text = response.text()
    
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const analysis: AnalysisResponse = JSON.parse(cleanedText)

    // 5. Save the analysis back to Supabase
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('mock_interview_sessions')
      .update({
        ai_score: analysis.overall_score,
        ai_feedback: JSON.stringify(analysis),
        analysis_status: 'completed',
      })
      .eq('id', sessionId)
      .select()
      .single()
      
    if (updateError) {
      throw new Error(`Failed to save analysis: ${updateError.message}`)
    }

    // 6. Return the analysis to the frontend
    return NextResponse.json(updateData)

  } catch (error) {
    console.error('Error in analysis API route:', error)
    // Update the session to mark it as 'failed'
    if (sessionId) {
      await supabaseAdmin
        .from('mock_interview_sessions')
        .update({ analysis_status: 'failed' })
        .eq('id', sessionId)
    }
    
    return NextResponse.json(
      { error: 'Failed to analyze session', details: (error as Error).message },
      { status: 500 }
    )
  }
}