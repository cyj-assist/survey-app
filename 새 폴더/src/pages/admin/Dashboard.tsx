import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Survey, Question, SurveySection } from '../../types';
import { Link } from 'react-router-dom';
import { Plus, BarChart3, Edit3, Link as LinkIcon, X, FileText, ChevronRight, ExternalLink, Share2, Download, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getDocs, query as fsQuery } from 'firebase/firestore';
import { ADMIN_EMAILS } from '../../constants';

export default function Dashboard() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [totalRespondents, setTotalRespondents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingSurveyId, setSharingSurveyId] = useState<string | null>(null);

  const seedSampleSurvey = async () => {
    if (!auth.currentUser) return;
    
    const surveyId = `leadership-${Date.now()}`;
    const sampleQuestions: Question[] = [
      { id: 'q1', order: 0, type: 'single', title: '[강의] 명확한 학습목표가 제시되었습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec1' },
      { id: 'q2', order: 1, type: 'single', title: '[강의] 강의내용은 학습목표와 부합하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec1' },
      { id: 'q3', order: 2, type: 'single', title: '[강의] 내용전개가 논리적이고 체계적이었습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec1' },
      { id: 'q4', order: 3, type: 'single', title: '[강의] 강의방법은 주제 전달에 적합하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec1' },
      { id: 'q5', order: 4, type: 'single', title: '[교수자] 교수자는 내용을 이해하기 쉽게 잘 설명하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec2' },
      { id: 'q6', order: 5, type: 'single', title: '[교수자] 시간배분은 적절하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec2' },
      { id: 'q7', order: 6, type: 'single', title: '[교수자자료] 교수는 강의내용에 맞게 교육생들의 입장에서 강의자료를 성실히 준비하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec2' },
      { id: 'q8', order: 7, type: 'single', title: '[교수자자료] 수업 중 사용된 유인물과 사례는 강의 내용에 맞추어 잘 사용되었습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec2' },
      { id: 'q9', order: 8, type: 'single', title: '[자기평가 및 만족도] 수업 중 본인의 학습의지 및 참여는 어떠하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec3' },
      { id: 'q10', order: 9, type: 'single', title: '[자기평가 및 만족도] 전체적인 수업 내용에 대해 얼마나 이해하였습니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec3' },
      { id: 'q11', order: 10, type: 'single', title: '[자기평가 및 만족도] 본 과목에 대해 본인의 전반적인 만족도는 얼마입니까?', options: ['1', '2', '3', '4', '5'], required: true, sectionId: 'sec3' },
      { id: 'q12', order: 11, type: 'ox', title: '내년에도 이 과목을 개설하는 것이 좋겠습니까?', required: true, sectionId: 'sec3' },
      { id: 'q13', order: 12, type: 'ox', title: '내년에도 이 교수가 강의를 하는 것이 좋겠습니까?', required: true, sectionId: 'sec3' },
      { id: 'q14', order: 13, type: 'long', title: '본 과목에서 가장 유용한 측면은 무엇이었습니까?', required: false, sectionId: 'sec3' },
      { id: 'q15', order: 14, type: 'long', title: '본 과목에서 학습한 내용을 바탕으로 업무에 응용할 수 있는 부분은 어떤 부분입니까?', required: false, sectionId: 'sec3' },
      { id: 'q16', order: 15, type: 'long', title: '기타 개선을 위한 의견 및 제안이 있으시면 기재해 주세요.', required: false, sectionId: 'sec3' },
    ];

    const sampleSections: SurveySection[] = [
      { id: 'sec1', title: '강의 만족도', order: 0 },
      { id: 'sec2', title: '교수자 평가', order: 1 },
      { id: 'sec3', title: '자기계발 및 제언', order: 2 },
    ];

    const surveyData: Survey = {
      id: surveyId,
      title: '2026년 차세대 리더 육성 과정 강의 평가',
      description: '경영전략 [문정빈 고려대 교수]',
      openMessage: '본 교육 과정의 질적 향상을 위해 여러분의 소중한 의견을 듣고자 합니다. 잠시 시간을 내어 참여해 주시면 감사하겠습니다.',
      closingMessage: '응답해 주셔서 감사합니다. 여러분의 의견을 바탕으로 더 발전하는 리더 육성 과정을 만들겠습니다.',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: auth.currentUser.uid,
      respondentCount: 0,
      questions: sampleQuestions,
      sections: sampleSections,
      settings: {
        antiDuplication: true
      }
    };

    try {
      await setDoc(doc(db, 'surveys', surveyId), surveyData);
      alert('샘플 설문이 성공적으로 생성되었습니다!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `surveys/${surveyId}`);
    }
  };

 const deleteSurvey = async (id: string) => {
  // 1. 임시로 confirm 창 비활성화 (주석 처리)
  // if (!confirm('정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return; 

  try {
    console.log('Deleting survey:', id);
    await deleteDoc(doc(db, 'surveys', id));
    
    // 2. alert 대신 console.log로 성공 여부 확인
    console.log('설문이 성공적으로 삭제되었습니다.'); 
    
  } catch (error) {
    console.error('Delete error:', error);
    handleFirestoreError(error, OperationType.DELETE, `surveys/${id}`);
  }
};
  const duplicateSurvey = async (survey: Survey) => {
    if (!auth.currentUser) return;
    const newId = uuidv4();
    const duplicated: Survey = {
      ...survey,
      id: newId,
      title: `${survey.title} (복사본)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: auth.currentUser.uid,
      status: 'draft',
      respondentCount: 0
    };

    try {
      await setDoc(doc(db, 'surveys', newId), duplicated);
      alert('설문이 복제되었습니다.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `surveys/${newId}`);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const isAdmin = ADMIN_EMAILS.includes(auth.currentUser.email || '');
    
    // If admin, show all surveys. Otherwise show only owned surveys.
    const q = isAdmin 
      ? query(collection(db, 'surveys'))
      : query(
          collection(db, 'surveys'),
          where('createdBy', '==', auth.currentUser.uid)
        );

    const unsubscribeSurveys = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey));
      
      // Sort client-side to avoid index issues
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      setSurveys(data);
      
      // Calculate total respondents from all surveys managed by the user
      const total = data.reduce((sum, s) => sum + (s.respondentCount || 0), 0);
      setTotalRespondents(total);
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'surveys');
    });

    return () => {
      unsubscribeSurveys();
    };
  }, []);

const handleShare = (id: string) => {
  setSharingSurveyId(id);
  setIsShareModalOpen(true);
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    alert('참여 링크가 클립보드에 복사되었습니다.');
  } catch (err) {
    // fallback for some browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert('링크가 클립보드에 복사되었습니다.');
    } catch (err) {
      prompt('아래 링크를 복사하세요:', text);
    }
    document.body.removeChild(textArea);
  }
};

  const exportExcel = async (survey: Survey) => {
    try {
      const q = fsQuery(collection(db, 'surveys', survey.id, 'responses'));
      const snapshot = await getDocs(q);
      const responses = snapshot.docs.map(doc => doc.data());
      
      if (responses.length === 0) {
        alert('응답 데이터가 없습니다.');
        return;
      }

      const exportData = responses.map((res: any) => {
        const row: any = {
          '응답 ID': res.id,
          '제출 일시': res.submittedAt ? new Date(res.submittedAt).toLocaleString() : '',
        };
        (survey.questions || []).forEach(q => {
          const ans = res.answers?.find((a: any) => a.questionId === q.id);
          row[q.title] = Array.isArray(ans?.value) ? ans.value.join(', ') : ans?.value || '';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Responses");
      XLSX.writeFile(wb, `${survey.title}_원본데이터.xlsx`);
    } catch (error) {
      console.error('Excel Export Error:', error);
      alert('엑셀 추출 중 오류가 발생했습니다.');
    }
  };

  const groupedSurveys: Record<string, Survey[]> = { all: surveys };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="hidden lg:block">
          <span className="text-[10px] font-bold text-[#4f46e5] uppercase tracking-widest bg-[#eef2ff] px-2 py-1 rounded">요약 보기</span>
        </div>
        <div className="flex gap-2">
          <button onClick={seedSampleSurvey} className="btn-secondary py-2 border-[#e2e8f0] text-xs">
            <span>샘플 설문 생성</span>
          </button>
          <Link to="/admin/builder" className="btn-primary py-2 text-xs">
            <Plus size={16} />
            <span>새 설문 만들기</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Total Respondents Card */}
        <div className="col-span-12 lg:col-span-4 bento-card min-h-[180px] shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold text-[#64748b]">총 참여자수</span>
            <div className="p-2 bg-[#f8fafc] rounded-lg">
              <BarChart3 size={14} className="text-[#4f46e5]" />
            </div>
          </div>
          <div className="text-4xl font-bold text-[#0f172a]">{totalRespondents}명</div>
          <div className="mt-auto flex items-end gap-1 h-12">
            {[40, 60, 100, 80, 70, 90, 85].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm bg-[#eef2ff]" style={{ height: totalRespondents > 0 ? `${h}%` : '4px', backgroundColor: (i === 2 && totalRespondents > 0) ? '#4f46e5' : undefined }}></div>
            ))}
          </div>
        </div>

        {/* Survey List Card */}
        <div className="col-span-12 bento-card shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold text-[#64748b]">
              전체 설문 및 데이터 추출
            </h3>
          </div>
          
          <div className="space-y-6 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
            {loading ? (
              <div className="py-20 text-center text-[#94a3b8] italic">데이터를 불러오는 중...</div>
            ) : surveys.length === 0 ? (
              <div className="py-20 text-center text-[#94a3b8] italic text-sm">생성된 설문이 없습니다. "새 설문 만들기" 버튼을 클릭하세요.</div>
            ) : (
              surveys.map((survey: Survey) => (
                <div key={survey.id} className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-[#f8fafc] rounded-[32px] hover:bg-white hover:ring-1 hover:ring-[#4f46e5]/10 hover:shadow-md transition-all group border border-transparent mb-4 last:mb-0">
                  <div className="flex flex-col gap-1 max-w-full md:max-w-[40%] mb-4 md:mb-0">
                    <Link to={`/admin/analytics/${survey.id}`} className="font-bold text-base text-[#1e293b] truncate hover:text-[#4f46e5] transition-colors">{survey.title}</Link>
                    <div className="flex items-center gap-2 text-[10px] text-[#64748b]">
                       <span className="font-black text-[#4f46e5] bg-[#eef2ff] px-2 py-0.5 rounded-lg">{survey.respondentCount || 0}명 참여</span>
                       <span className="opacity-30">•</span>
                       <span className="font-bold text-[#64748b]">{survey.questions?.length || 0}개 문항</span>
                       <span className="opacity-30">•</span>
                       <span>{new Date(survey.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-white p-1 rounded-xl border border-[#e2e8f0] shadow-sm items-center">
                       <Link to={`/admin/builder/${survey.id}`} className="p-2 hover:bg-[#f1f5f9] rounded-lg text-[#64748b] transition-colors" title="수정"><Edit3 size={16} /></Link>
                       <Link to={`/admin/analytics/${survey.id}`} className="p-2 hover:bg-[#eef2ff] rounded-lg text-[#4f46e5] transition-colors" title="분석 리포트 가기"><BarChart3 size={16} /></Link>
                       <button 
                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(survey.id); }} 
                         className="p-2 hover:bg-[#eef2ff] rounded-lg text-[#4f46e5] transition-colors" 
                         title="공유하기"
                       >
                         <Share2 size={16} />
                       </button>
                    </div>

                    <div className="flex gap-2">
                      <button 
                         onClick={() => exportExcel(survey)}
                         className="px-4 py-2 bg-white border border-[#e2e8f0] rounded-xl text-[10px] font-black text-[#166534] hover:bg-[#dcfce7] hover:border-[#166534]/20 transition-all flex items-center gap-1.5"
                      >
                        <FileSpreadsheet size={13} />
                        엑셀 추출
                      </button>
                      <Link 
                         to={`/admin/analytics/${survey.id}`}
                         className="px-4 py-2 bg-[#0f172a] rounded-xl text-[10px] font-black text-white hover:bg-black transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <FileText size={13} />
                        PDF 리포트
                      </Link>
                    </div>

                    <div className="w-px h-6 bg-[#e2e8f0] mx-1 hidden md:block"></div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicateSurvey(survey); }} 
                        className="p-2 hover:bg-[#f1f5f9] rounded-lg text-[#94a3b8] transition-colors" 
                        title="설문 복제"
                      >
                        <Plus size={16} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.preventDefault(); 
                          e.stopPropagation(); 
                          deleteSurvey(survey.id); 
                        }} 
                        className="p-2 hover:bg-[#fff1f2] rounded-lg text-[#f43f5e] transition-colors" 
                        title="설문 삭제"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {isShareModalOpen && sharingSurveyId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-[#0f172a]/60 backdrop-blur-sm"
            onClick={() => setIsShareModalOpen(false)}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#f1f5f9]">
              <div>
                <h2 className="text-xl font-bold text-[#1e293b]">설문 공유하기</h2>
                <p className="text-sm text-[#64748b]">학습자에게 배포하거나 미리 확인해 보세요.</p>
              </div>
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="p-2 hover:bg-[#f1f5f9] rounded-xl text-[#94a3b8] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Link Section */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest">배포 링크</label>
                <div className="flex gap-2 p-2 bg-[#f8fafc] rounded-2xl border border-[#e2e8f0]">
                  <input 
                    readOnly 
                    value={`${window.location.origin}/s/${sharingSurveyId}`}
                    className="flex-1 bg-transparent px-4 text-sm font-mono text-[#475569] outline-none"
                  />
                  <button 
                    onClick={() => copyToClipboard(`${window.location.origin}/s/${sharingSurveyId}`)}
                    className="btn-primary py-2 px-6 text-xs whitespace-nowrap"
                  >
                    <LinkIcon size={14} />
                    복사하기
                  </button>
                  <Link 
                    to={`/s/${sharingSurveyId}`}
                    className="btn-secondary py-2 border-[#e2e8f0] text-xs px-4 flex items-center gap-2"
                  >
                    <ExternalLink size={14} />
                    바로가기
                  </Link>
                </div>
              </div>

              {/* Preview Section */}
              <div className="space-y-3 flex flex-col flex-1 min-h-[400px]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest">학습자용 미리보기</label>
                  <span className="text-[10px] text-[#4f46e5] font-medium bg-[#eef2ff] px-2 py-0.5 rounded-full ring-1 ring-[#4f46e5]/10">실시간 미리보기</span>
                </div>
                <div className="flex-1 bg-[#f1f5f9] rounded-2xl border-4 border-[#e2e8f0] overflow-hidden shadow-inner flex flex-col">
                  {/* Browser Mockup Bar */}
                  <div className="bg-[#e2e8f0] px-4 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                    </div>
                    <div className="bg-white/50 px-3 py-1 rounded text-[10px] text-[#64748b] flex-1 truncate text-center">
                      {window.location.host}/s/{sharingSurveyId}
                    </div>
                  </div>
                  {/* Actual Iframe */}
                  <iframe 
                    src={`/s/${sharingSurveyId}`}
                    className="flex-1 w-full border-none bg-white"
                    title="Respondent Preview"
                  />
                  <div className="bg-white/80 backdrop-blur-sm p-3 text-center border-t border-[#f1f5f9]">
                    <p className="text-[11px] text-[#64748b]">이곳은 미리보기 화면입니다. 실제 응답은 위 배포 링크를 통해 가능합니다.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-[#f8fafc] border-t border-[#f1f5f9] flex justify-end">
               <button 
                onClick={() => setIsShareModalOpen(false)}
                className="btn-secondary px-8 py-2.5 text-sm border-[#e2e8f0]"
               >
                 닫기
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
