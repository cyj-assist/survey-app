import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Survey, SurveyResponse, ResponseAnswer } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ChevronRight, ChevronLeft, MapPin, Clock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function PublicSurvey() {
  const { surveyId } = useParams();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    if (!surveyId) return {};
    const saved = localStorage.getItem(`survey_${surveyId}_draft_answers`);
    return saved ? JSON.parse(saved) : {};
  });
  const [step, setStep] = useState<'intro' | 'questions' | 'outro'>(() => {
    if (!surveyId) return 'intro';
    return (localStorage.getItem(`survey_${surveyId}_draft_step`) || 'intro') as any;
  });
  const [currentSectionIdx, setCurrentSectionIdx] = useState(() => {
    if (!surveyId) return 0;
    const saved = localStorage.getItem(`survey_${surveyId}_draft_idx`);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-save progress
  useEffect(() => {
    if (!surveyId || step === 'outro') return;
    localStorage.setItem(`survey_${surveyId}_draft_answers`, JSON.stringify(answers));
    localStorage.setItem(`survey_${surveyId}_draft_step`, step);
    localStorage.setItem(`survey_${surveyId}_draft_idx`, currentSectionIdx.toString());
  }, [answers, step, currentSectionIdx, surveyId]);

  // Group questions by section or keep them in sequence
  const pages = (() => {
    if (!survey) return [];
    if (!survey.sections || survey.sections.length === 0) {
      return [{ id: 'all', title: '설문 문항', questions: survey.questions }];
    }
    
    return survey.sections
      .sort((a, b) => a.order - b.order)
      .map(s => ({
        id: s.id,
        title: s.title,
        questions: (survey.questions || []).filter(q => q.sectionId === s.id)
      }))
      .filter(p => p.questions.length > 0); // Hide empty sections
  })();

  const scrollToQuestion = (index: number) => {
    const currentPage = pages[currentSectionIdx];
    if (currentPage && index < currentPage.questions.length) {
      const nextQId = currentPage.questions[index].id;
      const element = questionRefs.current[nextQId];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleAnswerChange = (qId: string, val: any, qIdx: number) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    
    // Auto-scroll to next question if it's a single-choice or OX type
    const currentPage = pages[currentSectionIdx];
    if (!currentPage) return;
    
    const currentQ = currentPage.questions[qIdx];
    
    if (currentQ && (currentQ.type === 'single' || currentQ.type === 'ox')) {
      // Delay slightly for visual feedback of selection
      setTimeout(() => {
        if (qIdx < currentPage.questions.length - 1) {
          scrollToQuestion(qIdx + 1);
        }
      }, 300);
    }
  };

  useEffect(() => {
    if (!surveyId) return;

    const checkParticipation = async (sId: string) => {
      const respondentId = localStorage.getItem(`survey_${sId}_uid`);
      if (respondentId) {
        setAlreadyResponded(true);
      }
    };

    const fetchSurvey = async () => {
      try {
        const docRef = doc(db, 'surveys', surveyId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Survey;
          if (data.status === 'closed') {
            setError('이 설문은 현재 종료되었습니다.');
          } else {
            setSurvey(data);
            if (data.settings.antiDuplication) {
              checkParticipation(surveyId);
            }
          }
        } else {
          setError('설문을 찾을 수 없습니다.');
        }
      } catch (err) {
        setError('설문을 불러오는데 실패했습니다.');
      }
    };

    fetchSurvey();
  }, [surveyId]);

  const handleNext = () => {
    if (step === 'intro') {
      setStep('questions');
      return;
    }

    const currentPage = pages[currentSectionIdx];
    const unansweredRequired = currentPage.questions.find(q => q.required && !answers[q.id]);
    if (unansweredRequired) {
      alert(`필수 문항에 답변해 주세요: ${unansweredRequired.title}`);
      return;
    }

    if (currentSectionIdx < pages.length - 1) {
      setCurrentSectionIdx(currentSectionIdx + 1);
      window.scrollTo(0, 0);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentSectionIdx > 0) {
      setCurrentSectionIdx(currentSectionIdx - 1);
      window.scrollTo(0, 0);
    } else {
      setStep('intro');
    }
  };

  const handleSubmit = async () => {
    if (!survey || !surveyId) return;

    // Final validation of all required questions
    const unansweredRequired = (survey.questions || []).find(q => q && q.required && !answers[q.id]);
    if (unansweredRequired) {
      const pageIdx = pages.findIndex(p => p.questions.some(q => q.id === unansweredRequired.id));
      if (pageIdx !== -1) {
        setCurrentSectionIdx(pageIdx);
        window.scrollTo(0, 0);
        alert(`필수 문항에 답하지 않으셨습니다: ${unansweredRequired.title}`);
      }
      return;
    }

    setSubmitting(true);
    const respondentId = uuidv4();
    
    const responseData: SurveyResponse = {
      id: uuidv4(),
      surveyId,
      respondentId,
      submittedAt: Date.now(),
      answers: Object.entries(answers).map(([qId, val]) => ({
        questionId: qId,
        value: val as string | string[] | boolean
      })),
      metadata: {
        userAgent: navigator.userAgent
      }
    };

    try {
      await addDoc(collection(db, 'surveys', surveyId, 'responses'), responseData);
      
      // Update respondentCount on survey
      try {
        await updateDoc(doc(db, 'surveys', surveyId), {
          respondentCount: increment(1)
        });
      } catch (countErr) {
        console.warn('Failed to increment respondent count:', countErr);
      }

      if (survey.settings.antiDuplication) {
        localStorage.setItem(`survey_${surveyId}_uid`, respondentId);
      }
      
      // Clear draft after successful submission
      localStorage.removeItem(`survey_${surveyId}_draft_answers`);
      localStorage.removeItem(`survey_${surveyId}_draft_step`);
      localStorage.removeItem(`survey_${surveyId}_draft_idx`);
      
      setStep('outro');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `surveys/${surveyId}/responses`);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center p-6 text-center bg-[#f1f5f9]">
        <div className="max-w-md w-full bento-card p-12">
          <AlertTriangle size={64} className="mx-auto mb-6 text-amber-500" />
          <h1 className="text-2xl font-bold mb-4">{error}</h1>
          <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest leading-relaxed">
            Please contact the administration office if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (alreadyResponded) {
    return (
      <div className="h-screen flex items-center justify-center p-6 text-center bg-[#f1f5f9]">
        <div className="max-w-md w-full bento-card p-12">
          <ShieldCheck size={64} className="mx-auto mb-6 text-[#4f46e5]" />
          <h1 className="text-2xl font-bold mb-4">이미 참여한 설문입니다</h1>
          <p className="text-xs font-bold text-[#64748b] uppercase tracking-widest leading-relaxed">
            데이터의 무결성을 위해 교육 세션당 한 번의 제출만 허용됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (!survey) return <div className="h-screen flex items-center justify-center bg-[#f1f5f9]"><div className="w-10 h-10 border-4 border-[#4f46e5]/20 border-t-[#4f46e5] rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-[#0f172a] font-sans selection:bg-[#4f46e5] selection:text-white pb-20">
      {/* Header Progress */}
      <header className="h-1.5 bg-white w-full sticky top-0 z-50 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: step === 'questions' && pages.length > 0 ? `${((currentSectionIdx + 1) / pages.length) * 100}%` : step === 'outro' ? '100%' : '0%' }}
          className="h-full bg-[#4f46e5] transition-all duration-500"
        />
      </header>

      <main className={`max-w-6xl mx-auto px-6 py-20 ${step === 'questions' ? 'grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-12' : ''}`}>
        {step === 'questions' && pages.length > 0 && (
          <aside className="hidden lg:block space-y-8 sticky top-24 self-start">
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-[#94a3b8] uppercase tracking-[0.2em] mb-4">설문 진행 단계</h3>
              {pages.map((page, idx) => {
                const isActive = currentSectionIdx === idx;
                const isPast = currentSectionIdx > idx;
                const sectionQuestions = page.questions;
                const answeredInSection = sectionQuestions.filter(q => answers[q.id]).length;
                const isComplete = sectionQuestions.length > 0 && answeredInSection === sectionQuestions.length;

                return (
                  <div 
                    key={page.id} 
                    className={`p-4 rounded-2xl transition-all border-2 ${isActive ? 'bg-white border-[#4f46e5]/20 shadow-sm' : 'border-transparent opacity-60'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold ${isActive ? 'text-[#4f46e5]' : 'text-[#64748b]'}`}>{page.title}</span>
                      {isComplete && <CheckCircle2 size={14} className="text-green-500" />}
                    </div>
                    <div className="h-1 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#4f46e5] transition-all duration-300"
                        style={{ width: `${(answeredInSection / Math.max(1, sectionQuestions.length)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="bento-card p-6 bg-white/50 border-none">
              <p className="text-[10px] font-bold text-[#64748b] leading-relaxed">
                모든 필수 문항(*)에 답변하셔야 제출이 가능합니다.
              </p>
            </div>
          </aside>
        )}

        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="space-y-12 max-w-2xl mx-auto"
            >
              <div className="space-y-6 text-center">
                <span className="text-[10px] font-bold text-[#4f46e5] uppercase tracking-widest bg-[#eef2ff] px-3 py-1 rounded-full">Educational Survey</span>
                <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight">{survey.title}</h1>
                <p className="text-lg text-[#64748b] leading-relaxed max-w-lg mx-auto">{survey.description}</p>
              </div>

              <div className="bento-card p-10 bg-white border-none shadow-sm space-y-4">
                <div className="flex items-center gap-3 text-[#4f46e5]">
                   <Clock size={16} />
                   <h3 className="text-xs font-bold uppercase tracking-widest">안내 사항</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-sm font-medium leading-relaxed text-[#64748b]">{survey.openMessage}</p>
                  {survey.instructions && (
                    <ul className="space-y-2">
                       {survey.instructions.split('\n').filter(line => line.trim()).map((line, i) => (
                         <li key={i} className="text-xs text-[#94a3b8] flex gap-2">
                            <span className="text-[#4f46e5]">•</span>
                            {line}
                         </li>
                       ))}
                    </ul>
                  )}
                </div>
              </div>

              <button 
                onClick={handleNext}
                className="btn-primary w-full justify-center py-6 group text-lg"
              >
                설문 시작하기
                <ChevronRight size={20} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </motion.div>
          )}

          {step === 'questions' && pages[currentSectionIdx] && (
            <motion.div 
              key={`section-${pages[currentSectionIdx].id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-16"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#4f46e5] uppercase tracking-[0.2em] bg-[#eef2ff] px-3 py-1 rounded-full">Section {currentSectionIdx + 1}</span>
                  <div className="h-px flex-1 bg-[#4f46e5]/10"></div>
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">{pages[currentSectionIdx].title}</h2>
              </div>

              <div className="space-y-12">
                {pages[currentSectionIdx].questions.map((q, qIdx) => (
                  <div 
                    key={q.id} 
                    ref={el => questionRefs.current[q.id] = el}
                    className="space-y-6 scroll-mt-32"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-xl bg-white border border-[#e2e8f0] flex items-center justify-center text-xs font-black text-[#94a3b8] shrink-0 mt-1">
                        {qIdx + 1}
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-bold leading-tight">{q.title}</h3>
                          {q.required && <span className="text-[10px] font-bold text-[#f43f5e] uppercase tracking-widest bg-[#fff1f2] px-2 py-0.5 rounded">필수</span>}
                        </div>
                        <QuestionInput 
                          question={q} 
                          value={answers[q.id]}
                          onChange={(val) => handleAnswerChange(q.id, val, qIdx)}
                        />
                      </div>
                    </div>
                    {qIdx < pages[currentSectionIdx].questions.length - 1 && <div className="h-px bg-gradient-to-r from-transparent via-[#e2e8f0] to-transparent"></div>}
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-12">
                <button 
                  onClick={handleBack}
                  className="flex-1 bento-card p-4 font-bold text-xs hover:bg-[#f8fafc] transition-all flex items-center justify-center gap-2 border-none ring-1 ring-[#e2e8f0]"
                >
                  <ChevronLeft size={16} />
                  이전 단계
                </button>
                <button 
                  onClick={handleNext}
                  disabled={submitting}
                  className="flex-[2] btn-primary py-4 group"
                >
                  {currentSectionIdx === (pages.length - 1) ? '작성 완료 및 제출' : '다음 단계'}
                  {!submitting && <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'outro' && (
            <motion.div 
              key="outro"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center bento-card bg-white p-16 flex flex-col items-center space-y-8 max-w-2xl mx-auto"
            >
              <div className="w-24 h-24 bg-[#dcfce7] text-[#166534] rounded-3xl flex items-center justify-center shadow-inner">
                <CheckCircle2 size={48} />
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight">
                  {survey.completionTitle || '제출이 완료되었습니다'}
                </h1>
                <p className="text-lg text-[#64748b] leading-relaxed max-w-sm mx-auto">
                  {survey.closingMessage}
                </p>
                <div className="w-12 h-1 bg-[#4f46e5]/10 mx-auto rounded-full mt-6"></div>
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-[0.3em] font-mono">
                  CONFIRMED AT: {new Date().toLocaleTimeString()}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Branding */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 opacity-30 hover:opacity-100 transition-opacity whitespace-nowrap">
        <span className="text-[9px] font-bold text-[#64748b] uppercase tracking-[0.4em]">POWERED BY EDUSURVEY PRO</span>
      </footer>
    </div>
  );
}

function QuestionInput({ question, value, onChange }: { question: any, value: any, onChange: (val: any) => void }) {
  switch (question.type) {
    case 'short':
      return (
        <input 
          className="input-bento text-xl py-6 bg-white shadow-sm"
          placeholder="여기에 답변을 입력해 주세요..."
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      );
    case 'long':
      return (
        <textarea 
          className="input-bento h-48 text-xl py-6 bg-white shadow-sm resize-none"
          placeholder="더 자세한 의견을 들려주세요..."
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      );
    case 'ox':
      return (
        <div className="grid grid-cols-2 gap-6">
          {['O', 'X'].map((choice) => (
            <button 
              key={choice}
              onClick={() => onChange(choice)}
              className={`p-16 rounded-3xl border-2 text-6xl font-black transition-all active:scale-95 ${value === choice ? 'bg-[#4f46e5] text-white border-transparent' : 'bg-white text-[#cbd5e1] border-[#e2e8f0] hover:bg-[#eef2ff] hover:text-[#4f46e5] hover:border-[#4f46e5]/20'}`}
            >
              {choice}
            </button>
          ))}
        </div>
      );
    case 'single':
      return (
        <div className="space-y-3">
          {question.options?.map((opt: string) => (
            <button 
              key={opt}
              onClick={() => onChange(opt)}
              className={`w-full text-left p-6 bento-card font-bold transition-all flex items-center gap-6 ${value === opt ? 'bg-[#eef2ff] text-[#4f46e5] ring-2 ring-[#4f46e5]' : 'bg-white hover:bg-[#f8fafc] border-[#e2e8f0]'}`}
            >
              <div className={`w-6 h-6 border-2 rounded-full flex items-center justify-center transition-colors ${value === opt ? 'bg-[#4f46e5] border-transparent' : 'bg-transparent border-[#cbd5e1]'}`}>
                 {value === opt && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
              {opt}
            </button>
          ))}
        </div>
      );
    case 'multi':
      const currentValues = Array.isArray(value) ? value : [];
      const toggle = (opt: string) => {
        if (currentValues.includes(opt)) {
          onChange(currentValues.filter(v => v !== opt));
        } else {
          onChange([...currentValues, opt]);
        }
      };
      return (
        <div className="space-y-3">
          {question.options?.map((opt: string) => (
            <button 
              key={opt}
              onClick={() => toggle(opt)}
              className={`w-full text-left p-6 bento-card font-bold transition-all flex items-center gap-6 ${currentValues.includes(opt) ? 'bg-[#eef2ff] text-[#4f46e5] ring-2 ring-[#4f46e5]' : 'bg-white hover:bg-[#f8fafc] border-[#e2e8f0]'}`}
            >
              <div className={`w-6 h-6 border-2 rounded-lg flex items-center justify-center transition-colors ${currentValues.includes(opt) ? 'bg-[#4f46e5] border-transparent' : 'bg-transparent border-[#cbd5e1]'}`}>
                 {currentValues.includes(opt) && <CheckCircle2 size={14} className="text-white" />}
              </div>
              {opt}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}
