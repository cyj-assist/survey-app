import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Survey, Question, QuestionType, SurveySection } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { 
  Save, Trash2, Plus, GripVertical, ChevronUp, ChevronDown, 
  Type, AlignLeft, CheckSquare, List, CircleDot, Settings2,
  ExternalLink, Loader2, PlayCircle
} from 'lucide-react';
import { motion, Reorder } from 'motion/react';

const QUESTION_TYPES: { type: QuestionType; label: string; icon: any }[] = [
  { type: 'short', label: 'Short Text', icon: Type },
  { type: 'long', label: 'Long Text', icon: AlignLeft },
  { type: 'ox', label: 'OX Choice', icon: CircleDot },
  { type: 'single', label: 'Single Choice', icon: PlayCircle },
  { type: 'multi', label: 'Multiple Choice', icon: CheckSquare },
];

export default function SurveyBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [survey, setSurvey] = useState<Partial<Survey>>({
    title: '',
    description: '',
    openMessage: 'We appreciate your feedback to improve our education programs.',
    instructions: '',
    closingMessage: 'Thank you for your valuable response.',
    completionTitle: '제출이 완료되었습니다',
    status: 'active',
    settings: {
      antiDuplication: true
    }
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [sections, setSections] = useState<SurveySection[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      const fetchSurvey = async () => {
        try {
          const docRef = doc(db, 'surveys', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as Survey;
            setSurvey(data);
            setQuestions(data.questions || []);
            setSections(data.sections || []);
          }
        } catch (error) {
          console.error('Fetch error:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchSurvey();
    }
  }, [id, isEditing]);

  const handleSave = async () => {
    if (!auth.currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    if (!survey.title || survey.title.trim() === '') {
      alert('설문 제목을 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    const surveyId = id || uuidv4();
    
    const { respondentCount, ...surveyWithoutCount } = survey;

    const dataToSave = {
      ...surveyWithoutCount,
      id: surveyId,
      questions: questions,
      sections: sections,
      updatedAt: Date.now(),
      createdBy: survey.createdBy || auth.currentUser.uid,
      createdAt: survey.createdAt || Date.now(),
      status: survey.status || 'active'
    };

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'surveys', surveyId), dataToSave as any);
      } else {
        await setDoc(doc(db, 'surveys', surveyId), { ...dataToSave, respondentCount: 0 });
      }
      alert('설문이 성공적으로 저장되었습니다!');
      navigate('/admin');
    } catch (error) {
      console.error('Save error:', error);
      handleFirestoreError(error, OperationType.WRITE, `surveys/${surveyId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addSection = () => {
    const newSection: SurveySection = {
      id: uuidv4(),
      title: '새 주제 섹션',
      order: sections.length
    };
    setSections([...sections, newSection]);
  };

  const updateSection = (sId: string, updates: Partial<SurveySection>) => {
    setSections(sections.map(s => s.id === sId ? { ...s, ...updates } : s));
  };

  const removeSection = (sId: string) => {
    setSections(sections.filter(s => s.id !== sId));
    // Orphan questions
    setQuestions(questions.map(q => q.sectionId === sId ? { ...q, sectionId: undefined } : q));
  };

  const addQuestion = (type: QuestionType) => {
    const newQuestion: Question = {
      id: uuidv4(),
      type,
      title: '',
      required: true,
      order: questions.length,
      sectionId: sections[0]?.id, // Default to first section if exists
      options: (type === 'single' || type === 'multi') ? ['Option 1'] : undefined
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (qId: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === qId ? { ...q, ...updates } : q));
  };

  const removeQuestion = (qId: string) => {
    setQuestions(questions.filter(q => q.id !== qId));
  };

  if (loading) return <div className="p-12 text-center animate-pulse">Loading Builder...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Configuration Sidebar */}
      <div className="lg:col-span-1 space-y-6 sticky top-6 self-start max-h-[calc(100vh-120px)] overflow-y-auto pr-2 custom-scrollbar">
        <div className="bento-card space-y-4">
          <div className="flex items-center gap-2 mb-4 text-[#4f46e5]">
            <Settings2 size={16} />
            <h3 className="text-sm font-bold uppercase tracking-widest">설문 설정</h3>
          </div>
          
          <div>
            <label className="text-[10px] font-bold text-[#64748b] uppercase block mb-1.5 ml-1">설문 제목</label>
            <input 
              className="input-bento"
              value={survey.title || ''}
              onChange={e => setSurvey({ ...survey, title: e.target.value })}
              placeholder="예: 2026 하반기 UX 디자인 실무 만족도 조사"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#64748b] uppercase block mb-1.5 ml-1">설명</label>
            <textarea 
              className="input-bento h-24 resize-none"
              value={survey.description || ''}
              onChange={e => setSurvey({ ...survey, description: e.target.value })}
              placeholder="이 교육 과정에 대한 간단한 설명을 입력하세요..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
             <div className="space-y-1.5 col-span-2">
               <label className="text-[10px] font-bold text-[#64748b] uppercase ml-1">그룹 태그</label>
               <input 
                 className="input-bento"
                 placeholder="예: 2026년 과정"
                 value={survey.groupTag || ''}
                 onChange={e => setSurvey({ ...survey, groupTag: e.target.value })}
               />
             </div>
             <div className="space-y-1.5 col-span-2">
               <label className="text-[10px] font-bold text-[#64748b] uppercase ml-1">목표 참여 인원 (분모)</label>
               <input 
                 type="number"
                 className="input-bento"
                 placeholder="예: 20"
                 value={survey.targetRespondentCount || ''}
                 onChange={e => setSurvey({ ...survey, targetRespondentCount: parseInt(e.target.value) || 0 })}
               />
             </div>
             <div className="space-y-1.5 col-span-2">
               <label className="text-[10px] font-bold text-[#64748b] uppercase ml-1">중복 참여 차단</label>
               <button 
                 onClick={() => setSurvey({ ...survey, settings: { ...survey.settings!, antiDuplication: !survey.settings?.antiDuplication } })}
                 className={`w-full py-2 border rounded-xl text-xs font-bold transition-all ${survey.settings?.antiDuplication ? 'bg-[#4f46e5] text-white border-transparent' : 'bg-white text-[#64748b] border-[#e2e8f0]'}`}
               >
                 {survey.settings?.antiDuplication ? '차단 중' : '허용 함'}
               </button>
             </div>
          </div>
        </div>

        <div className="bento-card space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[#4f46e5]">
              <List size={16} />
              <h3 className="text-sm font-bold uppercase tracking-widest">주제 섹션 구성</h3>
            </div>
            <button 
              onClick={addSection}
              className="p-1 hover:bg-[#eef2ff] rounded text-[#4f46e5]"
            >
              <Plus size={16} />
            </button>
          </div>
          
          <div className="space-y-3">
            {sections.length === 0 && <p className="text-[10px] text-[#94a3b8] italic text-center py-2">추가된 주제 섹션이 없습니다.</p>}
            {sections.sort((a,b) => a.order - b.order).map((s, idx) => (
              <div key={s.id} className="flex gap-2">
                <input 
                  className="input-bento text-[10px] font-bold py-1.5"
                  value={s.title}
                  placeholder="섹션 제목"
                  onChange={e => updateSection(s.id, { title: e.target.value })}
                />
                <button 
                  onClick={() => removeSection(s.id)}
                  className="p-1.5 text-[#94a3b8] hover:text-[#f43f5e]"
                >
                   <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bento-card space-y-4">
          <div className="flex items-center gap-2 mb-4 text-[#4f46e5]">
            <Plus size={16} />
            <h3 className="text-sm font-bold uppercase tracking-widest">문항 라이브러리</h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {QUESTION_TYPES.map(qt => (
              <button 
                key={qt.type}
                onClick={() => addQuestion(qt.type)}
                className="flex items-center gap-3 p-4 text-xs font-bold text-[#64748b] border border-[#e2e8f0] rounded-xl hover:bg-[#eef2ff] hover:text-[#4f46e5] hover:border-[#4f46e5]/20 transition-all text-left"
              >
                <div className="p-2 bg-[#f8fafc] rounded-lg text-[#94a3b8]">
                  <qt.icon size={16} />
                </div>
                {qt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Builder Canvas */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bento-card p-0 overflow-hidden">
          <div className="p-6 bg-white border-b border-[#e2e8f0] flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-[#eef2ff] rounded-xl flex items-center justify-center text-[#4f46e5]">
                  <PlayCircle size={18} />
               </div>
               <span className="text-sm font-bold text-[#0f172a]">프로젝트 캔버스</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditing && (
                <Link 
                  to={`/s/${id}`}
                  className="btn-secondary py-2 text-xs border-[#e2e8f0] flex items-center gap-2"
                  title="학습자 화면 미리보기"
                >
                  <ExternalLink size={14} />
                  미리보기
                </Link>
              )}
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className={`btn-primary py-2 text-xs flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                {isSaving ? '저장 중...' : '설문 저장하기'}
              </button>
            </div>
          </div>

          <div className="p-10 space-y-10 bg-[#f8fafc]/30">
            {/* Intro/Outro Messages */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10 border-b border-[#e2e8f0]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                     Opening Message
                  </label>
                  <textarea 
                    className="input-bento h-32 bg-white"
                    placeholder="응답자에게 보여줄 환영 메시지를 입력하세요."
                    value={survey.openMessage || ''}
                    onChange={e => setSurvey({...survey, openMessage: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                     Instructions (Bullet points)
                  </label>
                  <textarea 
                    className="input-bento h-32 bg-white"
                    placeholder="참여 안내 사항을 입력하세요 (엔터로 구분)."
                    value={survey.instructions || ''}
                    onChange={e => setSurvey({...survey, instructions: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                     Completion Page Title
                  </label>
                  <input 
                    className="input-bento bg-white"
                    placeholder="예: 제출이 완료되었습니다"
                    value={survey.completionTitle || ''}
                    onChange={e => setSurvey({...survey, completionTitle: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                     Closing / Thank You Message
                  </label>
                  <textarea 
                    className="input-bento h-32 bg-white"
                    placeholder="응답을 마친 후 보여줄 감사 인사를 입력하세요."
                    value={survey.closingMessage || ''}
                    onChange={e => setSurvey({...survey, closingMessage: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Questions List */}
            <Reorder.Group axis="y" values={questions} onReorder={setQuestions} className="space-y-6">
              {questions.length === 0 ? (
                <div className="py-24 text-center border-2 border-dashed border-[#e2e8f0] rounded-3xl flex flex-col items-center gap-4 bg-[#f8fafc]">
                  <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-[#cbd5e1] border border-[#e2e8f0]">
                    <Plus size={40} />
                  </div>
                  <p className="font-semibold text-[#64748b]">문항이 없습니다. 문항 라이브러리에서 추가해 주세요.</p>
                </div>
              ) : (
                questions.map((q, idx) => (
                  <Reorder.Item key={q.id} value={q}>
                    <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 relative group hover:border-[#4f46e5]/30 transition-all shadow-sm shadow-[#e2e8f0]/20">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <GripVertical size={18} className="cursor-move text-[#cbd5e1]" />
                      </div>
                      <div className="absolute right-6 top-6">
                         <button 
                           onClick={() => removeQuestion(q.id)}
                           className="text-[#94a3b8] hover:text-[#f43f5e] p-2 rounded-xl hover:bg-[#fff1f2] transition-colors"
                         >
                           <Trash2 size={18} />
                         </button>
                      </div>

                      <div className="flex items-start gap-6 max-w-[calc(100%-40px)]">
                        <div className="flex flex-col items-center gap-2">
                           <div className="w-10 h-10 bg-[#f8fafc] rounded-2xl flex items-center justify-center font-bold text-sm text-[#4f46e5] border border-[#e2e8f0]">
                              {idx + 1}
                           </div>
                           <div className="h-full w-px bg-[#e2e8f0] flex-1 min-h-[40px]"></div>
                        </div>
                        <div className="flex-1 space-y-6">
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-bold uppercase bg-[#eef2ff] text-[#4f46e5] px-3 py-1 rounded-full">{q.type}</span>
                             
                             {sections.length > 0 && (
                               <select 
                                 className="text-[10px] font-bold text-[#64748b] uppercase bg-white border border-[#e2e8f0] rounded-lg px-2 py-0.5"
                                 value={q.sectionId || ''}
                                 onChange={e => updateQuestion(q.id, { sectionId: e.target.value })}
                               >
                                 <option value="">대주제 선택 안함</option>
                                 {sections.map(s => (
                                   <option key={s.id} value={s.id}>{s.title}</option>
                                 ))}
                               </select>
                             )}

                             <label className="flex items-center gap-2 cursor-pointer group/req ml-auto">
                               <input 
                                 type="checkbox" 
                                 checked={q.required} 
                                 onChange={e => updateQuestion(q.id, { required: e.target.checked })}
                                 className="w-4 h-4 rounded border-[#e2e8f0] text-[#4f46e5] focus:ring-[#4f46e5] accent-[#4f46e5]"
                               />
                               <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-tight">필수 답변</span>
                             </label>
                          </div>
                          <input 
                            className="w-full text-2xl font-bold bg-transparent border-none focus:outline-none placeholder:text-[#cbd5e1] text-[#0f172a] tracking-tight"
                            placeholder="질문을 입력해 주세요..."
                            value={q.title || ''}
                            onChange={e => updateQuestion(q.id, { title: e.target.value })}
                          />
                          
                          {(q.type === 'single' || q.type === 'multi') && (
                            <div className="space-y-3 mt-6 bg-[#f8fafc] p-6 rounded-2xl border border-[#e2e8f0]">
                               {q.options?.map((opt, oIdx) => (
                                 <div key={oIdx} className="flex items-center gap-3 group/opt">
                                   <div className={q.type === 'single' ? "w-4 h-4 border-2 border-[#cbd5e1] rounded-full" : "w-4 h-4 border-2 border-[#cbd5e1] rounded"}></div>
                                   <input 
                                     className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none"
                                     value={opt || ''}
                                     onChange={e => {
                                       const newOpts = [...(q.options || [])];
                                       newOpts[oIdx] = e.target.value;
                                       updateQuestion(q.id, { options: newOpts });
                                     }}
                                   />
                                   <button 
                                      onClick={() => {
                                        const newOpts = (q.options || []).filter((_, i) => i !== oIdx);
                                        updateQuestion(q.id, { options: newOpts });
                                      }}
                                      className="text-[#94a3b8] hover:text-[#f43f5e] opacity-0 group-hover/opt:opacity-100 transition-opacity"
                                   >
                                      <Plus size={16} className="rotate-45" />
                                   </button>
                                 </div>
                               ))}
                               <button 
                                 onClick={() => updateQuestion(q.id, { options: [...(q.options || []), `새 옵션 ${q.options?.length || 0 + 1}`] })}
                                 className="w-fit text-[10px] font-bold text-[#4f46e5] uppercase bg-white px-4 py-2 rounded-xl border border-[#e2e8f0] shadow-sm flex items-center gap-2 mt-4 active:scale-95 transition-all"
                               >
                                 <Plus size={12} /> 옵션 추가하기
                               </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Reorder.Item>
                ))
              )}
            </Reorder.Group>
          </div>
        </div>
      </div>
    </div>
  );
}
