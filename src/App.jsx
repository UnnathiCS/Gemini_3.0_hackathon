import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  User, 
  Bot, 
  Briefcase, 
  Play, 
  XOctagon, 
  Award, 
  AlertCircle, 
  Loader2, 
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

// --- CONFIGURATION ---

// 1. FOR GITHUB / VERCEL DEPLOYMENT:
// Uncomment the line below when you move this to your local project or GitHub.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ""; 

// 2. FOR THIS PREVIEW:
// We keep this empty to avoid compilation errors in the browser. 
// The environment variable syntax (import.meta) causes issues here.
// const API_KEY = ""; 

export default function App() {
  // State
  const [view, setView] = useState('setup'); // 'setup', 'interview', 'feedback'
  const [jobDescription, setJobDescription] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');

  // Refs for auto-scrolling
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, view]);

  // Check for API Key on load
  useEffect(() => {
    if (!API_KEY) {
      // In production, this warns if the env var is missing.
      // In this preview, it's expected to be missing.
      setError("Note: API Key is missing. If running locally/Vercel, check your .env file.");
    }
  }, []);

  // API Interaction Helper
  const callGemini = async (prompt, history = []) => {
    // If we have no key, we can't call the API.
    // In a real app, you might want to throw an error or handle this gracefully.
    if (!API_KEY) {
      setError("API Key is missing. Please set VITE_GEMINI_API_KEY in your environment variables.");
      return null;
    }

    try {
      setIsLoading(true);
      setError('');

      let fullPrompt = "";
      
      if (view === 'setup') {
         // Initial system instruction contained in the first call
         fullPrompt = `
          System: You are an experienced, professional, but friendly Hiring Manager interviewing a candidate for the following Job Description. 
          
          JOB DESCRIPTION:
          "${jobDescription}"
          
          RULES:
          1. Start by introducing yourself and asking the first relevant question based on the JD.
          2. Ask only ONE question at a time.
          3. Wait for the candidate's response before asking the next question.
          4. Dig deeper if the answer is vague.
          5. Keep your responses concise (under 3 sentences) unless explaining a complex scenario.
          6. Do NOT break character. You are the interviewer.
          
          Goal: Start the interview now.
         `;
      } else if (view === 'interview' && prompt === 'GENERATE_FEEDBACK') {
        // Special trigger for feedback
        const conversationHistory = messages.map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`).join('\n');
        fullPrompt = `
          The interview has ended. Here is the transcript:
          
          ${conversationHistory}
          
          TASK:
          Please provide a structured evaluation of the candidate.
          1. Give a score out of 10.
          2. List 3 Strengths.
          3. List 3 Areas for Improvement.
          4. Final Hiring Recommendation (Hire, No Hire, Maybe).
          
          Format the output as valid JSON with keys: score, strengths (array), improvements (array), recommendation, summary.
        `;
      } else {
        // Regular chat turn
        // We include recent history to maintain context
        const recentHistory = messages.slice(-10).map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`).join('\n');
        fullPrompt = `
          You are the Hiring Manager acting based on the previous instructions. 
          
          Context so far:
          ${recentHistory}
          
          Candidate's latest response:
          "${prompt}"
          
          Respond naturally as the interviewer. Acknowledge the answer briefly and ask the next question or follow up.
        `;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: view === 'interview' && prompt === 'GENERATE_FEEDBACK' 
              ? { responseMimeType: "application/json" } 
              : {}
          }),
        }
      );

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("No response from Gemini");

      return text;

    } catch (err) {
      setError(err.message || "Failed to connect to AI");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startInterview = async () => {
    if (!jobDescription.trim()) return;
    
    // Optimistic UI update
    setView('interview');
    setMessages([]);
    
    const introResponse = await callGemini('START_SESSION');
    if (introResponse) {
      setMessages([{ id: 1, role: 'ai', content: introResponse }]);
    } else {
      setView('setup'); // Revert on failure
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    const aiResponse = await callGemini(input);
    if (aiResponse) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: aiResponse }]);
    }
  };

  const endInterview = async () => {
    setIsLoading(true); // Show loading immediately
    const feedbackJson = await callGemini('GENERATE_FEEDBACK');
    if (feedbackJson) {
      try {
        setFeedback(JSON.parse(feedbackJson));
        setView('feedback');
      } catch (e) {
        console.error("JSON Parse Error", e);
        setError("Failed to parse feedback report");
      }
    }
    setIsLoading(false);
  };

  const resetApp = () => {
    setView('setup');
    setJobDescription('');
    setMessages([]);
    setFeedback(null);
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // --- Components ---

  const SetupView = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 w-full">
        <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6 mx-auto">
          <Briefcase className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">Job Description</h1>
        <p className="text-center text-slate-500 mb-8">
          Paste the job description below. Gemini will analyze it and interview you as the hiring manager.
        </p>
        
        <textarea
          className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none text-slate-700 placeholder:text-slate-400"
          placeholder="Paste Job Description here (e.g., Senior React Developer, Marketing Manager...)"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
        
        <button
          onClick={startInterview}
          disabled={!jobDescription.trim() || isLoading}
          className="mt-6 w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <Play size={20} />}
          Start Interview
        </button>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );

  const InterviewView = () => (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden md:my-8 md:rounded-2xl md:h-[90vh]">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold">Hiring Manager</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-xs text-slate-400">Live Interview</span>
            </div>
          </div>
        </div>
        <button 
          onClick={endInterview}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg flex items-center gap-2 transition-colors border border-slate-700"
        >
          <XOctagon size={16} />
          End & Get Feedback
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
              msg.role === 'user' ? 'bg-indigo-100' : 'bg-blue-100'
            }`}>
              {msg.role === 'user' ? <User size={20} className="text-indigo-600" /> : <Bot size={20} className="text-blue-600" />}
            </div>
            
            <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Bot size={20} className="text-blue-600" />
            </div>
            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100 shrink-0">
        <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            className="w-full max-h-32 min-h-[56px] py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none outline-none text-slate-700"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="h-[56px] w-[56px] flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-md shrink-0"
          >
            <Send size={24} />
          </button>
        </div>
        <div className="text-center mt-2">
           <span className="text-xs text-slate-400">Press Enter to send, Shift + Enter for new line</span>
        </div>
      </div>
    </div>
  );

  const FeedbackView = () => (
    <div className="min-h-screen bg-slate-50 py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-4 shadow-sm">
            <Award className="w-10 h-10 text-yellow-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800">Interview Evaluation</h2>
          <p className="text-slate-500 mt-2">Here is how you performed based on the Job Description</p>
        </div>

        {feedback ? (
          <div className="space-y-6">
            {/* Score Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-8">
              <div className="relative flex items-center justify-center w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="56" stroke="#e2e8f0" strokeWidth="12" fill="none" />
                  <circle 
                    cx="64" 
                    cy="64" 
                    r="56" 
                    stroke={feedback.score >= 8 ? "#22c55e" : feedback.score >= 5 ? "#eab308" : "#ef4444"} 
                    strokeWidth="12" 
                    fill="none" 
                    strokeDasharray="351.86" 
                    strokeDashoffset={351.86 - (351.86 * feedback.score) / 10} 
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-4xl font-bold text-slate-800">{feedback.score}</span>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Score</span>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Recommendation: <span className={
                    feedback.recommendation?.toLowerCase().includes('hire') && !feedback.recommendation?.toLowerCase().includes('no') 
                    ? "text-green-600" 
                    : "text-amber-600"
                  }>{feedback.recommendation}</span>
                </h3>
                <p className="text-slate-600">{feedback.summary}</p>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Strengths */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                  <CheckCircle2 className="text-green-500" size={20} />
                  Strengths
                </h4>
                <ul className="space-y-3">
                  {feedback.strengths?.map((item, i) => (
                    <li key={i} className="flex gap-3 text-slate-600 text-sm">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                  <AlertCircle className="text-amber-500" size={20} />
                  Areas for Improvement
                </h4>
                <ul className="space-y-3">
                  {feedback.improvements?.map((item, i) => (
                    <li key={i} className="flex gap-3 text-slate-600 text-sm">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              onClick={resetApp}
              className="w-full py-4 mt-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <RefreshCw size={20} />
              Start New Interview
            </button>
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center h-64">
             <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
             <p className="text-slate-500">Generating your performance report...</p>
           </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 selection:bg-blue-100">
      {view === 'setup' && <SetupView />}
      {view === 'interview' && <InterviewView />}
      {view === 'feedback' && <FeedbackView />}
    </div>
  );
}
