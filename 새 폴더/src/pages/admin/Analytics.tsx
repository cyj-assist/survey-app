import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Survey, SurveyResponse, Question } from '../../types';
import { 
  FileSpreadsheet, FileText, Download, BarChart2, PieChart as PieChartIcon, 
  Table as TableIcon, Settings, ChevronDown, CheckCircle, ArrowLeft,
  Users, BarChart3, Info
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff'];

// Stats calculation helper
const calculateStats = (values: number[]) => {
  if (values.length === 0) return { mean: '0', median: '0' };
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  
  return { 
    mean: mean.toFixed(2), 
    median: median.toFixed(1)
  };
};

export default function Analytics() {
  const { id } = useParams();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'table'>('visual');
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;

    const fetchSurvey = async () => {
      const docSnap = await getDoc(doc(db, 'surveys', id));
      if (docSnap.exists()) setSurvey(docSnap.data() as Survey);
    };

    const q = query(
      collection(db, 'surveys', id, 'responses'),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurveyResponse));
      setResponses(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `surveys/${id}/responses`);
    });

    fetchSurvey();
    return unsubscribe;
  }, [id]);

  const exportExcel = () => {
    if (!survey || responses.length === 0) return;

    const exportData = responses.map(res => {
      const row: any = {
        '응답 ID': res.id,
        '제출 일시': new Date(res.submittedAt).toLocaleString(),
      };
      (survey.questions || []).forEach(q => {
        const ans = res.answers.find(a => a.questionId === q.id);
        row[q.title] = Array.isArray(ans?.value) ? ans.value.join(', ') : ans?.value || '';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Responses");
    XLSX.writeFile(wb, `${survey.title}_결과.xlsx`);
  };

  const exportPDF = async () => {
    if (!survey) return;
    console.log('Starting PDF Export...');
    
    // Switch to visual tab if not active
    if (activeTab !== 'visual') {
      console.log('Switching to visual tab...');
      setActiveTab('visual');
      // Wait for re-render and chart animations to finish
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    if (!reportRef.current) {
      console.error('Report ref not found');
      return;
    }
    
    setIsExporting(true);
    
    // Ensure we are at the top
    const originalScrollPos = window.scrollY;
    window.scrollTo(0, 0);

    const reportElement = reportRef.current;
    const originalStyles: Map<HTMLElement, string> = new Map();
    
    try {
      console.log('Hiding no-print elements...');
      const noPrintElements = document.querySelectorAll('.no-print');
      noPrintElements.forEach(el => (el as HTMLElement).style.setProperty('display', 'none', 'important'));

      // Temporarily expand scrollable areas for full capture (only for text lists)
      const scrollableElements = reportElement.querySelectorAll('.overflow-y-auto');
      
      scrollableElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        // Don't expand charts (they have h-[350px] but aren't .overflow-y-auto usually)
        if (htmlEl.classList.contains('overflow-y-auto')) {
          originalStyles.set(htmlEl, htmlEl.style.cssText);
          htmlEl.style.maxHeight = 'none';
          htmlEl.style.height = 'auto';
          htmlEl.style.overflow = 'visible';
        }
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Page styling settings
      const margin = 10;
      const contentWidth = pdfWidth - (margin * 2);
      let currentY = margin;
      
      const children = Array.from(reportElement.children);
      console.log(`Processing ${children.length} report sections...`);

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        
        // Skip hidden or zero-height elements
        if (child.offsetHeight === 0) continue;

        console.log(`Capturing section ${i + 1}...`);
        
        const canvas = await toCanvas(child, { 
          pixelRatio: 2, 
          backgroundColor: '#ffffff',
          width: child.offsetWidth,
          height: child.offsetHeight,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgProps = pdf.getImageProperties(imgData);
        
        // Scale logic to fit roughly 2 charts per page
        // A4 height is ~297mm. With margins, content area is ~277mm.
        // We want imgHeight to be roughly (277 / 2) - margin
        let imgHeight = (imgProps.height * contentWidth) / imgProps.width;
        
        // If it's a question section (not the header) and too tall, scale it down slightly to fit 2 per page
        const isHeader = i === 0;
        const maxSectionHeight = (pdfHeight - (margin * 4)) / 2; // Roughly half page with bit more space
        
        let drawWidth = contentWidth;
        let drawHeight = imgHeight;
        let drawX = margin;

        if (!isHeader && imgHeight > maxSectionHeight) {
          const scale = maxSectionHeight / imgHeight;
          drawHeight = maxSectionHeight;
          drawWidth = contentWidth * scale;
          drawX = margin + (contentWidth - drawWidth) / 2; // Center horizontally
        }

        // If this element exceeds page height, add a new page
        if (currentY + drawHeight > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        // Add to PDF
        pdf.addImage(imgData, 'JPEG', drawX, currentY, drawWidth, drawHeight, undefined, 'FAST');
        
        // Move Y cursor for next element
        currentY += drawHeight + 10; 
      }

      console.log('Finalizing PDF...');
      pdf.save(`${survey.title}_시각화_리포트.pdf`);
      console.log('PDF Saved successfully');
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('PDF 생성 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      // Restore styles
      originalStyles.forEach((style, el) => {
        el.style.cssText = style;
      });

      const noPrintElements = document.querySelectorAll('.no-print');
      noPrintElements.forEach(el => (el as HTMLElement).style.display = '');
      window.scrollTo(0, originalScrollPos);
      setIsExporting(false);
    }
  };

  if (loading && !survey) return <div className="p-12 text-center animate-pulse">데이터 분석 중...</div>;
  if (!survey) return <div className="p-12 text-center">설문을 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 no-print">
        <div className="flex items-center gap-4">
           <Link to="/admin" className="p-2.5 hover:bg-white rounded-2xl transition-all text-[#64748b] border border-[#e2e8f0] shadow-sm">
              <ArrowLeft size={20} />
           </Link>
           <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-[#0f172a]">{survey?.title}</h2>
              </div>
              <p className="text-sm font-medium text-[#64748b]">수집된 응답: <span className="text-[#4f46e5] font-bold">{responses.length}건</span></p>
           </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="p-2.5 bg-white text-[#64748b] border border-[#e2e8f0] hover:bg-[#f8fafc] text-xs font-bold rounded-2xl flex items-center gap-2 transition-all shadow-sm">
            <Download size={16} />
            Excel
          </button>
          <button 
            onClick={exportPDF} 
            disabled={isExporting}
            className={`p-2.5 text-white py-2 px-6 text-xs font-bold rounded-2xl flex items-center gap-2 shadow-lg transition-all ${isExporting ? 'bg-[#94a3b8] cursor-not-allowed' : 'bg-[#0f172a] hover:bg-black'}`}
          >
            {isExporting ? (
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <Settings size={16} />
              </motion.div>
            ) : (
              <FileText size={16} />
            )}
            {isExporting ? 'PDF 생성 중...' : 'PDF 리포트 다운로드'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Summary */}
        <div className="lg:col-span-3 space-y-6 no-print">
          <div className="bento-card bg-[#4f46e5] text-white overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest block mb-1">Total Responses</span>
              <div className="text-6xl font-black mt-2 tracking-tight flex items-baseline gap-1">
                {responses.length}
                <span className="text-xl font-bold opacity-60">명</span>
              </div>
            </div>
            <Users className="absolute -bottom-6 -right-6 text-white/10 w-32 h-32" />
          </div>

          <div className="bento-card border-[#e2e8f0]">
             <div className="flex items-center gap-2 mb-4 text-[#4f46e5]">
                <BarChart3 size={16} />
                <h3 className="text-xs font-bold uppercase tracking-widest">분석 뷰 전환</h3>
             </div>
             <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => setActiveTab('visual')}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'visual' ? 'bg-[#eef2ff] text-[#4f46e5] border border-[#4f46e5]/20' : 'hover:bg-[#f8fafc] text-[#64748b]'}`}
                >
                  <BarChart2 size={18} />
                  시각화 리포트
                </button>
                <button 
                   onClick={() => setActiveTab('table')}
                   className={`flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'table' ? 'bg-[#eef2ff] text-[#4f46e5] border border-[#4f46e5]/20' : 'hover:bg-[#f8fafc] text-[#64748b]'}`}
                >
                  <TableIcon size={18} />
                  전체 데이터 (Raw)
                </button>
             </div>
          </div>
        </div>

        {/* Dynamic View Section */}
        <div className="lg:col-span-9 print:col-span-12">
          {activeTab === 'visual' ? (
             <div className="space-y-8" ref={reportRef}>
               {/* Analysis Header */}
               <div className="pdf-section pb-12 text-center bg-white p-12 rounded-[40px] border border-[#e2e8f0]/40 shadow-sm relative overflow-hidden grid place-items-center">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#4f46e5] via-[#8b5cf6] to-[#ec4899]"></div>
                  <h1 className="text-4xl font-black text-[#0f172a] mb-3 tracking-tighter">{survey.title}</h1>
                  <div className="flex items-center justify-center gap-2 text-[#64748b] bg-[#f8fafc] px-6 py-2 rounded-2xl border border-[#e2e8f0]/50 shadow-inner">
                    <Users size={18} className="text-[#4f46e5]" />
                    <span className="text-sm font-black tracking-tight uppercase">
                      참여인원: <span className="text-[#0f172a]">{responses.length}명</span> 
                    </span>
                  </div>
               </div>

               {(survey.questions || []).map((q, idx) => (
                 <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: idx * 0.05 }}
                   key={q.id} 
                   className="bento-card border-[#e2e8f0] bg-white p-12 space-y-10 print:break-inside-avoid shadow-sm rounded-[40px]"
                 >
                   <div className="flex items-start gap-6">
                     <div className="w-10 h-10 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl flex items-center justify-center font-black text-[#4f46e5]">
                        {idx + 1}
                     </div>
                     <div className="flex-1">
                       <h3 className="text-2xl font-black tracking-tight text-[#0f172a] mb-2">{q.title}</h3>
                       <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest bg-[#f8fafc] w-fit px-3 py-1 rounded-lg">
                         {responses.filter(r => r.answers.some(a => a.questionId === q.id && a.value)).length} out of {responses.length} people answered this question.
                       </p>
                     </div>
                   </div>

                   {/* Quantitative View */}
                   {(q.type === 'single' || q.type === 'ox' || q.type === 'multiple' || q.type === 'scale') && (
                     <>
                        <QuantitativeStats question={q} responses={responses} />
                        <div className="h-[350px] w-full pt-4 rounded-[32px] overflow-hidden relative">
                          <ChartSection question={q} responses={responses} isExporting={isExporting} />
                        </div>
                     </>
                   )}

                   {/* Qualitative View */}
                   {(q.type === 'short' || q.type === 'long') && (
                     <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[#4f46e5] mb-2">
                           <div className="w-1 h-3 bg-current rounded-full"></div>
                           <span className="text-[10px] font-black uppercase tracking-widest">주관식 응답 내용</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                         {(() => {
                            const rawResponses = responses
                              .map(res => res.answers.find(a => a.questionId === q.id)?.value)
                              .filter(v => v)
                              .map(v => String(v).trim());

                            if (rawResponses.length === 0) {
                              return <div className="text-center py-10 italic text-[#94a3b8] text-sm">기록된 응답이 없습니다.</div>;
                            }

                            // Smarter grouping: group by normalized similarity
                            const groups: { text: string; count: number }[] = [];
                            
                            rawResponses.forEach(resp => {
                              const normalized = resp.toLowerCase().replace(/\s+/g, '');
                              const existingGroup = groups.find(g => {
                                const gNorm = g.text.toLowerCase().replace(/\s+/g, '');
                                return (normalized.startsWith(gNorm.substring(0, 10)) || gNorm.startsWith(normalized.substring(0, 10))) ||
                                       (normalized.length > 5 && gNorm.includes(normalized)) ||
                                       (gNorm.length > 5 && normalized.includes(gNorm));
                              });

                              if (existingGroup) {
                                existingGroup.count++;
                              } else {
                                groups.push({ text: resp, count: 1 });
                              }
                            });
                            
                            return groups.sort((a, b) => b.count - a.count).map((group, i) => (
                               <div key={i} className="p-3.5 bg-[#f8fafc] border border-[#e2e8f0]/40 rounded-xl text-sm font-bold text-[#1e293b] leading-snug shadow-sm border-l-4 border-l-[#4f46e5] italic">
                                 "{group.text}" {group.count > 1 && <span className="text-[#4f46e5] font-black ml-2 text-[10px]">(외 유사의견 {group.count - 1}건)</span>}
                               </div>
                            ));
                         })()}
                        </div>
                     </div>
                   )}
                 </motion.div>
               ))}
               
               <div className="pt-20 pb-10 text-center opacity-20 font-black text-4xl tracking-tighter uppercase grayscale mix-blend-multiply">
                 End of Report
               </div>
             </div>
          ) : (
            <div className="bento-card p-0 overflow-hidden border-[#e2e8f0]">
              <div className="p-6 border-b border-[#f1f5f9] flex items-center justify-between bg-[#f8fafc]">
                <div className="flex items-center gap-2 text-[#4f46e5]">
                   <TableIcon size={16} />
                   <span className="text-xs font-bold uppercase tracking-widest mt-0.5">Raw Data Analysis</span>
                </div>
                <span className="bg-[#dcfce7] text-[#166534] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter">Verified Aggregate</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[800px]">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-[#f8fafc] text-[#64748b] sticky top-0 z-10">
                    <tr className="border-b border-[#f1f5f9]">
                      <th className="p-5 font-bold uppercase tracking-wider">응답자 ID</th>
                      <th className="p-5 font-bold uppercase tracking-wider">제출 일시</th>
                      <th className="p-5 font-bold uppercase tracking-wider">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {responses.map(res => (
                      <tr key={res.id} className="hover:bg-[#f1f5f9]/40 transition-colors">
                        <td className="p-5 font-mono text-[#94a3b8]">{res.respondentId}</td>
                        <td className="p-5 text-[#0f172a] font-bold">{new Date(res.submittedAt).toLocaleString()}</td>
                        <td className="p-5">
                           <div className="flex items-center gap-1.5 text-[#22c55e] font-bold bg-[#dcfce7]/50 w-fit px-2 py-0.5 rounded-lg text-[9px] uppercase">
                              <CheckCircle size={10} />
                              <span>Completed</span>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuantitativeStats({ question, responses }: { question: Question; responses: SurveyResponse[] }) {
  // Only calculate stats if options are numbers (like rating scale 1-5)
  const isRatingScale = question.options?.every(opt => !isNaN(Number(opt)));
  const isOX = question.type === 'ox';
  
  if (!isRatingScale && !isOX) return null;

  const values: number[] = [];
  responses.forEach(res => {
    const ans = res.answers.find(a => a.questionId === question.id);
    if (ans?.value !== undefined) {
      if (isOX) {
        return;
      } else {
        const val = Number(ans.value);
        if (!isNaN(val)) values.push(val);
      }
    }
  });

  if (values.length === 0) return null;

  const stats = calculateStats(values);

  return (
    <div className="grid grid-cols-2 gap-6 mb-4">
      <div className="bg-[#f8fafc] p-6 rounded-[32px] border border-[#e2e8f0]/60 text-center shadow-inner">
        <span className="text-[10px] font-black text-[#94a3b8] uppercase tracking-widest block mb-2">Mean</span>
        <div className="text-3xl font-black text-[#0f172a]">{stats.mean}</div>
      </div>
      <div className="bg-[#f8fafc] p-6 rounded-[32px] border border-[#e2e8f0]/60 text-center shadow-inner">
        <span className="text-[10px] font-black text-[#94a3b8] uppercase tracking-widest block mb-2">Median</span>
        <div className="text-3xl font-black text-[#0f172a]">{stats.median}</div>
      </div>
    </div>
  );
}

function ChartSection({ question, responses, isExporting }: { question: Question; responses: SurveyResponse[]; isExporting?: boolean }) {
  const counts: Record<string, number> = {};
  
  if (question.type === 'ox') {
    counts['O'] = 0;
    counts['X'] = 0;
  } else if (question.options) {
    question.options.forEach(opt => counts[opt] = 0);
  }

  responses.forEach(res => {
    const ans = res.answers.find(a => a.questionId === question.id);
    if (ans?.value !== undefined) {
      if (Array.isArray(ans.value)) {
        ans.value.forEach(v => counts[String(v)] = (counts[String(v)] || 0) + 1);
      } else if (typeof ans.value === 'boolean') {
        const key = ans.value ? 'O' : 'X';
        counts[key] = (counts[key] || 0) + 1;
      } else {
        counts[String(ans.value)] = (counts[String(ans.value)] || 0) + 1;
      }
    }
  });

  const chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 35, right: 30, left: 10, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis 
          dataKey="name" 
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} 
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} 
        />
        <Tooltip 
          cursor={{ fill: '#f8fafc', radius: 12 }}
          contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold', padding: '12px' }} 
        />
        <Bar 
          dataKey="value" 
          fill="#d8b4fe" 
          radius={[12, 12, 0, 0]} 
          maxBarSize={60}
          isAnimationActive={!isExporting}
        >
          <LabelList 
             dataKey="value" 
             position="top" 
             offset={10}
             style={{ fill: '#0f172a', fontSize: 14, fontWeight: 900 }} 
          />
          {chartData.map((_, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={COLORS[index % COLORS.length]} 
              fillOpacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
